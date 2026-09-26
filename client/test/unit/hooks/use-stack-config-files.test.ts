import {beforeEach, describe, expect, it, vi} from "vitest";
import {act, renderHook, waitFor} from "@testing-library/react";
import {useStackConfigFiles} from "@/hooks/use-stack-config-files";
import {getComposeContent, getEnvContent, updateStack} from "@/lib/stacks-api";

vi.mock("@/lib/stacks-api", () => ({
    getComposeContent: vi.fn(),
    getEnvContent: vi.fn(),
    updateStack: vi.fn(),
}));

// Mirrors the pattern used across this codebase's toast.promise call sites
// (e.g. use-stack.test.ts, service-upgrade-dialog.test.tsx): resolve/reject
// the underlying promise and invoke sonner's success/error callbacks
// directly, without needing a mounted <Toaster/>.
vi.mock("sonner", () => ({
    toast: {
        promise: vi.fn((promise: Promise<unknown>, opts: any) => {
            promise.then(
                (result) => {
                    if (typeof opts.success === "function") opts.success(result);
                },
                (err) => {
                    if (typeof opts.error === "function") opts.error(err);
                },
            );
            return promise.catch(() => {});
        }),
    },
}));

const mockGetComposeContent = vi.mocked(getComposeContent);
const mockGetEnvContent = vi.mocked(getEnvContent);
const mockUpdateStack = vi.mocked(updateStack);

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return {promise, resolve, reject};
}

beforeEach(() => {
    mockGetComposeContent.mockReset();
    mockGetEnvContent.mockReset();
    mockUpdateStack.mockReset();
    mockGetComposeContent.mockResolvedValue({content: "services:\n  web:\n    image: nginx\n"});
    mockGetEnvContent.mockResolvedValue({content: "FOO=bar"});
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

    it("saveCompose success clears composeDirty and calls onSaved exactly once", async () => {
        const onSaved = vi.fn();
        mockUpdateStack.mockResolvedValue({} as any);
        const {result} = renderHook(() => useStackConfigFiles("my-app", "hash-1", onSaved));
        await waitFor(() => expect(result.current.composeContent).not.toBe(""));

        act(() => result.current.setComposeContent("services:\n  web:\n    image: nginx:1.2\n"));
        expect(result.current.composeDirty).toBe(true);

        await act(async () => {
            result.current.saveCompose();
            await Promise.resolve();
            await Promise.resolve();
        });

        await waitFor(() => expect(result.current.composeDirty).toBe(false));
        expect(onSaved).toHaveBeenCalledTimes(1);
        expect(mockUpdateStack).toHaveBeenCalledWith("my-app", {
            composeContent: "services:\n  web:\n    image: nginx:1.2\n",
        });
    });

    it("saveCompose failure leaves composeDirty true and does not call onSaved", async () => {
        const onSaved = vi.fn();
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
});
