import {beforeEach, describe, expect, it, vi} from "vitest";
import {act, renderHook, waitFor} from "@testing-library/react";
import {useTemplateRepos} from "@/hooks/use-template-repos";
import {addTemplateRepo, listTemplateRepos, syncTemplateRepo} from "@/lib/templates-api";

vi.mock("@/lib/templates-api", () => ({
    listTemplateRepos: vi.fn(),
    addTemplateRepo: vi.fn(),
    syncTemplateRepo: vi.fn(),
}));

const mockListTemplateRepos = vi.mocked(listTemplateRepos);
const mockAddTemplateRepo = vi.mocked(addTemplateRepo);
const mockSyncTemplateRepo = vi.mocked(syncTemplateRepo);

const REPO_A = {
    id: "r1",
    url: "https://example.com/official.git",
    isDefault: true,
    headCommitSha: "abc",
    lastSyncAttemptAt: "2026-01-01T00:00:00Z",
    lastSyncedAt: "2026-01-01T00:00:00Z",
    lastSyncError: null,
    issues: [],
};

beforeEach(() => {
    mockListTemplateRepos.mockReset();
    mockAddTemplateRepo.mockReset();
    mockSyncTemplateRepo.mockReset();
});

describe("useTemplateRepos", () => {
    it("starts in loading state", () => {
        mockListTemplateRepos.mockReturnValue(new Promise(() => {}));

        const {result} = renderHook(() => useTemplateRepos());

        expect(result.current.loading).toBe(true);
        expect(result.current.repos).toEqual([]);
        expect(result.current.error).toBeNull();
    });

    it("loads the repo list and flips loading false", async () => {
        mockListTemplateRepos.mockResolvedValue([REPO_A]);

        const {result} = renderHook(() => useTemplateRepos());

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.repos).toEqual([REPO_A]);
        expect(result.current.error).toBeNull();
    });

    it("sets an error message on failure", async () => {
        mockListTemplateRepos.mockRejectedValue(new Error("Network error"));

        const {result} = renderHook(() => useTemplateRepos());

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBe("Network error");
        expect(result.current.repos).toEqual([]);
    });

    it("addRepo calls addTemplateRepo, refetches the list, and returns the created repo", async () => {
        mockListTemplateRepos.mockResolvedValueOnce([]);
        const created = {...REPO_A, id: "r2", url: "https://example.com/extra.git"};
        mockAddTemplateRepo.mockResolvedValue(created);
        mockListTemplateRepos.mockResolvedValueOnce([created]);

        const {result} = renderHook(() => useTemplateRepos());
        await waitFor(() => expect(result.current.loading).toBe(false));

        let returned!: typeof created;
        await act(async () => {
            returned = await result.current.addRepo("https://example.com/extra.git");
        });

        expect(mockAddTemplateRepo).toHaveBeenCalledWith("https://example.com/extra.git");
        expect(returned).toEqual(created);
        expect(result.current.repos).toEqual([created]);
        expect(result.current.loading).toBe(false);
    });

    it("syncRepo calls syncTemplateRepo then refetches the list", async () => {
        mockListTemplateRepos.mockResolvedValueOnce([REPO_A]);
        const synced = {...REPO_A, lastSyncedAt: "2026-02-01T00:00:00Z"};
        mockSyncTemplateRepo.mockResolvedValue(synced);
        mockListTemplateRepos.mockResolvedValueOnce([synced]);

        const {result} = renderHook(() => useTemplateRepos());
        await waitFor(() => expect(result.current.loading).toBe(false));

        await act(() => result.current.syncRepo("r1"));

        expect(mockSyncTemplateRepo).toHaveBeenCalledWith("r1");
        expect(result.current.repos).toEqual([synced]);
    });

    it("refetch re-runs listTemplateRepos without flipping loading back to true", async () => {
        mockListTemplateRepos.mockResolvedValueOnce([REPO_A]);
        const refreshed = [{...REPO_A, lastSyncError: "boom"}];
        mockListTemplateRepos.mockResolvedValueOnce(refreshed);

        const {result} = renderHook(() => useTemplateRepos());
        await waitFor(() => expect(result.current.loading).toBe(false));

        let refetchPromise!: Promise<void>;
        act(() => {
            refetchPromise = result.current.refetch();
        });
        expect(result.current.loading).toBe(false);
        await act(() => refetchPromise);

        expect(result.current.repos).toEqual(refreshed);
        expect(result.current.loading).toBe(false);
    });
});
