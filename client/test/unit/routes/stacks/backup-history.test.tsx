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

describe("BackupHistory (G-10-2)", () => {
    it("mounting with only COMPLETED backups calls getBackups exactly once, even after 60s", async () => {
        vi.useFakeTimers();
        mockGetBackups.mockResolvedValue([makeBackup({status: "COMPLETED"})]);

        render(
            <MemoryRouter>
                <BackupHistory stackId="s1" />
            </MemoryRouter>,
        );

        await act(async () => {
            await vi.advanceTimersByTimeAsync(60000);
        });

        expect(screen.getByText("View details")).toBeInTheDocument();
        expect(mockGetBackups).toHaveBeenCalledTimes(1);
    });

    it("polls every 5s while an IN_PROGRESS backup is present and stops once none remain", async () => {
        vi.useFakeTimers();
        mockGetBackups.mockImplementation(async () => [
            makeBackup({status: "IN_PROGRESS", completedAt: null}),
        ]);

        render(
            <MemoryRouter>
                <BackupHistory stackId="s1" />
            </MemoryRouter>,
        );

        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
        expect(mockGetBackups).toHaveBeenCalledTimes(1);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });
        expect(mockGetBackups).toHaveBeenCalledTimes(2);

        mockGetBackups.mockImplementation(async () => [makeBackup({status: "COMPLETED"})]);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });
        expect(mockGetBackups).toHaveBeenCalledTimes(3);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(15000);
        });
        expect(mockGetBackups).toHaveBeenCalledTimes(3);
    });

    it("shows a newly started backup after a stackStatus change, driven by the live status signal", async () => {
        vi.useFakeTimers();
        mockGetBackups.mockImplementation(async () => [makeBackup({id: "b1", status: "COMPLETED"})]);

        const {rerender} = render(
            <MemoryRouter>
                <BackupHistory stackId="s1" stackStatus="RUNNING" />
            </MemoryRouter>,
        );

        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
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

    it("renders trigger badges via BackupTriggerBadge, not hand-rolled markup", async () => {
        vi.useFakeTimers();
        mockGetBackups.mockResolvedValue([makeBackup({status: "COMPLETED", trigger: "SCHEDULED"})]);

        render(
            <MemoryRouter>
                <BackupHistory stackId="s1" />
            </MemoryRouter>,
        );

        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });

        expect(screen.getByText("Scheduled")).toBeInTheDocument();
    });
});
