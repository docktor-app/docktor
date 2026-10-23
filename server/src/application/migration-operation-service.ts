import {randomUUID} from "node:crypto";
import path from "node:path";
import {
    maskSecrets,
    type MigrationOperation,
    type MigrationOperationResult,
    type MigrationRollbackReport,
} from "@docktor/shared";
import {
    finishMigrationOperation,
    pruneFinishedOperations,
    recordMigrationStep,
    startMigrationOperation,
} from "../domain/migration-operation.js";
import {domainEventBus} from "../infrastructure/event-bus.js";
import {migrationJournal} from "../infrastructure/migration-journal.js";
import {ConflictError, NotFoundError} from "../lib/errors.js";
import {toComparablePath} from "../domain/self-stack-paths.js";
import {slugify} from "../lib/slugify.js";
import {errorMessage} from "./migration-progress.js";
import {JournaledMigrationLedger} from "./journaled-migration-ledger.js";
import type {EventBusPort} from "./ports/event-bus-port.js";
import type {MigrationJournalPort} from "./ports/migration-journal-port.js";
import {
    migrationService,
    type MigrationInput,
    type MigrationPlan,
    type MigrationProgressListener,
    type MigrationResult,
    type MigrationService,
} from "./migration-service.js";

const ONE_HOUR_MS = 60 * 60 * 1000;
const MAX_FINISHED_OPERATIONS = 50;

type MigrationRunner = Pick<MigrationService, "preflight" | "execute">;

function maskError(error: string | undefined): string | undefined {
    return error === undefined ? undefined : maskSecrets(error);
}

// Cleanup errors are filesystem and database messages that can echo paths and
// credentials as well, so they are masked like the error text.
function maskRollback(rollback: MigrationRollbackReport | undefined): MigrationRollbackReport | undefined {
    return rollback === undefined
        ? undefined
        : {...rollback, cleanupErrors: rollback.cleanupErrors.map((entry) => maskSecrets(entry))};
}

// The error text is compose/docker stderr and may echo URL credentials or
// KEY=value pairs; it is masked before it is stored, listed or broadcast.
function toOperationResult(result: MigrationResult): MigrationOperationResult {
    return {
        success: result.success,
        stackId: result.stackId,
        error: maskError(result.error),
        originalPath: result.originalPath,
        keptOriginalAt: result.keptOriginalAt,
        rollback: maskRollback(result.rollback),
    };
}

/**
 * Runs migrations as one-off background operations (G-18-job). `start` awaits
 * the side-effect-free preflight, so every refusal stays a synchronous 4xx and
 * creates no operation, then runs `execute` without awaiting it.
 *
 * A failed run ends `rolled_back` when its rollback report verified the original
 * stack is back (not stopped, or seen running again; directory untouched or
 * moved back) and `failed` otherwise, so the outcomes shown are verified ones.
 *
 * Operations are kept in memory (one Docktor instance). What a restart would
 * lose is covered by the migration journal (D-06): every run writes its
 * operation, original directory and ledger to disk before each destructive
 * step and removes them when it ends, and the boot recovery rolls back what a
 * restart interrupted.
 */
export class MigrationOperationService {
    private readonly operations = new Map<string, MigrationOperation>();
    private readonly inFlight = new Set<string>();

    constructor(
        private readonly migrations: MigrationRunner = migrationService,
        private readonly newId: () => string = randomUUID,
        private readonly now: () => Date = () => new Date(),
        private readonly events: Pick<EventBusPort, "emit"> = domainEventBus,
        private readonly journal: MigrationJournalPort = migrationJournal,
        private readonly logger: Pick<Console, "info" | "error"> = console,
    ) {}

    async start(input: MigrationInput): Promise<MigrationOperation> {
        this.prune();
        const heldKeys = this.holdInFlight(input);
        let plan: MigrationPlan;
        try {
            plan = await this.migrations.preflight(input);
        } catch (error) {
            this.releaseInFlight(heldKeys);
            throw error;
        }
        const operation = startMigrationOperation({
            id: this.newId(),
            stackId: plan.stackId,
            displayName: input.displayName,
            composePath: input.composePath,
            backup: input.backup,
            stopOldStack: input.stopOldStack,
            startedAt: this.now(),
        });
        this.save(operation);
        void this.run(operation, plan, heldKeys);
        return operation;
    }

    /** Running and recently finished operations, newest first. */
    list(): MigrationOperation[] {
        this.prune();
        return [...this.operations.values()];
    }

