import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {act, renderHook} from "@testing-library/react";
import {useBackupHistory, BACKUP_HISTORY_POLL_INTERVAL_MS} from "../../../src/hooks/use-backup-history";
import {getBackups, type BackupRecord} from "@/lib/backups-api";

vi.mock("@/lib/backups-api", () => ({
    getBackups: vi.fn(),
}));

const mockGetBackups = vi.mocked(getBackups);

function makeBackup(overrides: Partial<BackupRecord> = {}): BackupRecord {
    return {
        id: "b1",
        stackId: "s1",
        resticSnapshotId: "abcdef1234567890",
        sizeBytes: null,
        trigger: "MANUAL",
        status: "COMPLETED",
        errorMessage: null,
        logLines: [],
        startedAt: "2026-08-30T10:00:00Z",
        completedAt: "2026-08-30T10:01:00Z",
        createdAt: "2026-08-30T10:00:00Z",
        ...overrides,
    };
}

beforeEach(() => {
    mockGetBackups.mockReset();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("useBackupHistory", () => {
    it("fetches once on mount before any timer advances, then settles loading and backups", async () => {
        vi.useFakeTimers();
        const response = [makeBackup()];
        mockGetBackups.mockResolvedValue(response);

        const {result} = renderHook(() => useBackupHistory("s1"));

        expect(mockGetBackups).toHaveBeenCalledTimes(1);
        expect(mockGetBackups).toHaveBeenCalledWith("s1");
        expect(result.current.loading).toBe(true);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });

        expect(result.current.loading).toBe(false);
        expect(result.current.backups).toEqual(response);
    });

    it("calls getBackups exactly once for an all-COMPLETED list, even after 60s (G-10-2)", async () => {
        vi.useFakeTimers();
        mockGetBackups.mockResolvedValue([makeBackup({status: "COMPLETED"})]);

        renderHook(() => useBackupHistory("s1"));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(60000);
        });

        expect(mockGetBackups).toHaveBeenCalledTimes(1);
    });

    it("polls every 5s while the latest fetch contains an IN_PROGRESS backup", async () => {
        vi.useFakeTimers();
        mockGetBackups.mockImplementation(async () => [
            makeBackup({status: "IN_PROGRESS", completedAt: null}),
        ]);

        renderHook(() => useBackupHistory("s1"));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(mockGetBackups).toHaveBeenCalledTimes(1);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(BACKUP_HISTORY_POLL_INTERVAL_MS);
        });
        expect(mockGetBackups).toHaveBeenCalledTimes(2);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(BACKUP_HISTORY_POLL_INTERVAL_MS);
        });
        expect(mockGetBackups).toHaveBeenCalledTimes(3);
    });

    it("stops polling once a poll returns no IN_PROGRESS backup", async () => {
        vi.useFakeTimers();
        mockGetBackups.mockImplementation(async () => [
            makeBackup({status: "IN_PROGRESS", completedAt: null}),
        ]);

        renderHook(() => useBackupHistory("s1"));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(mockGetBackups).toHaveBeenCalledTimes(1);

        mockGetBackups.mockImplementation(async () => [makeBackup({status: "COMPLETED"})]);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(BACKUP_HISTORY_POLL_INTERVAL_MS);
        });
        expect(mockGetBackups).toHaveBeenCalledTimes(2);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(BACKUP_HISTORY_POLL_INTERVAL_MS * 5);
        });
        expect(mockGetBackups).toHaveBeenCalledTimes(2);
    });

    it("stops fetching after unmount", async () => {
        vi.useFakeTimers();
        mockGetBackups.mockImplementation(async () => [
            makeBackup({status: "IN_PROGRESS", completedAt: null}),
        ]);

        const {unmount} = renderHook(() => useBackupHistory("s1"));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        unmount();
        const countAtUnmount = mockGetBackups.mock.calls.length;

        await act(async () => {
            await vi.advanceTimersByTimeAsync(BACKUP_HISTORY_POLL_INTERVAL_MS * 5);
        });

        expect(mockGetBackups.mock.calls.length).toBe(countAtUnmount);
    });

    it("resets and refetches immediately when stackId changes, freezing the previous stack's call count", async () => {
        vi.useFakeTimers();
        const s1Response = [makeBackup({id: "b1", stackId: "s1"})];
        const s2Response = [makeBackup({id: "b2", stackId: "s2"})];
        mockGetBackups.mockImplementation(async (stackId: string) =>
            stackId === "s1" ? s1Response : s2Response,
        );

        const {result, rerender} = renderHook(({stackId}) => useBackupHistory(stackId), {
            initialProps: {stackId: "s1"},
        });

        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(result.current.backups).toEqual(s1Response);
        const s1CallCountBeforeSwitch = mockGetBackups.mock.calls.filter(
            (call) => call[0] === "s1",
        ).length;

        rerender({stackId: "s2"});

        expect(mockGetBackups).toHaveBeenCalledWith("s2");
        expect(result.current.backups).toEqual([]);
        expect(result.current.loading).toBe(true);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(result.current.backups).toEqual(s2Response);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(20000);
        });
        const s1CallCountAfter = mockGetBackups.mock.calls.filter(
            (call) => call[0] === "s1",
        ).length;
        expect(s1CallCountAfter).toBe(s1CallCountBeforeSwitch);
    });

    it("swallows a rejected fetch, keeps the previous backups, and does not crash", async () => {
        vi.useFakeTimers();
        const response = [makeBackup({status: "IN_PROGRESS", completedAt: null})];
        mockGetBackups.mockResolvedValueOnce(response);
        mockGetBackups.mockRejectedValueOnce(new Error("network error"));

        const {result} = renderHook(() => useBackupHistory("s1"));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(result.current.backups).toEqual(response);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(BACKUP_HISTORY_POLL_INTERVAL_MS);
        });
        expect(result.current.loading).toBe(false);
        expect(result.current.backups).toEqual(response);
    });

    it("exports the documented poll interval", () => {
        expect(BACKUP_HISTORY_POLL_INTERVAL_MS).toBe(5000);
    });

    describe("status-driven refresh", () => {
        it("mounts with a stackStatus causing no duplicate fetch, and a same-value re-render adds zero calls", async () => {
            vi.useFakeTimers();
            mockGetBackups.mockResolvedValue([makeBackup({status: "COMPLETED"})]);

            const {rerender} = renderHook(
                ({stackId, stackStatus}) => useBackupHistory(stackId, stackStatus),
                {initialProps: {stackId: "s1", stackStatus: "RUNNING"}},
            );

            expect(mockGetBackups).toHaveBeenCalledTimes(1);

            rerender({stackId: "s1", stackStatus: "RUNNING"});

            expect(mockGetBackups).toHaveBeenCalledTimes(1);
        });

        it("a status change triggers one immediate refresh and resumes polling only while the new data is in progress", async () => {
            vi.useFakeTimers();
            mockGetBackups.mockResolvedValue([makeBackup({status: "COMPLETED"})]);

            const {rerender} = renderHook(
                ({stackId, stackStatus}) => useBackupHistory(stackId, stackStatus),
                {initialProps: {stackId: "s1", stackStatus: "RUNNING"}},
            );
            await act(async () => {
                await vi.advanceTimersByTimeAsync(0);
            });
            expect(mockGetBackups).toHaveBeenCalledTimes(1);

            mockGetBackups.mockImplementation(async () => [
                makeBackup({status: "IN_PROGRESS", completedAt: null}),
            ]);
            rerender({stackId: "s1", stackStatus: "BACKING_UP"});
            expect(mockGetBackups).toHaveBeenCalledTimes(2);

            await act(async () => {
                await vi.advanceTimersByTimeAsync(BACKUP_HISTORY_POLL_INTERVAL_MS);
            });
            expect(mockGetBackups).toHaveBeenCalledTimes(3);

            mockGetBackups.mockImplementation(async () => [makeBackup({status: "COMPLETED"})]);
            rerender({stackId: "s1", stackStatus: "RUNNING"});
            expect(mockGetBackups).toHaveBeenCalledTimes(4);

            await act(async () => {
                await vi.advanceTimersByTimeAsync(BACKUP_HISTORY_POLL_INTERVAL_MS * 3);
            });
            expect(mockGetBackups).toHaveBeenCalledTimes(4);
        });

        it("switching stackId and stackStatus together causes exactly one call for the new stack", async () => {
            vi.useFakeTimers();
            mockGetBackups.mockResolvedValue([makeBackup({status: "COMPLETED"})]);

            const {rerender} = renderHook(
                ({stackId, stackStatus}) => useBackupHistory(stackId, stackStatus),
                {initialProps: {stackId: "s1", stackStatus: "RUNNING"}},
            );

            const countBeforeSwitch = mockGetBackups.mock.calls.length;

            rerender({stackId: "s2", stackStatus: "BACKING_UP"});

            expect(mockGetBackups.mock.calls.length).toBe(countBeforeSwitch + 1);
            expect(mockGetBackups).toHaveBeenLastCalledWith("s2");
        });
    });
});
