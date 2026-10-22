import {z} from "zod";

// G-18-job: a migration can take minutes (stop up to 120 s, volume copies,
// compose up with pulls), so POST migrate answers 202 with one of these
// operations and the run continues in the background. The operation is what
// the client re-reads after a reload or reconnect; progress events carry the
// same `step` values (plan 18-16).

// rolled_back: the migration failed and Docktor verified that the original
// stack is back as it was (see migrationRollbackReportSchema); every other
// failure, including a rollback that could not be verified, stays failed.
export const MIGRATION_OPERATION_STATUSES = ["running", "succeeded", "failed", "rolled_back"] as const;

// D-01: the order IS the execution order. The client's stale-snapshot rule
// compares indexes in this array (a running operation never moves to an
// earlier step), so reordering needs a coordinated server and client change.
export const MIGRATION_OPERATION_STEPS = [
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
] as const;

// What Docktor verified about the old stack after a failed migration.
export const MIGRATION_ROLLBACK_OLD_STACK_OUTCOMES = [
    "not-stopped", // the old stack was never stopped, so nothing needed restoring
    "restored-running", // restart requested and its containers were seen running again
    "restart-unverified", // restart requested, but running containers could not be confirmed in time
    "restart-failed", // the restart command itself failed
    "left-stopped", // stopped, and Docktor did not (or could not) restart it
] as const;

// What Docktor verified about the original stack directory after a failure.
export const MIGRATION_ROLLBACK_ORIGINAL_OUTCOMES = [
    "untouched", // the directory was never moved or modified
    "restored", // an aside rename was moved back to its original path
    "left-aside", // still under its aside name; see keptOriginalAt
] as const;

export const migrationRollbackOldStackOutcomeSchema = z.enum(MIGRATION_ROLLBACK_OLD_STACK_OUTCOMES);
export const migrationRollbackOriginalOutcomeSchema = z.enum(MIGRATION_ROLLBACK_ORIGINAL_OUTCOMES);

export const migrationRollbackReportSchema = z.object({
    oldStack: migrationRollbackOldStackOutcomeSchema,
    original: migrationRollbackOriginalOutcomeSchema,
    // Where the original directory is when `original` is "left-aside".
    keptOriginalAt: z.string().optional(),
    // Leftovers Docktor could not remove; never deletes volumes.
    cleanupErrors: z.array(z.string()),
});

export const migrationOperationStatusSchema = z.enum(MIGRATION_OPERATION_STATUSES);
export const migrationOperationStepSchema = z.enum(MIGRATION_OPERATION_STEPS);

export const migrationResultSchema = z.object({
    success: z.boolean(),
    stackId: z.string().optional(),
    error: z.string().optional(),
    originalPath: z.string(),
    // Where the renamed original directory of an in-place migration was kept.
    keptOriginalAt: z.string().optional(),
    // Present on a failed migration that ran a rollback; absent otherwise.
    rollback: migrationRollbackReportSchema.optional(),
});

export const migrationOperationSchema = z.object({
    id: z.string().min(1),
    stackId: z.string(),
    displayName: z.string(),
    composePath: z.string(),
    backup: z.boolean(),
    stopOldStack: z.boolean(),
    status: migrationOperationStatusSchema,
    step: migrationOperationStepSchema,
    // Free-text refinement of `step`, e.g. the volume being copied.
    stepDetail: z.string().nullable(),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime().nullable(),
    result: migrationResultSchema.nullable(),
});

export const migrationOperationParamsSchema = z.object({
    operationId: z.string().min(1).max(64),
});

export const migrationOperationListSchema = z.object({
    operations: z.array(migrationOperationSchema),
});

export type MigrationOperationStatus = z.infer<typeof migrationOperationStatusSchema>;
export type MigrationOperationStep = z.infer<typeof migrationOperationStepSchema>;
export type MigrationRollbackReport = z.infer<typeof migrationRollbackReportSchema>;
export type MigrationRollbackOldStackOutcome = z.infer<typeof migrationRollbackOldStackOutcomeSchema>;
export type MigrationRollbackOriginalOutcome = z.infer<typeof migrationRollbackOriginalOutcomeSchema>;
export type MigrationOperationResult = z.infer<typeof migrationResultSchema>;
export type MigrationOperation = z.infer<typeof migrationOperationSchema>;
export type MigrationOperationParams = z.infer<typeof migrationOperationParamsSchema>;
export type MigrationOperationList = z.infer<typeof migrationOperationListSchema>;

