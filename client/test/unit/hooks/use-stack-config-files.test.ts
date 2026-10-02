import {beforeEach, describe, expect, it, vi} from "vitest";
import {act, renderHook, waitFor} from "@testing-library/react";
import {useStackConfigFiles} from "@/hooks/use-stack-config-files";
import {getComposeContent, getEnvContent, previewStackChange, updateStack} from "@/lib/stacks-api";
import {ApiError} from "@/lib/api";

vi.mock("@/lib/stacks-api", () => ({
    getComposeContent: vi.fn(),
    getEnvContent: vi.fn(),
    updateStack: vi.fn(),
    previewStackChange: vi.fn(),
}));

// Issue #18/D-01: the hook drives toast.loading/success/error/dismiss
// directly (not toast.promise) so the 428 re-review path can resolve with
// neither a success nor an error toast — mock each as a plain spy.
vi.mock("sonner", () => ({
    toast: {
        loading: vi.fn(() => "toast-id"),
        success: vi.fn(),
        error: vi.fn(),
        dismiss: vi.fn(),
    },
}));

const mockGetComposeContent = vi.mocked(getComposeContent);
const mockGetEnvContent = vi.mocked(getEnvContent);
const mockUpdateStack = vi.mocked(updateStack);
const mockPreviewStackChange = vi.mocked(previewStackChange);

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return {promise, resolve, reject};
}

const NO_CHANGE_PREVIEW = {hasChanges: false, confirmationRequired: false, compose: null, env: null};

function changePreview(file: "compose" | "env") {
    const diff = {hunks: [{oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: []}], added: 1, removed: 1};
    return {
        hasChanges: true,
        confirmationRequired: true,
        compose: file === "compose" ? diff : null,
        env: file === "env" ? diff : null,
    };
}

beforeEach(async () => {
    mockGetComposeContent.mockReset();
    mockGetEnvContent.mockReset();
    mockUpdateStack.mockReset();
    mockPreviewStackChange.mockReset();
    mockGetComposeContent.mockResolvedValue({content: "services:\n  web:\n    image: nginx\n"});
    mockGetEnvContent.mockResolvedValue({content: "FOO=bar"});
    mockPreviewStackChange.mockResolvedValue(NO_CHANGE_PREVIEW);

    const {toast} = await import("sonner");
    vi.mocked(toast.loading).mockReset().mockReturnValue("toast-id" as any);
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
    vi.mocked(toast.dismiss).mockReset();
});

