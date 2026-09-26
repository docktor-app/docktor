import {beforeEach, describe, expect, it, vi} from "vitest";
import {renderHook, waitFor} from "@testing-library/react";
import {useBackupDefaults} from "@/hooks/use-backup-defaults";
import {getBackupDefaults} from "@/lib/backups-api";

vi.mock("@/lib/backups-api", () => ({
    getBackupDefaults: vi.fn(),
}));

const mockGetBackupDefaults = vi.mocked(getBackupDefaults);

beforeEach(() => {
    mockGetBackupDefaults.mockReset();
});

describe("useBackupDefaults", () => {
    it("starts in loading state with no default schedule", () => {
        mockGetBackupDefaults.mockReturnValue(new Promise(() => {}));

        const {result} = renderHook(() => useBackupDefaults());

        expect(result.current.loading).toBe(true);
        expect(result.current.defaultSchedule).toBeNull();
        expect(result.current.error).toBeNull();
    });

    it("resolves defaultSchedule from getBackupDefaults", async () => {
        mockGetBackupDefaults.mockResolvedValue({
            defaultSchedule: "0 3 * * *",
            defaultRetention: null,
        });

        const {result} = renderHook(() => useBackupDefaults());

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.defaultSchedule).toBe("0 3 * * *");
        expect(result.current.error).toBeNull();
    });

    it("on rejection, reports the error and leaves defaultSchedule null", async () => {
        mockGetBackupDefaults.mockRejectedValue(new Error("Network error"));

        const {result} = renderHook(() => useBackupDefaults());

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.defaultSchedule).toBeNull();
        expect(result.current.error).toBe("Network error");
    });

    it("falls back to a generic message when the rejection is not an Error", async () => {
        mockGetBackupDefaults.mockRejectedValue("boom");

        const {result} = renderHook(() => useBackupDefaults());

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBe("Failed to fetch backup defaults");
    });
});
