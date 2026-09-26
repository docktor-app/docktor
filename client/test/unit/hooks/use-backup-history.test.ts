import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {act, renderHook} from "@testing-library/react";
import {
    useBackupHistory,
    BACKUP_HISTORY_POLL_INTERVAL_MS,
    BACKUP_HISTORY_GRACE_WINDOW_MS,
} from "../../../src/hooks/use-backup-history";
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

    it("polls every 3s with no storm: exactly 4 calls after 10000ms of COMPLETED-only responses", async () => {
        vi.useFakeTimers();
        mockGetBackups.mockImplementation(async () => [makeBackup({status: "COMPLETED"})]);

        renderHook(() => useBackupHistory("s1"));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10000);
        });

        expect(mockGetBackups).toHaveBeenCalledTimes(4);
    });

    it("stops polling once the grace window ends with COMPLETED-only responses", async () => {
        vi.useFakeTimers();
        mockGetBackups.mockImplementation(async () => [makeBackup({status: "COMPLETED"})]);

        renderHook(() => useBackupHistory("s1"));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(31000);
        });
        const countAt31s = mockGetBackups.mock.calls.length;

        await act(async () => {
            await vi.advanceTimersByTimeAsync(59000);
        });
        const countAt90s = mockGetBackups.mock.calls.length;

        expect(countAt90s).toBe(countAt31s);
        expect(countAt31s).toBeLessThanOrEqual(11);
    });

    it("keeps polling past the grace window while the latest fetch shows an IN_PROGRESS backup (stale-closure regression)", async () => {
        vi.useFakeTimers();
        mockGetBackups.mockImplementation(async () => [
            makeBackup({status: "IN_PROGRESS", completedAt: null}),
        ]);

        renderHook(() => useBackupHistory("s1"));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(34000);
        });
        const countAt34s = mockGetBackups.mock.calls.length;

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10000);
        });
        const countAt44s = mockGetBackups.mock.calls.length;

        expect(countAt44s - countAt34s).toBe(3);
    });

    it("stops polling once an in-progress backup completes", async () => {
        vi.useFakeTimers();
        mockGetBackups.mockImplementation(async () => [
            makeBackup({status: "IN_PROGRESS", completedAt: null}),
        ]);

        renderHook(() => useBackupHistory("s1"));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(40000);
        });

        mockGetBackups.mockImplementation(async () => [makeBackup({status: "COMPLETED"})]);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000);
        });
        const countAt42s = mockGetBackups.mock.calls.length;

        await act(async () => {
            await vi.advanceTimersByTimeAsync(28000);
        });
        const countAt70s = mockGetBackups.mock.calls.length;

        expect(countAt70s).toBe(countAt42s);
    });

    it("keeps polling within the grace window even when nothing is in progress", async () => {
        vi.useFakeTimers();
        mockGetBackups.mockImplementation(async () => [makeBackup({status: "COMPLETED"})]);

        renderHook(() => useBackupHistory("s1"));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10000);
        });
        const countAt10s = mockGetBackups.mock.calls.length;

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10000);
        });
        const countAt20s = mockGetBackups.mock.calls.length;

        expect(countAt20s).toBeGreaterThan(countAt10s);
    });

    it("stops fetching after unmount", async () => {
        vi.useFakeTimers();
        mockGetBackups.mockImplementation(async () => [makeBackup({status: "COMPLETED"})]);

        const {unmount} = renderHook(() => useBackupHistory("s1"));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });
        unmount();
        const countAtUnmount = mockGetBackups.mock.calls.length;

        await act(async () => {
            await vi.advanceTimersByTimeAsync(55000);
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

    it("swallows a rejected fetch, keeping the previous backups, and still fetches on the next in-window tick", async () => {
        vi.useFakeTimers();
        const response = [makeBackup({status: "COMPLETED"})];
        mockGetBackups.mockResolvedValueOnce(response);
        mockGetBackups.mockRejectedValueOnce(new Error("network error"));
        mockGetBackups.mockResolvedValue(response);

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

        const countBeforeNextTick = mockGetBackups.mock.calls.length;
        await act(async () => {
            await vi.advanceTimersByTimeAsync(BACKUP_HISTORY_POLL_INTERVAL_MS);
        });
        expect(mockGetBackups.mock.calls.length).toBeGreaterThan(countBeforeNextTick);
    });

    it("exports the documented poll interval and grace window constants", () => {
        expect(BACKUP_HISTORY_POLL_INTERVAL_MS).toBe(3000);
        expect(BACKUP_HISTORY_GRACE_WINDOW_MS).toBe(30_000);
    });

    describe("status-driven refresh (Task 2)", () => {
        it("mounts with a stackStatus causing no duplicate fetch, and a same-value re-render adds zero calls", async () => {
            vi.useFakeTimers();
            mockGetBackups.mockImplementation(async () => [makeBackup({status: "COMPLETED"})]);

            const {rerender} = renderHook(
                ({stackId, stackStatus}) => useBackupHistory(stackId, stackStatus),
                {initialProps: {stackId: "s1", stackStatus: "RUNNING"}},
            );

            expect(mockGetBackups).toHaveBeenCalledTimes(1);

            rerender({stackId: "s1", stackStatus: "RUNNING"});

            expect(mockGetBackups).toHaveBeenCalledTimes(1);
        });

        it("a status change after the grace window triggers one immediate refresh, resumes polling while in progress, and stops again once completed", async () => {
            vi.useFakeTimers();
            mockGetBackups.mockImplementation(async () => [makeBackup({status: "COMPLETED"})]);

            const {rerender} = renderHook(
                ({stackId, stackStatus}) => useBackupHistory(stackId, stackStatus),
                {initialProps: {stackId: "s1", stackStatus: "RUNNING"}},
            );

            await act(async () => {
                await vi.advanceTimersByTimeAsync(40000);
            });
            const countAt40s = mockGetBackups.mock.calls.length;

            mockGetBackups.mockImplementation(async () => [
                makeBackup({status: "IN_PROGRESS", completedAt: null}),
            ]);
            rerender({stackId: "s1", stackStatus: "BACKING_UP"});
            expect(mockGetBackups.mock.calls.length).toBe(countAt40s + 1);

            await act(async () => {
                await vi.advanceTimersByTimeAsync(10000);
            });
            expect(mockGetBackups.mock.calls.length).toBe(countAt40s + 1 + 3);
            const countAt50s = mockGetBackups.mock.calls.length;

            mockGetBackups.mockImplementation(async () => [makeBackup({status: "COMPLETED"})]);
            rerender({stackId: "s1", stackStatus: "RUNNING"});
            expect(mockGetBackups.mock.calls.length).toBe(countAt50s + 1);
            const countAfterRunningRefresh = mockGetBackups.mock.calls.length;

            await act(async () => {
                await vi.advanceTimersByTimeAsync(30000);
            });
            expect(mockGetBackups.mock.calls.length).toBe(countAfterRunningRefresh);
        });

        it("switching stackId and stackStatus together causes exactly one call for the new stack", async () => {
            vi.useFakeTimers();
            mockGetBackups.mockImplementation(async () => [makeBackup({status: "COMPLETED"})]);

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
