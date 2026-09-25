import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {act, render, screen} from "@testing-library/react";
import {MemoryRouter} from "react-router";
import {BackupHistory} from "../../../../src/routes/app/stacks/components/backup-history";
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

describe("BackupHistory (tracer)", () => {
    it("renders a fresh-array response and, after 10s, has called getBackups exactly 4 times (G-10-2)", async () => {
        vi.useFakeTimers();

        let callCount = 0;
        mockGetBackups.mockImplementation(async () => {
            callCount += 1;
            if (callCount > 50) {
                // Circuit breaker: against the pre-fix component, the polling
                // effect re-runs and refetches entirely in microtasks inside
                // act(), which can starve the macrotask queue so vitest's own
                // timeout never fires and the run hangs. Stalling the mock
                // here after 50 calls makes the exact-count assertion below
                // fail fast (>=50) instead of hanging the whole run. Under
                // the fixed component this branch is never reached.
                return new Promise<BackupRecord[]>(() => {});
            }
            return [makeBackup()];
        });

        render(
            <MemoryRouter>
                <BackupHistory stackId="s1" />
            </MemoryRouter>,
        );

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10000);
        });

        expect(screen.getByText("View details")).toBeInTheDocument();
        expect(mockGetBackups).toHaveBeenCalledTimes(4);
    });

    it("shows a newly started backup after a stackStatus change, driven by the live status signal (Task 2)", async () => {
        vi.useFakeTimers();
        mockGetBackups.mockImplementation(async () => [makeBackup({id: "b1", status: "COMPLETED"})]);

        const {rerender} = render(
            <MemoryRouter>
                <BackupHistory stackId="s1" stackStatus="RUNNING" />
            </MemoryRouter>,
        );

        await act(async () => {
            await vi.advanceTimersByTimeAsync(40000);
        });

        mockGetBackups.mockImplementation(async () => [
            makeBackup({id: "b1", status: "COMPLETED"}),
            makeBackup({id: "b2", status: "IN_PROGRESS", completedAt: null}),
        ]);

        rerender(
            <MemoryRouter>
                <BackupHistory stackId="s1" stackStatus="BACKING_UP" />
            </MemoryRouter>,
        );

        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });

        expect(screen.getByText("In progress...")).toBeInTheDocument();
    });
});
