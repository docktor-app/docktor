import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter} from "react-router";
import {
    BackupConfigSummary,
    describeRetention,
    describeSchedule,
} from "@/routes/app/stacks/components/backup-config-summary";
import {getBackupConfig, getVolumeWarnings, triggerBackup, type StackBackupConfig} from "@/lib/backups-api";
import {ApiError} from "@/lib/api";

if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
}
if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
}
if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}

vi.mock("@/lib/backups-api", async () => {
    const actual = await vi.importActual<typeof import("@/lib/backups-api")>("@/lib/backups-api");
    return {
        ...actual,
        getBackupConfig: vi.fn(),
        getVolumeWarnings: vi.fn(),
        triggerBackup: vi.fn(),
    };
});

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        promise: vi.fn((promise: Promise<unknown>) => promise.catch(() => {})),
    },
}));

// Bumped from the 5s default: this suite is CPU-bound (userEvent interactions
// + full Section/Dialog render) and flakes under this host's
// full-parallel-suite resource contention, the same documented class of
// flake as proxy-tab.test.tsx/service-upgrade-dialog.test.tsx
// (05.1-01-SUMMARY.md/STATE.md) — every test here passes reliably in
// isolation or in small groups.
vi.setConfig({testTimeout: 15000});

const mockGetBackupConfig = vi.mocked(getBackupConfig);
const mockGetVolumeWarnings = vi.mocked(getVolumeWarnings);
const mockTriggerBackup = vi.mocked(triggerBackup);

function makeConfig(overrides: Partial<StackBackupConfig> = {}): StackBackupConfig {
    return {
        useGlobalSchedule: true,
        schedule: null,
        useGlobalRetention: true,
        retention: null,
        preHook: null,
        postHook: null,
        globalSchedule: "0 3 * * *",
        globalRetention: {keepDaily: 7, keepWeekly: 4, keepMonthly: 12},
        ...overrides,
    };
}

function renderSummary(stackStatus = "RUNNING") {
    return render(
        <MemoryRouter>
            <BackupConfigSummary stackId="my-app" stackStatus={stackStatus} />
        </MemoryRouter>,
    );
}

beforeEach(() => {
    mockGetBackupConfig.mockReset();
    mockGetVolumeWarnings.mockReset();
    mockTriggerBackup.mockReset();
    mockGetVolumeWarnings.mockResolvedValue({warnings: []});
});

describe("describeSchedule", () => {
    it("shows the override cron when useGlobalSchedule is false", () => {
        expect(describeSchedule(makeConfig({useGlobalSchedule: false, schedule: "0 2 * * *"}))).toBe(
            "0 2 * * *",
        );
    });

    it("shows the global default when relying on the global schedule", () => {
        expect(
            describeSchedule(makeConfig({useGlobalSchedule: true, globalSchedule: "0 3 * * *"})),
        ).toBe("Global default (0 3 * * *)");
    });

    it("shows 'Not scheduled' when relying on the global schedule and none is set", () => {
        expect(describeSchedule(makeConfig({useGlobalSchedule: true, globalSchedule: null}))).toBe(
            "Not scheduled",
        );
    });
});

describe("describeRetention", () => {
    it("formats the override retention", () => {
        expect(
            describeRetention(
                makeConfig({
                    useGlobalRetention: false,
                    retention: {keepDaily: 7, keepWeekly: 4, keepMonthly: 12},
                }),
            ),
        ).toBe("7 daily · 4 weekly · 12 monthly");
    });

    it("formats the global retention with a global-default suffix", () => {
        expect(
            describeRetention(
                makeConfig({
                    useGlobalRetention: true,
                    globalRetention: {keepDaily: 7, keepWeekly: 4, keepMonthly: 12},
                }),
            ),
        ).toBe("7 daily · 4 weekly · 12 monthly (global default)");
    });

    it("shows 'Global default' when there is no global retention to describe", () => {
        expect(describeRetention(makeConfig({useGlobalRetention: true, globalRetention: null}))).toBe(
            "Global default",
        );
    });
});

describe("BackupConfigSummary", () => {
    it("renders the summary text, Backup Now, and Edit Schedule", async () => {
        mockGetBackupConfig.mockResolvedValue(
            makeConfig({
                useGlobalSchedule: false,
                schedule: "0 2 * * *",
                useGlobalRetention: false,
                retention: {keepDaily: 7, keepWeekly: 4, keepMonthly: 6},
                preHook: "docker compose stop",
                postHook: "docker compose start",
            }),
        );

        renderSummary();

        expect(await screen.findByText("Backup Configuration")).toBeInTheDocument();
        expect(screen.getByText("0 2 * * *")).toBeInTheDocument();
        expect(screen.getByText("7 daily · 4 weekly · 6 monthly")).toBeInTheDocument();
        expect(screen.getByText("docker compose stop")).toBeInTheDocument();
        expect(screen.getByText("docker compose start")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Backup Now"})).toBeEnabled();
        expect(screen.getByRole("button", {name: "Edit Schedule"})).toBeInTheDocument();
    });

    it("shows 'None' for empty hooks", async () => {
        mockGetBackupConfig.mockResolvedValue(makeConfig());

        renderSummary();

        await screen.findByText("Backup Configuration");
        expect(screen.getAllByText("None")).toHaveLength(2);
    });

    it("disables Backup Now with the in-progress label while BACKING_UP", async () => {
        mockGetBackupConfig.mockResolvedValue(makeConfig());

        renderSummary("BACKING_UP");

        await screen.findByText("Backup Configuration");
        expect(screen.getByRole("button", {name: "Backup in progress..."})).toBeDisabled();
    });

    it("shows volume warnings when present", async () => {
        mockGetBackupConfig.mockResolvedValue(makeConfig());
        mockGetVolumeWarnings.mockResolvedValue({warnings: ["/data/external"]});

        renderSummary();

        expect(await screen.findByText("/data/external")).toBeInTheDocument();
    });

    it("shows a Retry button on a failed load and re-runs the load on click", async () => {
        mockGetBackupConfig
            .mockRejectedValueOnce(new ApiError("Backup config unavailable", 502))
            .mockResolvedValueOnce(makeConfig());
        const user = userEvent.setup();

        renderSummary();

        expect(await screen.findByText("Backup config unavailable")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Retry"}));

        expect(await screen.findByText("Backup Configuration")).toBeInTheDocument();
        expect(mockGetBackupConfig).toHaveBeenCalledTimes(2);
    });

    it("opens the schedule dialog from Edit Schedule and reloads on save", async () => {
        mockGetBackupConfig.mockResolvedValue(makeConfig());
        const user = userEvent.setup();

        renderSummary();
        await screen.findByText("Backup Configuration");

        await user.click(screen.getByRole("button", {name: "Edit Schedule"}));

        expect(await screen.findByRole("heading", {name: "Edit Backup Schedule"})).toBeInTheDocument();
    });

    it("triggers a backup and shows a toast with a progress action", async () => {
        mockGetBackupConfig.mockResolvedValue(makeConfig());
        mockTriggerBackup.mockResolvedValue({backupId: "backup-1"});
        const user = userEvent.setup();

        renderSummary();
        await screen.findByText("Backup Configuration");

        await user.click(screen.getByRole("button", {name: "Backup Now"}));

        await waitFor(() => expect(mockTriggerBackup).toHaveBeenCalledWith("my-app"));
        const {toast} = await import("sonner");
        expect(toast.success).toHaveBeenCalledWith("Backup started", expect.objectContaining({action: expect.anything()}));
    });
});
