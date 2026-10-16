import type {MigrationOperation, MigrationOperationResult} from "@docktor/shared";

/** What identifies a migration run; all of it is known once preflight passed. */
export interface MigrationOperationStart {
    readonly id: string;
    readonly stackId: string;
    readonly displayName: string;
    readonly composePath: string;
    readonly backup: boolean;
    readonly stopOldStack: boolean;
    readonly startedAt: Date;
}

/** A freshly started operation: running, at its first step, no result yet. */
export function startMigrationOperation(start: MigrationOperationStart): MigrationOperation {
    return {
        id: start.id,
        stackId: start.stackId,
        displayName: start.displayName,
        composePath: start.composePath,
        backup: start.backup,
        stopOldStack: start.stopOldStack,
        status: "running",
        step: "starting",
        stepDetail: null,
        startedAt: start.startedAt.toISOString(),
        finishedAt: null,
        result: null,
    };
}

/** The terminal state of an operation; the status follows the migration result. */
export function finishMigrationOperation(
    operation: MigrationOperation,
    result: MigrationOperationResult,
    finishedAt: Date,
): MigrationOperation {
    return {
        ...operation,
        status: result.success ? "succeeded" : "failed",
        step: "finished",
        stepDetail: null,
        finishedAt: finishedAt.toISOString(),
        result,
    };
}
