import {z} from "zod";

// G-18-job: a migration can take minutes (stop up to 120 s, volume copies,
// compose up with pulls), so POST migrate answers 202 with one of these
// operations and the run continues in the background. The operation is what
// the client re-reads after a reload or reconnect; progress events carry the
// same `step` values (plan 18-16).

export const MIGRATION_OPERATION_STATUSES = ["running", "succeeded", "failed"] as const;

export const MIGRATION_OPERATION_STEPS = [
    "starting",
    "stopping_old_stack",
    "moving_original_aside",
    "creating_directory",
    "backing_up",
    "copying_named_volume",
    "copying_bind_mount",
    "writing_compose",
    "recording_stack",
    "deploying",
    "rolling_back",
    "finished",
] as const;

export const migrationOperationStatusSchema = z.enum(MIGRATION_OPERATION_STATUSES);
export const migrationOperationStepSchema = z.enum(MIGRATION_OPERATION_STEPS);

export const migrationResultSchema = z.object({
    success: z.boolean(),
    stackId: z.string().optional(),
    error: z.string().optional(),
    originalPath: z.string(),
    // Where the renamed original directory of an in-place migration was kept.
    keptOriginalAt: z.string().optional(),
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
export type MigrationOperationResult = z.infer<typeof migrationResultSchema>;
export type MigrationOperation = z.infer<typeof migrationOperationSchema>;
export type MigrationOperationParams = z.infer<typeof migrationOperationParamsSchema>;
export type MigrationOperationList = z.infer<typeof migrationOperationListSchema>;
