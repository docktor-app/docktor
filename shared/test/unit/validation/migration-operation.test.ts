import {describe, expect, it} from "vitest";
import {
    migrationOperationListSchema,
    migrationOperationParamsSchema,
    migrationOperationSchema,
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
