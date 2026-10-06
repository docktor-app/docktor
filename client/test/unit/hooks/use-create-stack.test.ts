import {beforeEach, describe, expect, it, vi} from "vitest";
import {act, renderHook, waitFor} from "@testing-library/react";
import type {CreateStackInput} from "@docktor/shared";
import {useCreateStack} from "@/hooks/use-create-stack";
import {previewNewStack} from "@/lib/stacks-api";
import {ApiError} from "@/lib/api";

vi.mock("@/lib/stacks-api", () => ({
    previewNewStack: vi.fn(),
}));

const mockPreviewNewStack = vi.mocked(previewNewStack);

const CLEAN_PREVIEW = {confirmationRequired: false, findings: [], composeParseError: null};

function dangerPreview() {
    return {
        confirmationRequired: true,
        findings: [
            {
                ruleId: "privileged" as const,
                severity: "danger" as const,
                message: "Service web has privileged: true",
                serviceName: "web",
                path: [],
                line: 4,
                introduced: true,
            },
        ],
        composeParseError: null,
    };
}

function values(overrides: Partial<CreateStackInput> = {}): CreateStackInput {
    return {
        displayName: "My Stack",
        description: "",
        composeContent: "services:\n  web:\n    image: nginx\n",
        envContent: "",
        ...overrides,
    };
}

beforeEach(() => {
    mockPreviewNewStack.mockReset();
});

describe("useCreateStack", () => {
    it("creates directly and calls onCreated when the preview requires no confirmation", async () => {
        mockPreviewNewStack.mockResolvedValue(CLEAN_PREVIEW);
        const create = vi.fn().mockResolvedValue({id: "new-stack"});
        const onCreated = vi.fn();

        const {result} = renderHook(() => useCreateStack({create, onCreated}));
        act(() => result.current.submit(values()));

        await waitFor(() => expect(onCreated).toHaveBeenCalledWith("new-stack"));
        expect(create).toHaveBeenCalledWith(values());
        expect(result.current.review).toBeNull();
    });

    it("opens the review and does not call create when the preview requires confirmation", async () => {
        const preview = dangerPreview();
        mockPreviewNewStack.mockResolvedValue(preview);
        const create = vi.fn();
        const onCreated = vi.fn();

        const {result} = renderHook(() => useCreateStack({create, onCreated}));
        act(() => result.current.submit(values()));

        await waitFor(() => expect(result.current.review).not.toBeNull());
        expect(result.current.review?.preview).toEqual(preview);
        expect(result.current.review?.values).toEqual(values());
        expect(create).not.toHaveBeenCalled();
        expect(onCreated).not.toHaveBeenCalled();
    });

    it("confirmReview creates with confirmed: true and clears the review", async () => {
        mockPreviewNewStack.mockResolvedValue(dangerPreview());
        const create = vi.fn().mockResolvedValue({id: "new-stack"});
        const onCreated = vi.fn();

        const {result} = renderHook(() => useCreateStack({create, onCreated}));
        act(() => result.current.submit(values()));
        await waitFor(() => expect(result.current.review).not.toBeNull());

        act(() => result.current.confirmReview());

        await waitFor(() => expect(onCreated).toHaveBeenCalledWith("new-stack"));
        expect(create).toHaveBeenCalledWith({...values(), confirmed: true});
        expect(result.current.review).toBeNull();
    });

    it("cancelReview clears the review without calling create", async () => {
        mockPreviewNewStack.mockResolvedValue(dangerPreview());
        const create = vi.fn();
        const onCreated = vi.fn();

        const {result} = renderHook(() => useCreateStack({create, onCreated}));
        act(() => result.current.submit(values()));
        await waitFor(() => expect(result.current.review).not.toBeNull());

        act(() => result.current.cancelReview());

        expect(result.current.review).toBeNull();
        expect(create).not.toHaveBeenCalled();
    });

    it("re-opens the review on a 428 from create even though the preview said no confirmation was required", async () => {
        mockPreviewNewStack
            .mockResolvedValueOnce(CLEAN_PREVIEW)
            .mockResolvedValueOnce(dangerPreview());
        const create = vi.fn().mockRejectedValue(new ApiError("Confirmation required", 428));
        const onCreated = vi.fn();

        const {result} = renderHook(() => useCreateStack({create, onCreated}));
        act(() => result.current.submit(values()));

        await waitFor(() => expect(result.current.review).not.toBeNull());
        expect(onCreated).not.toHaveBeenCalled();
        expect(mockPreviewNewStack).toHaveBeenCalledTimes(2);
    });

    it("shows an error message and stops submitting when create rejects with a non-428 error", async () => {
        mockPreviewNewStack.mockResolvedValue(CLEAN_PREVIEW);
        const create = vi.fn().mockRejectedValue(new Error("Stack name already in use"));
        const onCreated = vi.fn();

        const {result} = renderHook(() => useCreateStack({create, onCreated}));
        act(() => result.current.submit(values()));

        await waitFor(() => expect(result.current.error).toBe("Stack name already in use"));
        expect(result.current.submitting).toBe(false);
        expect(onCreated).not.toHaveBeenCalled();
    });

    it("shows a fallback error message when create rejects with a non-Error value", async () => {
        mockPreviewNewStack.mockResolvedValue(CLEAN_PREVIEW);
        const create = vi.fn().mockRejectedValue("network exploded");
        const onCreated = vi.fn();

        const {result} = renderHook(() => useCreateStack({create, onCreated}));
        act(() => result.current.submit(values()));

        await waitFor(() => expect(result.current.error).toBe("Failed to create stack"));
    });

    it("shows an error message when previewNewStack itself rejects", async () => {
        mockPreviewNewStack.mockRejectedValue(new Error("Invalid slug"));
        const create = vi.fn();
        const onCreated = vi.fn();

        const {result} = renderHook(() => useCreateStack({create, onCreated}));
        act(() => result.current.submit(values()));

        await waitFor(() => expect(result.current.error).toBe("Invalid slug"));
        expect(create).not.toHaveBeenCalled();
        expect(result.current.submitting).toBe(false);
    });
});
