import {beforeEach, describe, expect, it, vi} from "vitest";
import {act, renderHook, waitFor} from "@testing-library/react";
import {useTemplates} from "@/hooks/use-templates";
import {listTemplates, syncTemplateRepo} from "@/lib/templates-api";

vi.mock("@/lib/templates-api", () => ({
    listTemplates: vi.fn(),
    syncTemplateRepo: vi.fn(),
}));

const mockListTemplates = vi.mocked(listTemplates);
const mockSyncTemplateRepo = vi.mocked(syncTemplateRepo);

const CATALOG = {repos: [], templates: [{id: "t1", repoId: "r1", slug: "whoami", name: "Whoami", description: "", category: "utility", iconDataUri: null, variants: []}]};

beforeEach(() => {
    mockListTemplates.mockReset();
    mockSyncTemplateRepo.mockReset();
});

describe("useTemplates", () => {
    it("starts in loading state", () => {
        mockListTemplates.mockReturnValue(new Promise(() => {}));

        const {result} = renderHook(() => useTemplates());

        expect(result.current.loading).toBe(true);
        expect(result.current.catalog).toBeNull();
        expect(result.current.error).toBeNull();
    });

    it("loads the catalog and flips loading false", async () => {
        mockListTemplates.mockResolvedValue(CATALOG);

        const {result} = renderHook(() => useTemplates());

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.catalog).toEqual(CATALOG);
        expect(result.current.error).toBeNull();
    });

    it("sets an error message on failure", async () => {
        mockListTemplates.mockRejectedValue(new Error("Network error"));

        const {result} = renderHook(() => useTemplates());

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBe("Network error");
        expect(result.current.catalog).toBeNull();
    });

    it("refetch re-runs listTemplates without flipping loading back to true", async () => {
        mockListTemplates.mockResolvedValueOnce(CATALOG);
        const refreshed = {repos: [], templates: []};
        mockListTemplates.mockResolvedValueOnce(refreshed);

        const {result} = renderHook(() => useTemplates());
        await waitFor(() => expect(result.current.loading).toBe(false));

        let refetchPromise!: Promise<void>;
        act(() => {
            refetchPromise = result.current.refetch();
        });
        expect(result.current.loading).toBe(false);
        await act(() => refetchPromise);

        expect(result.current.catalog).toEqual(refreshed);
        expect(result.current.loading).toBe(false);
    });

    it("retryRepo calls syncTemplateRepo then refetches the catalog", async () => {
        mockListTemplates.mockResolvedValueOnce(CATALOG);
        const refreshed = {repos: [], templates: []};
        mockListTemplates.mockResolvedValueOnce(refreshed);
        mockSyncTemplateRepo.mockResolvedValue({
            id: "r1",
            url: "https://example.com/repo.git",
            isDefault: true,
            headCommitSha: "abc",
            lastSyncAttemptAt: null,
            lastSyncedAt: null,
            lastSyncError: null,
            issues: [],
        });

        const {result} = renderHook(() => useTemplates());
        await waitFor(() => expect(result.current.loading).toBe(false));

        await act(() => result.current.retryRepo("r1"));

        expect(mockSyncTemplateRepo).toHaveBeenCalledWith("r1");
        expect(result.current.catalog).toEqual(refreshed);
    });
});