describe("useStackConfigFiles", () => {
    it("loads compose and env content on mount", async () => {
        const onSaved = vi.fn();
        const {result} = renderHook(() => useStackConfigFiles("my-app", "hash-1", onSaved));

        await waitFor(() =>
            expect(result.current.composeContent).toBe("services:\n  web:\n    image: nginx\n"),
        );
        expect(result.current.envContent).toBe("FOO=bar");
        expect(mockGetComposeContent).toHaveBeenCalledWith("my-app");
        expect(mockGetEnvContent).toHaveBeenCalledWith("my-app");
    });

    it("setComposeContent marks composeDirty (and isDirty)", async () => {
        const onSaved = vi.fn();
        const {result} = renderHook(() => useStackConfigFiles("my-app", "hash-1", onSaved));
        await waitFor(() => expect(result.current.composeContent).not.toBe(""));

        act(() => {
            result.current.setComposeContent("services:\n  web:\n    image: nginx:1.2\n");
        });

        expect(result.current.composeDirty).toBe(true);
        expect(result.current.isDirty).toBe(true);
        expect(result.current.envDirty).toBe(false);
    });

    it("setEnvContent marks envDirty (and isDirty)", async () => {
        const onSaved = vi.fn();
        const {result} = renderHook(() => useStackConfigFiles("my-app", "hash-1", onSaved));
        await waitFor(() => expect(result.current.envContent).not.toBe(""));

        act(() => {
            result.current.setEnvContent("FOO=baz");
        });

        expect(result.current.envDirty).toBe(true);
        expect(result.current.isDirty).toBe(true);
        expect(result.current.composeDirty).toBe(false);
    });

    describe("Issue #18/D-01/D-03: review-before-apply", () => {
        it("saveCompose previews first; when confirmationRequired, opens review and never calls updateStack directly", async () => {
            const onSaved = vi.fn();
            mockPreviewStackChange.mockResolvedValue(changePreview("compose"));
            const {result} = renderHook(() => useStackConfigFiles("my-app", "hash-1", onSaved));
            await waitFor(() => expect(result.current.composeContent).not.toBe(""));

            act(() => result.current.setComposeContent("services:\n  web:\n    image: nginx:1.2\n"));

            await act(async () => {
                result.current.saveCompose();
                await Promise.resolve();
                await Promise.resolve();
            });

            await waitFor(() => expect(result.current.review).not.toBeNull());
            expect(result.current.review).toEqual({file: "compose", preview: changePreview("compose")});
            expect(mockUpdateStack).not.toHaveBeenCalled();
            expect(mockPreviewStackChange).toHaveBeenCalledWith("my-app", {
                composeContent: "services:\n  web:\n    image: nginx:1.2\n",
            });
        });

        it("confirmReview() calls updateStack with confirmed: true and the previewed content, clears dirty, calls onSaved", async () => {
            const onSaved = vi.fn();
            mockPreviewStackChange.mockResolvedValue(changePreview("compose"));
            mockUpdateStack.mockResolvedValue({} as any);
            const {result} = renderHook(() => useStackConfigFiles("my-app", "hash-1", onSaved));
            await waitFor(() => expect(result.current.composeContent).not.toBe(""));

            act(() => result.current.setComposeContent("services:\n  web:\n    image: nginx:1.2\n"));
            await act(async () => {
                result.current.saveCompose();
                await Promise.resolve();
                await Promise.resolve();
            });
            await waitFor(() => expect(result.current.review).not.toBeNull());

            await act(async () => {
                result.current.confirmReview();
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(mockUpdateStack).toHaveBeenCalledWith("my-app", {
                composeContent: "services:\n  web:\n    image: nginx:1.2\n",
                confirmed: true,
            });
            await waitFor(() => expect(result.current.composeDirty).toBe(false));
            await waitFor(() => expect(result.current.review).toBeNull());
            expect(onSaved).toHaveBeenCalledTimes(1);
        });

        it("cancelReview() clears review, keeps composeDirty true, never calls updateStack", async () => {
            const onSaved = vi.fn();
            mockPreviewStackChange.mockResolvedValue(changePreview("compose"));
            const {result} = renderHook(() => useStackConfigFiles("my-app", "hash-1", onSaved));
            await waitFor(() => expect(result.current.composeContent).not.toBe(""));

            act(() => result.current.setComposeContent("services:\n  web:\n    image: nginx:1.2\n"));
            await act(async () => {
                result.current.saveCompose();
                await Promise.resolve();
                await Promise.resolve();
            });
            await waitFor(() => expect(result.current.review).not.toBeNull());

            act(() => result.current.cancelReview());

            expect(result.current.review).toBeNull();
            expect(result.current.composeDirty).toBe(true);
            expect(mockUpdateStack).not.toHaveBeenCalled();
        });

        it("saveCompose applies directly with no review when the preview reports confirmationRequired: false", async () => {
            const onSaved = vi.fn();
            mockPreviewStackChange.mockResolvedValue(NO_CHANGE_PREVIEW);
            mockUpdateStack.mockResolvedValue({} as any);
            const {result} = renderHook(() => useStackConfigFiles("my-app", "hash-1", onSaved));
            await waitFor(() => expect(result.current.composeContent).not.toBe(""));

            act(() => result.current.setComposeContent("services:\n  web:\n    image: nginx\n"));
            await act(async () => {
                result.current.saveCompose();
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(result.current.review).toBeNull();
            expect(mockUpdateStack).toHaveBeenCalledWith("my-app", {
                composeContent: "services:\n  web:\n    image: nginx\n",
            });
            await waitFor(() => expect(result.current.composeDirty).toBe(false));
            expect(onSaved).toHaveBeenCalledTimes(1);
        });

        it("saveCompose direct-apply failure (no-op preview) leaves composeDirty true and does not call onSaved", async () => {
            const onSaved = vi.fn();
            mockPreviewStackChange.mockResolvedValue(NO_CHANGE_PREVIEW);
            mockUpdateStack.mockRejectedValue(new Error("boom"));
            const {result} = renderHook(() => useStackConfigFiles("my-app", "hash-1", onSaved));
            await waitFor(() => expect(result.current.composeContent).not.toBe(""));

            act(() => result.current.setComposeContent("bad yaml"));
            await act(async () => {
                result.current.saveCompose();
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(result.current.composeDirty).toBe(true);
            expect(onSaved).not.toHaveBeenCalled();
        });

        it("sets reviewPending true while the preview request is in flight, then false", async () => {
            const onSaved = vi.fn();
            const preview = deferred<ReturnType<typeof changePreview>>();
            mockPreviewStackChange.mockReturnValueOnce(preview.promise as any);
            const {result} = renderHook(() => useStackConfigFiles("my-app", "hash-1", onSaved));
            await waitFor(() => expect(result.current.composeContent).not.toBe(""));

            act(() => result.current.setComposeContent("changed"));
            act(() => {
                result.current.saveCompose();
            });

            await waitFor(() => expect(result.current.reviewPending).toBe(true));

            await act(async () => {
                preview.resolve(NO_CHANGE_PREVIEW);
                await preview.promise;
            });

            await waitFor(() => expect(result.current.reviewPending).toBe(false));
        });

        it("toasts an error and leaves the file dirty when the preview request itself fails", async () => {
            const onSaved = vi.fn();
            mockPreviewStackChange.mockRejectedValue(new Error("network down"));
            const {toast} = await import("sonner");
            const {result} = renderHook(() => useStackConfigFiles("my-app", "hash-1", onSaved));
            await waitFor(() => expect(result.current.composeContent).not.toBe(""));

            act(() => result.current.setComposeContent("changed"));
            await act(async () => {
                result.current.saveCompose();
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(result.current.composeDirty).toBe(true);
            expect(toast.error).toHaveBeenCalledWith(
                "Couldn't review the compose file — network down. Try again.",
            );
            expect(mockUpdateStack).not.toHaveBeenCalled();
        });

        it("confirmReview() re-runs the preview and reopens the review on a 428, without toasting an error", async () => {
            const onSaved = vi.fn();
            mockPreviewStackChange.mockResolvedValue(changePreview("compose"));
            mockUpdateStack.mockRejectedValue(new ApiError("Changes must be reviewed and confirmed", 428));
            const {toast} = await import("sonner");
            const {result} = renderHook(() => useStackConfigFiles("my-app", "hash-1", onSaved));
            await waitFor(() => expect(result.current.composeContent).not.toBe(""));

            act(() => result.current.setComposeContent("services:\n  web:\n    image: nginx:1.2\n"));
            await act(async () => {
                result.current.saveCompose();
                await Promise.resolve();
                await Promise.resolve();
            });
            await waitFor(() => expect(result.current.review).not.toBeNull());

            // A second preview call (the retry) returns a fresh diff.
            mockPreviewStackChange.mockResolvedValue(changePreview("compose"));

            await act(async () => {
                result.current.confirmReview();
                await Promise.resolve();
                await Promise.resolve();
                await Promise.resolve();
            });

            await waitFor(() => expect(mockPreviewStackChange).toHaveBeenCalledTimes(2));
            expect(result.current.review).not.toBeNull();
            expect(toast.error).not.toHaveBeenCalled();
            expect(onSaved).not.toHaveBeenCalled();
        });

        it("confirmReview() shows the generic error toast (not a retry) for a non-428 rejection, leaving the file dirty", async () => {
            const onSaved = vi.fn();
            mockPreviewStackChange.mockResolvedValue(changePreview("compose"));
            mockUpdateStack.mockRejectedValue(new Error("server exploded"));
            const {toast} = await import("sonner");
            const {result} = renderHook(() => useStackConfigFiles("my-app", "hash-1", onSaved));
            await waitFor(() => expect(result.current.composeContent).not.toBe(""));

            act(() => result.current.setComposeContent("services:\n  web:\n    image: nginx:1.2\n"));
            await act(async () => {
                result.current.saveCompose();
                await Promise.resolve();
                await Promise.resolve();
            });
            await waitFor(() => expect(result.current.review).not.toBeNull());

            await act(async () => {
                result.current.confirmReview();
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(toast.error).toHaveBeenCalledWith(
                "Couldn't save compose file — server exploded. Try again.",
                {id: "toast-id"},
            );
            expect(result.current.composeDirty).toBe(true);
            expect(onSaved).not.toHaveBeenCalled();
        });
    });

    it("saveEnv success clears envDirty and calls onSaved exactly once", async () => {
        const onSaved = vi.fn();
        mockUpdateStack.mockResolvedValue({} as any);
        const {result} = renderHook(() => useStackConfigFiles("my-app", "hash-1", onSaved));
        await waitFor(() => expect(result.current.envContent).not.toBe(""));

        act(() => result.current.setEnvContent("FOO=baz"));

        await act(async () => {
            result.current.saveEnv();
            await Promise.resolve();
            await Promise.resolve();
        });

        await waitFor(() => expect(result.current.envDirty).toBe(false));
        expect(onSaved).toHaveBeenCalledTimes(1);
        expect(mockUpdateStack).toHaveBeenCalledWith("my-app", {envContent: "FOO=baz"});
    });

    it("saveEnv failure leaves envDirty true and does not call onSaved", async () => {
        const onSaved = vi.fn();
        mockUpdateStack.mockRejectedValue(new Error("boom"));
        const {result} = renderHook(() => useStackConfigFiles("my-app", "hash-1", onSaved));
        await waitFor(() => expect(result.current.envContent).not.toBe(""));

        act(() => result.current.setEnvContent("BAD"));

        await act(async () => {
            result.current.saveEnv();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(result.current.envDirty).toBe(true);
        expect(onSaved).not.toHaveBeenCalled();
    });

    it("a lastKnownHash change re-fetches only the non-dirty file", async () => {
        const onSaved = vi.fn();
        const {result, rerender} = renderHook(
            ({hash}) => useStackConfigFiles("my-app", hash, onSaved),
            {initialProps: {hash: "hash-1"}},
        );
        await waitFor(() => expect(result.current.composeContent).not.toBe(""));

        act(() => result.current.setComposeContent("dirty compose"));
        mockGetComposeContent.mockClear();
        mockGetEnvContent.mockClear();
        mockGetEnvContent.mockResolvedValue({content: "FOO=updated"});

        rerender({hash: "hash-2"});

        await waitFor(() => expect(mockGetEnvContent).toHaveBeenCalledWith("my-app"));
        expect(mockGetComposeContent).not.toHaveBeenCalled();
        expect(result.current.composeContent).toBe("dirty compose");
        await waitFor(() => expect(result.current.envContent).toBe("FOO=updated"));
    });

    it("discards a late-arriving load response for a file that became dirty while the request was in flight", async () => {
        const onSaved = vi.fn();
        const composeLoad = deferred<{content: string}>();
        mockGetComposeContent.mockReturnValueOnce(composeLoad.promise);

        const {result} = renderHook(() => useStackConfigFiles("my-app", "hash-1", onSaved));
        await waitFor(() => expect(result.current.envContent).not.toBe(""));

        // The user starts typing before the in-flight compose load resolves.
        act(() => result.current.setComposeContent("user typed this"));

        await act(async () => {
            composeLoad.resolve({content: "stale content from disk"});
            await composeLoad.promise;
        });

        expect(result.current.composeContent).toBe("user typed this");
        expect(result.current.composeDirty).toBe(true);
    });

    describe("unsavedSummary (11-10 unsaved-changes guard)", () => {
        it("is null when nothing is dirty", async () => {
            const {result} = renderHook(() => useStackConfigFiles("my-app", "hash-1", vi.fn()));
            await waitFor(() => expect(result.current.composeContent).not.toBe(""));

            expect(result.current.unsavedSummary).toBeNull();
        });

        it("names the compose file when only compose is dirty", async () => {
            const {result} = renderHook(() => useStackConfigFiles("my-app", "hash-1", vi.fn()));
            await waitFor(() => expect(result.current.composeContent).not.toBe(""));

            act(() => result.current.setComposeContent("services: {}"));

            expect(result.current.unsavedSummary).toBe("the compose file");
        });

        it("names the environment variables when only env is dirty", async () => {
            const {result} = renderHook(() => useStackConfigFiles("my-app", "hash-1", vi.fn()));
            await waitFor(() => expect(result.current.envContent).not.toBe(""));

            act(() => result.current.setEnvContent("FOO=baz"));

            expect(result.current.unsavedSummary).toBe("the environment variables");
        });

        it("names both files when both are dirty", async () => {
            const {result} = renderHook(() => useStackConfigFiles("my-app", "hash-1", vi.fn()));
            await waitFor(() => expect(result.current.composeContent).not.toBe(""));

            act(() => {
                result.current.setComposeContent("services: {}");
                result.current.setEnvContent("FOO=baz");
            });

            expect(result.current.unsavedSummary).toBe("the compose file and environment variables");
        });
    });
});