    get(operationId: string): MigrationOperation {
        this.prune();
        const operation = this.operations.get(operationId);
        if (!operation) {
            throw new NotFoundError("Migration operation not found");
        }
        return operation;
    }

    /**
     * Refuses a second run of the same stack slug or the same compose file and
     * holds both keys otherwise. Synchronous on purpose: check and hold happen
     * in one event-loop turn, so two racing starts cannot both pass. Process-
     * local guard; the exclusive mkdir and the unique record id inside
     * `execute` remain the cross-process backstops (18-06).
     */
    private holdInFlight(input: MigrationInput): string[] {
        const slug = slugify(input.displayName);
        // An empty slug has no stack key; preflight refuses it.
        const stackKey = slug === "" ? null : `stack:${slug}`;
        const composeKey = `compose:${toComparablePath(path.resolve(input.composePath))}`;
        if (stackKey !== null && this.inFlight.has(stackKey)) {
            throw new ConflictError(`A migration to stack "${slug}" is already running`);
        }
        if (this.inFlight.has(composeKey)) {
            throw new ConflictError("This stack is already being migrated");
        }
        const keys = stackKey === null ? [composeKey] : [stackKey, composeKey];
        for (const key of keys) {
            this.inFlight.add(key);
        }
        return keys;
    }

    private releaseInFlight(keys: readonly string[]): void {
        for (const key of keys) {
            this.inFlight.delete(key);
        }
    }

    private recordStep(operationId: string, progress: Parameters<MigrationProgressListener>[0]): void {
        const current = this.operations.get(operationId);
        if (current) {
            this.save(recordMigrationStep(current, progress.step, progress.detail));
        }
    }

    /** Stores the operation and publishes it, so the stored and the published state never differ. */
    private save(operation: MigrationOperation): void {
        this.operations.set(operation.id, operation);
        this.events.emit("migration.progressed", {operation});
    }

    private prune(): void {
        const kept = pruneFinishedOperations(
            [...this.operations.values()],
            this.now(),
            ONE_HOUR_MS,
            MAX_FINISHED_OPERATIONS,
        );
        this.operations.clear();
        for (const operation of kept) {
            this.operations.set(operation.id, operation);
        }
    }

    private async run(operation: MigrationOperation, plan: MigrationPlan, heldKeys: readonly string[]): Promise<void> {
        try {
            // The journal is removed inside execute, before the finished operation is saved: a crash in
            // between can then never replay a rollback that already ran.
            const result = await this.execute(plan, operation);
            const current = this.operations.get(operation.id);
            if (current) {
                this.save(finishMigrationOperation(current, result, this.now()));
            }
        } finally {
            this.releaseInFlight(heldKeys);
        }
    }

    private async execute(plan: MigrationPlan, operation: MigrationOperation): Promise<MigrationOperationResult> {
        const ledger = new JournaledMigrationLedger(this.journal, {
            version: 1,
            operation,
            originalDir: plan.originalDir,
        });
        try {
            await ledger.start();
        } catch (error: unknown) {
            // Nothing ran: without a journal a restart could not undo the first step, so no step runs.
            this.logger.error(`[migration] The journal of ${operation.id} could not be written: ${errorMessage(error)}`);
            return {
                success: false,
                error: maskSecrets(
                    `Migration not started: the migration journal could not be written: ${errorMessage(error)}`,
                ),
                originalPath: plan.originalDir,
            };
        }
        const result = await this.executeJournaled(plan, operation.id, ledger);
        await this.discardJournal(ledger, operation.id);
        return result;
    }

    private async executeJournaled(
        plan: MigrationPlan,
        operationId: string,
        ledger: JournaledMigrationLedger,
    ): Promise<MigrationOperationResult> {
        try {
            return toOperationResult(
                await this.migrations.execute(plan, {
                    onProgress: (progress) => this.recordStep(operationId, progress),
                    ledger,
                }),
            );
        } catch (error) {
            // execute reports step failures as results; a rejection is a bug or
            // an infrastructure fault, and must still end the operation.
            this.logger.error("Migration run rejected unexpectedly:", error);
            return {success: false, error: maskSecrets(`Migration failed: ${errorMessage(error)}`), originalPath: plan.originalDir};
        }
    }

    /** A journal that cannot be removed is logged, never thrown: the operation's outcome is already known. */
    private async discardJournal(ledger: JournaledMigrationLedger, operationId: string): Promise<void> {
        try {
            await ledger.discard();
        } catch (error: unknown) {
            this.logger.error(`[migration] The journal of ${operationId} could not be removed: ${errorMessage(error)}`);
        }
    }
}

export const migrationOperationService = new MigrationOperationService();
