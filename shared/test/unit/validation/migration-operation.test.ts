import {describe, expect, it} from "vitest";
import {
    MIGRATION_OPERATION_STATUSES,
    MIGRATION_OPERATION_STEPS,
    MIGRATION_ROLLBACK_ORIGINAL_OUTCOMES,
    MIGRATION_ROLLBACK_OLD_STACK_OUTCOMES,
    migrationOperationListSchema,
    migrationOperationParamsSchema,
    migrationOperationSchema,
    migrationResultSchema,
    migrationRollbackReportSchema,
} from "../../../src/validation/migration-operation.js";

const RUNNING = {
    id: "op-1",
    stackId: "my-app",
    displayName: "My App",
    composePath: "/opt/app/docker-compose.yml",
    backup: true,
    stopOldStack: false,
    status: "running",
    step: "starting",
    stepDetail: null,
    startedAt: "2026-01-01T10:00:00.000Z",
    finishedAt: null,
    result: null,
};

describe("migrationOperationSchema", () => {
    it("accepts a running operation", () => {
        expect(migrationOperationSchema.safeParse(RUNNING).success).toBe(true);
    });

    it("accepts a failed operation carrying its result", () => {
        const failed = {
            ...RUNNING,
            status: "failed",
            step: "finished",
            finishedAt: "2026-01-01T10:05:00.000Z",
            result: {success: false, error: "Migration failed: boom.", originalPath: "/opt/app"},
        };

        expect(migrationOperationSchema.safeParse(failed).success).toBe(true);
    });

    it("rejects an unknown step", () => {
        expect(migrationOperationSchema.safeParse({...RUNNING, step: "teleporting"}).success).toBe(false);
    });

    it("rejects an unknown status", () => {
        expect(migrationOperationSchema.safeParse({...RUNNING, status: "paused"}).success).toBe(false);
    });
});

describe("migrationOperationParamsSchema", () => {
    it("rejects an empty operation id", () => {
        expect(migrationOperationParamsSchema.safeParse({operationId: ""}).success).toBe(false);
    });

    it("rejects an operation id longer than 64 characters", () => {
        expect(migrationOperationParamsSchema.safeParse({operationId: "x".repeat(65)}).success).toBe(false);
    });
});

describe("migrationOperationListSchema", () => {
    it("accepts a list of operations", () => {
        expect(migrationOperationListSchema.safeParse({operations: [RUNNING]}).success).toBe(true);
    });
});

describe("operation contract (D-01)", () => {
    it("has the statuses running, succeeded, failed and rolled_back", () => {
        expect([...MIGRATION_OPERATION_STATUSES]).toEqual(["running", "succeeded", "failed", "rolled_back"]);
    });

    it("orders the steps as D-01: stop, verify stop, rename aside, create, back up, copy, write, record, deploy, roll back, restart requested, finished", () => {
        expect([...MIGRATION_OPERATION_STEPS]).toEqual([
            "starting",
            "stopping_old_stack",
            "verifying_stop",
            "moving_original_aside",
            "creating_directory",
            "backing_up",
            "copying_named_volume",
            "copying_bind_mount",
            "writing_compose",
            "recording_stack",
            "deploying",
            "rolling_back",
            "restarting_old_stack",
            "finished",
        ]);
    });

    it("accepts a rolled_back operation at the restart step", () => {
        const operation = {...RUNNING, status: "rolled_back", step: "restarting_old_stack"};

        expect(migrationOperationSchema.safeParse(operation).success).toBe(true);
    });
});

describe("migrationRollbackReportSchema", () => {
    it("lists the verified outcomes of the old stack and of the original directory", () => {
        expect([...MIGRATION_ROLLBACK_OLD_STACK_OUTCOMES]).toEqual([
            "not-stopped",
            "restored-running",
            "restart-unverified",
            "restart-failed",
            "left-stopped",
        ]);
        expect([...MIGRATION_ROLLBACK_ORIGINAL_OUTCOMES]).toEqual(["untouched", "restored", "left-aside"]);
    });

    it("accepts a verified restore", () => {
        const report = {oldStack: "restored-running", original: "untouched", cleanupErrors: []};

        expect(migrationRollbackReportSchema.safeParse(report).success).toBe(true);
    });

    it("accepts a left-aside original with its location and cleanup errors", () => {
        const report = {oldStack: "left-stopped", original: "left-aside", keptOriginalAt: "/opt/db-aside", cleanupErrors: ["rm: busy"]};

        expect(migrationRollbackReportSchema.safeParse(report).success).toBe(true);
    });

    it.each([
        ["an unknown oldStack outcome", {oldStack: "restarted", original: "untouched", cleanupErrors: []}],
        ["an unknown original outcome", {oldStack: "restored-running", original: "gone", cleanupErrors: []}],
        ["a missing cleanupErrors list", {oldStack: "restored-running", original: "untouched"}],
    ])("rejects %s", (_label, report) => {
        expect(migrationRollbackReportSchema.safeParse(report).success).toBe(false);
    });

    it("is optional on a migration result (backward compatible)", () => {
        const base = {success: false, error: "boom", originalPath: "/opt/app"};

        expect(migrationResultSchema.safeParse(base).success).toBe(true);
        expect(
            migrationResultSchema.safeParse({...base, rollback: {oldStack: "restored-running", original: "untouched", cleanupErrors: []}}).success,
        ).toBe(true);
        expect(migrationResultSchema.safeParse({...base, rollback: {oldStack: "nope", original: "untouched", cleanupErrors: []}}).success).toBe(false);
    });
});
