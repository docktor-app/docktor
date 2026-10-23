import {beforeEach, describe, expect, it, vi} from "vitest";
import type {MigrationOperation, MigrationRollbackReport} from "@docktor/shared";
import {toast} from "sonner";
import {
    MIGRATION_ERROR_FALLBACK,
    migrationOutcomeMessage,
    migrationStepLabel,
    showMigrationToast,
} from "@/lib/migration-progress";

vi.mock("sonner", () => ({
    toast: {error: vi.fn(), info: vi.fn(), success: vi.fn(), loading: vi.fn(), warning: vi.fn()},
}));

function makeOperation(overrides: Partial<MigrationOperation> = {}): MigrationOperation {
    return {
        id: "op-1",
        stackId: "db",
        displayName: "db",
        composePath: "/host/opt/db/docker-compose.yml",
        backup: false,
        stopOldStack: true,
        status: "running",
        step: "starting",
        stepDetail: null,
        startedAt: "2026-10-16T10:00:00.000Z",
        finishedAt: null,
        result: null,
        ...overrides,
    };
}

function ended(
    status: "failed" | "rolled_back",
    rollback: MigrationRollbackReport | undefined,
    result: Partial<NonNullable<MigrationOperation["result"]>> = {},
): MigrationOperation {
    return makeOperation({
        status,
        step: "finished",
        finishedAt: "2026-10-16T10:01:00.000Z",
        result: {success: false, error: "Migration failed: disk full.", originalPath: "/host/opt/db", ...result, ...(rollback && {rollback})},
    });
}

const report = (overrides: Partial<MigrationRollbackReport> = {}): MigrationRollbackReport => ({
    oldStack: "restored-running",
    original: "untouched",
    cleanupErrors: [],
    ...overrides,
});

describe("migrationStepLabel", () => {
    it("labels the verified stop and the requested restart honestly", () => {
        expect(migrationStepLabel({step: "verifying_stop", stepDetail: null})).toBe("Checking that the old stack is stopped");
        expect(migrationStepLabel({step: "restarting_old_stack", stepDetail: null})).toBe("Restart of the original stack requested");
    });

    it("appends the step detail", () => {
        expect(migrationStepLabel({step: "copying_named_volume", stepDetail: "pgdata"})).toBe("Copying volume pgdata");
    });
});

describe("migrationOutcomeMessage", () => {
    it("states a verified restore", () => {
        const message = migrationOutcomeMessage(ended("rolled_back", report()));

        expect(message.description).toContain("Original stack restored and running.");
    });

    it("states that an untouched original was not changed when the stop never happened", () => {
        const message = migrationOutcomeMessage(ended("rolled_back", report({oldStack: "not-stopped"})));

        expect(message.description).toContain("Your original stack was not changed.");
    });

    it.each(["restart-unverified", "restart-failed"] as const)("warns to check manually for %s", (oldStack) => {
        const message = migrationOutcomeMessage(ended("failed", report({oldStack})));

        expect(message.description).toContain("Rolled back, but the original stack is not running — check it manually.");
    });

    it("points to the kept original directory when it was left aside", () => {
        const message = migrationOutcomeMessage(
            ended("failed", report({oldStack: "left-stopped", original: "left-aside", keptOriginalAt: "/opt/db-aside"})),
        );

        expect(message.description).toContain("The original stack directory is still at /opt/db-aside; move it back and start it by hand.");
    });

    it("says the stack is stopped when only the stop was left in place", () => {
        const message = migrationOutcomeMessage(ended("failed", report({oldStack: "left-stopped"})));

        expect(message.description).toContain("The original stack is stopped; start it by hand from /host/opt/db.");
    });

    it("appends cleanup errors", () => {
        const message = migrationOutcomeMessage(ended("rolled_back", report({cleanupErrors: ["rm: busy", "rmdir: busy"]})));

        expect(message.description).toContain("Could not clean up: rm: busy; rmdir: busy");
    });

    it("shows the server error text as detail", () => {
        const message = migrationOutcomeMessage(ended("rolled_back", report()));

        expect(message.description).toContain("Migration failed: disk full.");
    });

    it("makes no claim about the original stack when there is no rollback report", () => {
        const message = migrationOutcomeMessage(ended("failed", undefined));

        expect(message.description).toBe("Migration failed: disk full.");
    });

    it("falls back to a message that claims no outcome when the failure carries no error text", () => {
        const message = migrationOutcomeMessage(ended("failed", undefined, {error: undefined}));

        expect(message.description).toBe(MIGRATION_ERROR_FALLBACK);
        expect(MIGRATION_ERROR_FALLBACK).not.toContain("was not modified");
    });

    it.each([
        ["not-stopped", "untouched"],
        ["restart-unverified", "untouched"],
        ["restart-failed", "restored"],
        ["left-stopped", "untouched"],
        ["left-stopped", "left-aside"],
    ] as const)("never claims a restart unless the old stack is restored-running (%s, %s)", (oldStack, original) => {
        const message = migrationOutcomeMessage(ended("failed", report({oldStack, original, keptOriginalAt: "/opt/aside"}), {error: undefined}));

        expect(`${message.title} ${message.description ?? ""}`).not.toMatch(/restarted/i);
        expect(`${message.title} ${message.description ?? ""}`).not.toContain("restored and running");
    });
});

describe("showMigrationToast", () => {
    beforeEach(() => vi.clearAllMocks());

    it("renders the running operation as a loading toast keyed by the operation id", () => {
        showMigrationToast(makeOperation({step: "restarting_old_stack"}), vi.fn());

        expect(toast.loading).toHaveBeenCalledWith("Migrating db: Restart of the original stack requested…", {id: "op-1"});
    });

    it("renders rolled_back as a warning with the verified outcome", () => {
        showMigrationToast(ended("rolled_back", report()), vi.fn());

        expect(toast.warning).toHaveBeenCalledWith(
            expect.stringContaining("rolled back"),
            expect.objectContaining({id: "op-1", description: expect.stringContaining("Original stack restored and running.")}),
        );
        expect(toast.error).not.toHaveBeenCalled();
    });

    it("renders failed as an error with the same id", () => {
        showMigrationToast(ended("failed", report({oldStack: "restart-unverified"})), vi.fn());

        expect(toast.error).toHaveBeenCalledWith(
            expect.stringContaining("failed"),
            expect.objectContaining({id: "op-1", description: expect.stringContaining("check it manually")}),
        );
        expect(toast.warning).not.toHaveBeenCalled();
    });

    it("renders success with the View stack action", () => {
        const navigate = vi.fn();
        showMigrationToast(
            makeOperation({status: "succeeded", step: "finished", result: {success: true, stackId: "db", originalPath: "/host/opt/db"}}),
            navigate,
        );

        expect(toast.success).toHaveBeenCalledWith(
            "Migration complete! db is now managed by Docktor",
            expect.objectContaining({id: "op-1", action: expect.objectContaining({label: "View stack"})}),
        );
    });

    it("renders a succeeded operation without a stack id as a success without the View stack action (IN-04)", () => {
        showMigrationToast(
            makeOperation({status: "succeeded", step: "finished", result: {success: true, originalPath: "/host/opt/db"}}),
            vi.fn(),
        );

        expect(toast.success).toHaveBeenCalledWith(
            "Migration complete! db is now managed by Docktor",
            expect.not.objectContaining({action: expect.anything()}),
        );
        expect(toast.error).not.toHaveBeenCalled();
    });
});
