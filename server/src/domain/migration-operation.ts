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

function byStartedAtDescending(a: MigrationOperation, b: MigrationOperation): number {
    return Date.parse(b.startedAt) - Date.parse(a.startedAt);
}

/**
 * The operations worth keeping, newest first by start time: every running one,
 * plus finished ones that ended no longer than `maxAgeMs` ago, at most
 * `maxFinished` of them (the newest). Running operations are never dropped, so
 * a slow migration stays readable for as long as it runs.
 */
export function pruneFinishedOperations(
    operations: readonly MigrationOperation[],
    now: Date,
    maxAgeMs: number,
    maxFinished: number,
): MigrationOperation[] {
    const sorted = [...operations].sort(byStartedAtDescending);
    const recent = (operation: MigrationOperation): boolean =>
        operation.finishedAt === null || now.getTime() - Date.parse(operation.finishedAt) <= maxAgeMs;
    const finishedKept = new Set(
        sorted.filter((operation) => operation.status !== "running" && recent(operation)).slice(0, maxFinished),
    );
    return sorted.filter((operation) => operation.status === "running" || finishedKept.has(operation));
}
