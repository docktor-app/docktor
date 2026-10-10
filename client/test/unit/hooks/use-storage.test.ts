import {beforeEach, describe, expect, it, vi} from "vitest";
import {act, renderHook, waitFor} from "@testing-library/react";
import {useStorage} from "@/hooks/use-storage";
import {getStorageOverview, type StorageOverview} from "@/lib/storage-api";

vi.mock("@/lib/storage-api", () => ({
    getStorageOverview: vi.fn(),
}));

const mockGetStorageOverview = vi.mocked(getStorageOverview);

const overview: StorageOverview = {
    measuredAt: "2026-10-08T03:00:00Z",
    totals: {volumesBytes: 100, backupsBytes: 50, totalBytes: 150},
    stacks: [],
    backups: [],
};

beforeEach(() => {
    mockGetStorageOverview.mockReset();
});

describe("useStorage", () => {
    it("starts loading and fetches once on mount", async () => {
        mockGetStorageOverview.mockResolvedValue(overview);

        const {result} = renderHook(() => useStorage());
        expect(result.current.loading).toBe(true);
        expect(result.current.overview).toBeNull();

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.overview).toEqual(overview);
        expect(result.current.error).toBeNull();
        expect(mockGetStorageOverview).toHaveBeenCalledTimes(1);
    });

    it("sets the error message and leaves the overview null on failure", async () => {
        mockGetStorageOverview.mockRejectedValue(new Error("boom"));

        const {result} = renderHook(() => useStorage());

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBe("boom");
        expect(result.current.overview).toBeNull();
    });

    it("falls back to a generic message for a non-Error rejection", async () => {
        mockGetStorageOverview.mockRejectedValue("nope");

        const {result} = renderHook(() => useStorage());

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBe("Failed to fetch disk usage");
    });

    it("retry clears the error, re-enters loading and fetches again", async () => {
        mockGetStorageOverview.mockRejectedValueOnce(new Error("boom"));
        mockGetStorageOverview.mockResolvedValueOnce(overview);

        const {result} = renderHook(() => useStorage());
        await waitFor(() => expect(result.current.error).toBe("boom"));

        act(() => {
            result.current.retry();
        });
        expect(result.current.loading).toBe(true);
        expect(result.current.error).toBeNull();

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.overview).toEqual(overview);
        expect(mockGetStorageOverview).toHaveBeenCalledTimes(2);
    });
});
