import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
    BackupScheduleDialog,
    toBackupConfigPayload,
    type BackupScheduleFormValues,
} from "@/routes/app/stacks/components/backup-schedule-dialog";
import {saveBackupConfig, type StackBackupConfig} from "@/lib/backups-api";
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
    return {...actual, saveBackupConfig: vi.fn()};
});

vi.mock("sonner", () => ({
    toast: {
        promise: vi.fn((promise: Promise<unknown>, opts: any) => {
            promise.then(
                (result) => opts.success && (typeof opts.success === "function" ? opts.success(result) : opts.success),
                (err) => opts.error?.(err),
            );
            return promise.catch(() => {});
        }),
    },
}));

// Bumped from the 5s default: this suite is CPU-bound (userEvent interactions
// + full Dialog/Form render) and flakes under this host's full-parallel-suite
// resource contention, the same documented class of flake as
// proxy-tab.test.tsx/service-upgrade-dialog.test.tsx (05.1-01-SUMMARY.md/
// STATE.md) — every test here passes reliably in isolation or in small
// groups.
vi.setConfig({testTimeout: 15000});

const mockSaveBackupConfig = vi.mocked(saveBackupConfig);

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

function renderDialog(config: StackBackupConfig) {
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();
    const utils = render(
        <BackupScheduleDialog
            stackId="my-app"
            config={config}
            open
            onOpenChange={onOpenChange}
            onSaved={onSaved}
        />,
    );
    return {...utils, onOpenChange, onSaved};
}

beforeEach(() => {
    mockSaveBackupConfig.mockReset();
});

describe("toBackupConfigPayload", () => {
    const base: BackupScheduleFormValues = {
        useGlobalSchedule: true,
        schedule: "",
        useGlobalRetention: true,
        retention: {keepDaily: 7, keepWeekly: 4, keepMonthly: 12},
        preHook: "",
        postHook: "",
    };

    it("maps useGlobalSchedule true to a null schedule", () => {
        expect(toBackupConfigPayload({...base, schedule: "0 4 * * *"})).toMatchObject({
            useGlobalSchedule: true,
            schedule: null,
        });
    });

    it("maps useGlobalSchedule false to the trimmed schedule, or null when empty", () => {
        expect(
            toBackupConfigPayload({...base, useGlobalSchedule: false, schedule: "0 4 * * *"}),
        ).toMatchObject({useGlobalSchedule: false, schedule: "0 4 * * *"});
        expect(toBackupConfigPayload({...base, useGlobalSchedule: false, schedule: ""})).toMatchObject({
            useGlobalSchedule: false,
            schedule: null,
        });
    });

    it("maps useGlobalRetention true to a null retention", () => {
        expect(toBackupConfigPayload({...base, useGlobalRetention: true})).toMatchObject({
            useGlobalRetention: true,
            retention: null,
        });
    });

    it("maps useGlobalRetention false to the retention object", () => {
        expect(
            toBackupConfigPayload({
                ...base,
                useGlobalRetention: false,
                retention: {keepDaily: 1, keepWeekly: 2, keepMonthly: 3},
            }),
        ).toMatchObject({
            useGlobalRetention: false,
            retention: {keepDaily: 1, keepWeekly: 2, keepMonthly: 3},
        });
    });

    it("maps empty hooks to null", () => {
        expect(toBackupConfigPayload({...base, preHook: "", postHook: ""})).toMatchObject({
            preHook: null,
            postHook: null,
        });
        expect(toBackupConfigPayload({...base, preHook: "cmd1", postHook: "cmd2"})).toMatchObject({
            preHook: "cmd1",
            postHook: "cmd2",
        });
    });
});

describe("BackupScheduleDialog", () => {
    it("opens pre-filled from an override config", () => {
        renderDialog(
            makeConfig({
                useGlobalSchedule: false,
                schedule: "0 2 * * *",
                useGlobalRetention: false,
                retention: {keepDaily: 7, keepWeekly: 4, keepMonthly: 6},
                preHook: "docker compose stop",
                postHook: "docker compose start",
            }),
        );

        expect(screen.getByRole("heading", {name: "Edit Backup Schedule"})).toBeInTheDocument();
        expect(screen.getByLabelText(/^schedule$/i)).toHaveValue("0 2 * * *");
        expect(screen.getByLabelText("Keep daily")).toHaveValue(7);
        expect(screen.getByLabelText("Keep weekly")).toHaveValue(4);
        expect(screen.getByLabelText("Keep monthly")).toHaveValue(6);
        expect(screen.getByLabelText(/pre-backup hook/i)).toHaveValue("docker compose stop");
        expect(screen.getByLabelText(/post-backup hook/i)).toHaveValue("docker compose start");
    });

    it("falls back to global retention, then 7/4/12, when no override or global retention exists", () => {
        renderDialog(makeConfig({useGlobalRetention: false, retention: null, globalRetention: null}));

        // No override retention and no global retention -> the hardcoded default.
        expect(screen.getByLabelText("Keep daily")).toHaveValue(7);
        expect(screen.getByLabelText("Keep weekly")).toHaveValue(4);
        expect(screen.getByLabelText("Keep monthly")).toHaveValue(12);
    });

    it("reveals the cron input only when the global-schedule switch is toggled off", async () => {
        const user = userEvent.setup();
        renderDialog(makeConfig());

        expect(screen.queryByLabelText(/^schedule$/i)).not.toBeInTheDocument();

        await user.click(screen.getByRole("switch", {name: /use global schedule/i}));

        expect(await screen.findByLabelText(/^schedule$/i)).toBeInTheDocument();
    });

    it("calls saveBackupConfig with toBackupConfigPayload(values), closes and calls onSaved on success", async () => {
        mockSaveBackupConfig.mockResolvedValue(undefined);
        const user = userEvent.setup();

        const {onOpenChange, onSaved} = renderDialog(
            makeConfig({useGlobalSchedule: false, schedule: "0 2 * * *"}),
        );

        await user.click(screen.getByRole("button", {name: "Save Schedule"}));

        await waitFor(() =>
            expect(mockSaveBackupConfig).toHaveBeenCalledWith(
                "my-app",
                expect.objectContaining({useGlobalSchedule: false, schedule: "0 2 * * *"}),
            ),
        );
        await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
        await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    });

    it("keeps the dialog open and returns the UI-SPEC error copy on a failed save", async () => {
        const apiError = new ApiError("Cron expression invalid", 400, {schedule: "invalid cron"});
        mockSaveBackupConfig.mockRejectedValue(apiError);
        const user = userEvent.setup();

        const {onOpenChange} = renderDialog(makeConfig({useGlobalSchedule: false, schedule: "bad"}));

        await user.click(screen.getByRole("button", {name: "Save Schedule"}));

        expect(await screen.findByText("invalid cron")).toBeInTheDocument();
        expect(onOpenChange).not.toHaveBeenCalledWith(false);

        const {toast} = await import("sonner");
        const promiseCall = vi.mocked(toast.promise).mock.calls.at(-1)!;
        const errorMessage = (promiseCall[1] as any).error(apiError);
        expect(errorMessage).toBe("Couldn't save schedule — Cron expression invalid. Try again.");
    });
});
