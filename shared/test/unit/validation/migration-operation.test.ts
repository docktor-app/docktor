import {describe, expect, it} from "vitest";
import {
    MIGRATION_OPERATION_STATUSES,
    MIGRATION_OPERATION_STEPS,
    MIGRATION_ROLLBACK_ORIGINAL_OUTCOMES,
    MIGRATION_ROLLBACK_OLD_STACK_OUTCOMES,
    migrationOperationListSchema,
    migrationOperationParamsSchema,
    migrationOperationSchema,
    migrationJournalSchema,
    migrationLedgerEntrySchema,
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

describe("migrationLedgerEntrySchema", () => {
    const STOPPED = {
        kind: "stopped_old_stack",
        project: "memos",
        composePath: "/opt/memos/docker-compose.yml",
        runningBefore: ["db", "web"],
        sharesProjectWithNewStack: false,
    };

    it.each([
        ["stopped_old_stack", STOPPED],
        ["moved_aside", {kind: "moved_aside", originalDir: "/opt/memos", asideDir: "/opt/memos-pre-migration"}],
        ["created_directory", {kind: "created_directory", stackId: "my-app", ownerId: "owner-1"}],
        ["created_record", {kind: "created_record", stackId: "my-app", ownerId: "owner-1"}],
        ["deploy_started", {kind: "deploy_started", stackId: "my-app", ownerId: "owner-1"}],
    ])("parses a %s entry", (_kind, entry) => {
        expect(migrationLedgerEntrySchema.safeParse(entry).success).toBe(true);
    });

    it.each([
        ["an unknown kind", {kind: "deleted_volume", stackId: "my-app"}],
        ["an uppercase stack id", {kind: "created_directory", stackId: "My-App", ownerId: "owner-1"}],
        ["a stack id with a path separator", {kind: "created_record", stackId: "../etc", ownerId: "owner-1"}],
        ["a stack id with a double hyphen", {kind: "deploy_started", stackId: "my--app", ownerId: "owner-1"}],
        ["a stack id of 64 characters", {kind: "created_directory", stackId: "a".repeat(64), ownerId: "owner-1"}],
        ["a missing owner id", {kind: "created_directory", stackId: "my-app"}],
        ["an empty owner id", {kind: "deploy_started", stackId: "my-app", ownerId: ""}],
        ["an empty aside path", {kind: "moved_aside", originalDir: "/opt/memos", asideDir: ""}],
        ["an empty original path", {kind: "moved_aside", originalDir: "", asideDir: "/opt/aside"}],
        ["an empty compose path", {...STOPPED, composePath: ""}],
        ["a missing sharesProjectWithNewStack flag", {kind: "stopped_old_stack", project: "memos", composePath: "/c.yml", runningBefore: []}],
    ])("rejects %s", (_label, entry) => {
        expect(migrationLedgerEntrySchema.safeParse(entry).success).toBe(false);
    });
});

describe("migrationJournalSchema", () => {
    const DOCUMENT = {
        version: 1,
        operation: RUNNING,
        originalDir: "/opt/memos",
        ledger: [{kind: "created_directory", stackId: "my-app", ownerId: "owner-1"}],
    };

    it("parses a versioned document with an operation, the original directory and a ledger", () => {
        expect(migrationJournalSchema.safeParse(DOCUMENT).success).toBe(true);
        expect(migrationJournalSchema.safeParse({...DOCUMENT, ledger: []}).success).toBe(true);
        expect(migrationJournalSchema.safeParse({...DOCUMENT, recoveryAttempts: 2}).success).toBe(true);
        expect(
            migrationJournalSchema.safeParse({...DOCUMENT, ledger: [], completedAt: "2026-01-01T10:05:00.000Z"}).success,
        ).toBe(true);
    });

    it.each([
        ["another version", {...DOCUMENT, version: 2}],
        ["no version", {operation: RUNNING, originalDir: "/opt/memos", ledger: []}],
        ["a negative recovery attempt count", {...DOCUMENT, recoveryAttempts: -1}],
        ["a completion time that is not a date", {...DOCUMENT, completedAt: "later"}],
        ["an operation id with a slash", {...DOCUMENT, operation: {...RUNNING, id: "../op"}}],
        ["an operation id with a dot", {...DOCUMENT, operation: {...RUNNING, id: "op.1"}}],
        ["an operation id of 65 characters", {...DOCUMENT, operation: {...RUNNING, id: "a".repeat(65)}}],
        ["an invalid ledger entry", {...DOCUMENT, ledger: [{kind: "deleted_volume", stackId: "my-app"}]}],
        ["an empty original directory", {...DOCUMENT, originalDir: ""}],
        ["an invalid operation", {...DOCUMENT, operation: {...RUNNING, status: "paused"}}],
    ])("rejects %s", (_label, document) => {
        expect(migrationJournalSchema.safeParse(document).success).toBe(false);
    });

    it("accepts a UUID operation id", () => {
        const operation = {...RUNNING, id: "0b1f4f5e-9a39-4a7e-8d0b-6a7d3c1d2e3f"};
        expect(migrationJournalSchema.safeParse({...DOCUMENT, operation}).success).toBe(true);
    });
});
