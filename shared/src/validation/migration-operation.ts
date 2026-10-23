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

// The stack id the server's slugify produces: lowercase letters and digits,
// single hyphens between them, at most 63 characters. A ledger entry names a
// directory and a record a rollback removes, so anything else is refused.
const ledgerStackIdSchema = z
    .string()
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {message: "Must be a slugified stack id"});

// Proves a directory is the one this run created: the run writes the token into
// a marker file in the new stack directory, and a rollback (also one replayed
// after a restart, from a stale journal) only removes the directory, record or
// containers while the marker still holds the token (CR-01, CR-02).
const ledgerOwnerIdSchema = z.string().min(1).max(64);

// What a migration run did to the world, in the order it did it. Rollback undoes
// the entries in reverse; each entry is recorded only after (or, for the stop,
// right before) the side effect it names, so nothing foreign is ever undone.
export const migrationLedgerEntrySchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("stopped_old_stack"),
        project: z.string(),
        composePath: z.string().min(1),
        // The services that ran before the stop; the only ones a rollback starts.
        runningBefore: z.array(z.string()),
        // The new stack runs under the old stack's compose project (in place, or the same name).
        sharesProjectWithNewStack: z.boolean(),
    }),
    z.object({kind: z.literal("moved_aside"), originalDir: z.string().min(1), asideDir: z.string().min(1)}),
    z.object({kind: z.literal("created_directory"), stackId: ledgerStackIdSchema, ownerId: ledgerOwnerIdSchema}),
    z.object({kind: z.literal("created_record"), stackId: ledgerStackIdSchema, ownerId: ledgerOwnerIdSchema}),
    z.object({kind: z.literal("deploy_started"), stackId: ledgerStackIdSchema, ownerId: ledgerOwnerIdSchema}),
]);

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

// The operation id names the journal file, so it is limited to the characters
// of a UUID (and the short ids tests use) before any path is built from it.
export const MIGRATION_JOURNAL_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

// D-06: what Docktor writes to disk while a migration runs, so a restart in the
// middle can roll it back. `version` makes the on-disk format migratable: a
// later Docktor reads the shapes it knows and sets any other aside.
export const migrationJournalSchema = z.object({
    version: z.literal(1),
    operation: migrationOperationSchema.refine((operation) => MIGRATION_JOURNAL_ID_PATTERN.test(operation.id), {
        message: "The operation id must be 1 to 64 letters, digits or hyphens",
        path: ["id"],
    }),
    // The directory the migration reads from; where a restore puts the original back.
    originalDir: z.string().min(1),
    ledger: z.array(migrationLedgerEntrySchema),
});

export const migrationOperationParamsSchema = z.object({
    operationId: z.string().min(1).max(64),
});

export const migrationOperationListSchema = z.object({
    operations: z.array(migrationOperationSchema),
});

export type MigrationLedgerEntry = z.infer<typeof migrationLedgerEntrySchema>;
export type MigrationJournalDocument = z.infer<typeof migrationJournalSchema>;
export type MigrationOperationStatus = z.infer<typeof migrationOperationStatusSchema>;
export type MigrationOperationStep = z.infer<typeof migrationOperationStepSchema>;
export type MigrationRollbackReport = z.infer<typeof migrationRollbackReportSchema>;
export type MigrationRollbackOldStackOutcome = z.infer<typeof migrationRollbackOldStackOutcomeSchema>;
export type MigrationRollbackOriginalOutcome = z.infer<typeof migrationRollbackOriginalOutcomeSchema>;
export type MigrationOperationResult = z.infer<typeof migrationResultSchema>;
export type MigrationOperation = z.infer<typeof migrationOperationSchema>;
export type MigrationOperationParams = z.infer<typeof migrationOperationParamsSchema>;
export type MigrationOperationList = z.infer<typeof migrationOperationListSchema>;

