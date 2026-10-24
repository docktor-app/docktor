import {randomUUID} from "node:crypto";
import path from "node:path";
import {
    maskErrorText,
    type MigrationJournalDocument,
    type MigrationOperation,
    type MigrationOperationResult,
    type MigrationRollbackReport,
} from "@docktor/shared";
import {
    finishMigrationOperation,
    migrationOperationStatusOf,
    pruneFinishedOperations,
    recordMigrationStep,
    startMigrationOperation,
} from "../domain/migration-operation.js";
import {domainEventBus} from "../infrastructure/event-bus.js";
import {migrationJournal} from "../infrastructure/migration-journal.js";
import {ConflictError, NotFoundError} from "../lib/errors.js";
import {toComparablePath} from "../domain/self-stack-paths.js";
import {slugify} from "../lib/slugify.js";
import {errorMessage, loggableErrorMessage} from "./migration-progress.js";
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

type MigrationRunner = Pick<MigrationService, "preflight" | "execute" | "rollbackInterrupted">;

/** What a boot recovery registered: how many migrations it will roll back, and the (never rejecting) rollback itself. */
export interface MigrationRecovery {
    readonly count: number;
    run(): Promise<void>;
}

const RECOVERY_NOTHING: MigrationRecovery = {count: 0, run: () => Promise.resolve()};

/** A journal that stays on disk would be replayed at the next boot, so its removal is retried before the fallback. */
const JOURNAL_REMOVE_ATTEMPTS = 3;
const JOURNAL_REMOVE_BACKOFF_MS = 200;

/**
 * A rollback that could not be verified (the Docker daemon was not ready after a
 * reboot, a restart timed out) keeps its journal and is tried again at the next
 * boot, this many times in all (WR-09). The replay is safe: it only touches what
 * the journal's ownership marker still proves belongs to the interrupted run.
 */
const MAX_RECOVERY_ATTEMPTS = 3;
const RETRY_NOTICE = "Docktor will try the rollback again the next time it starts.";

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const RESTARTED_MIGRATION_MESSAGE = "Docktor restarted during the migration";

function maskError(error: string | undefined): string | undefined {
    return error === undefined ? undefined : maskErrorText(error);
}

// Cleanup errors are filesystem and database messages that can echo paths and
// credentials as well, so they are masked like the error text.
function maskRollback(rollback: MigrationRollbackReport | undefined): MigrationRollbackReport | undefined {
    return rollback === undefined
        ? undefined
        : {...rollback, cleanupErrors: rollback.cleanupErrors.map((entry) => maskErrorText(entry))};
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
 * The keys a migration holds while it runs: its stack slug and its compose file.
 * One definition for a start and a recovery, so the two guards cannot drift.
 */
function inFlightKeys(stackSlug: string, composePath: string): {stackKey: string | null; composeKey: string} {
    return {
        stackKey: stackSlug === "" ? null : `stack:${stackSlug}`,
        composeKey: `compose:${toComparablePath(path.resolve(composePath))}`,
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
        private readonly sleep: (ms: number) => Promise<void> = defaultSleep,
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

    /** The operations still running, so a shutdown can say which migrations the next boot will roll back (WR-09). */
    runningOperationIds(): string[] {
        return [...this.operations.values()].filter((operation) => operation.status === "running").map((operation) => operation.id);
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
        const {stackKey, composeKey} = inFlightKeys(slug, input.composePath);
        if (stackKey !== null && this.inFlight.has(stackKey)) {
            throw new ConflictError(`A migration to stack "${slug}" is already running`);
        }
        if (this.inFlight.has(composeKey)) {
            throw new ConflictError("This stack is already being migrated");
        }
        return this.hold(stackKey, composeKey);
    }

    private hold(stackKey: string | null, composeKey: string): string[] {
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

    /**
     * D-06: registers the migrations a restart interrupted, each as running at
     * `rolling_back` under its own id so a client that was following it finds it
     * again, and holds its stack and compose keys so none can start again while
     * the recovery runs. Synchronous like {@link start}, so the keys are held
     * before the server accepts a request. `run` rolls the documents back one
     * after the other with the same runner a failed step uses, removes each
     * journal before the finished operation is published, and never rejects.
     */
    recoverInterrupted(documents: readonly MigrationJournalDocument[]): MigrationRecovery {
        if (documents.length === 0) {
            return RECOVERY_NOTHING;
        }
        const pending = documents.map((document) => this.registerInterrupted(document));
        return {
            count: documents.length,
            run: async () => {
                for (const {document, heldKeys} of pending) {
                    await this.recoverOne(document, heldKeys);
                }
            },
        };
    }

    private registerInterrupted(document: MigrationJournalDocument): {document: MigrationJournalDocument; heldKeys: string[]} {
        const {operation} = document;
        const {stackKey, composeKey} = inFlightKeys(operation.stackId, operation.composePath);
        const heldKeys = this.hold(stackKey, composeKey);
        this.save({...operation, status: "running", step: "rolling_back", stepDetail: null, finishedAt: null, result: null});
        return {document, heldKeys};
    }

    private async recoverOne(document: MigrationJournalDocument, heldKeys: readonly string[]): Promise<void> {
        const operationId = document.operation.id;
        try {
            const outcome = await this.rollBackInterrupted(document);
            const result = await this.settleJournal(document, outcome);
            const current = this.operations.get(operationId);
            if (current) {
                this.save(finishMigrationOperation(current, result, this.now()));
            }
        } catch (error: unknown) {
            this.logger.error(`[migration-recovery] Recovering ${operationId} failed unexpectedly: ${loggableErrorMessage(error)}`);
        } finally {
            this.releaseInFlight(heldKeys);
        }
    }

    /**
     * Removes the journal once the rollback was verified, or when the attempts
     * are used up. Otherwise the journal stays, with the attempt counted, so the
     * next boot retries; the journal is removed before the finished operation is
     * published either way.
     */
    private async settleJournal(
        document: MigrationJournalDocument,
        result: MigrationOperationResult,
    ): Promise<MigrationOperationResult> {
        const operationId = document.operation.id;
        const attempts = (document.recoveryAttempts ?? 0) + 1;
        if (migrationOperationStatusOf(result) === "rolled_back" || attempts >= MAX_RECOVERY_ATTEMPTS) {
            await this.discardJournal(operationId, {
                remove: () => this.journal.remove(operationId),
                retire: () => this.retireJournal(document),
            });
            return result;
        }
        try {
            await this.journal.write({...document, recoveryAttempts: attempts});
        } catch (error: unknown) {
            this.logger.error(`[migration-recovery] The journal of ${operationId} could not be kept for a retry: ${loggableErrorMessage(error)}`);
            return result;
        }
        return {...result, error: `${result.error ?? "The rollback could not be verified."} ${RETRY_NOTICE}`};
    }

    /**
     * The result of a rollback after a restart. "Was rolled back" is only said
     * when the report verified it (the same rule that decides `rolled_back`);
     * anything else says what was attempted and leaves the verdict to the report.
     */
    private async rollBackInterrupted(document: MigrationJournalDocument): Promise<MigrationOperationResult> {
        const operationId = document.operation.id;
        const originalPath = document.originalDir;
        try {
            const outcome = await this.migrations.rollbackInterrupted(document.ledger, {
                onProgress: (progress) => this.recordStep(operationId, progress),
            });
            const verified: MigrationOperationResult = {
                success: false,
                error: `${RESTARTED_MIGRATION_MESSAGE}, so the migration was rolled back.`,
                originalPath,
                rollback: outcome.report,
            };
            if (migrationOperationStatusOf(verified) === "rolled_back") {
                return toOperationResult(verified);
            }
            const restart = outcome.restartError === undefined ? "" : ` Restarting the old stack failed: ${outcome.restartError}.`;
            return toOperationResult({
                ...verified,
                error: `${RESTARTED_MIGRATION_MESSAGE}. The migration was stopped and rolled back as far as Docktor could verify; see the rollback report.${restart}`,
            });
        } catch (error: unknown) {
            this.logger.error(`[migration-recovery] The rollback of ${operationId} failed: ${loggableErrorMessage(error)}`);
            return {
                success: false,
                error: maskErrorText(`${RESTARTED_MIGRATION_MESSAGE}, and the rollback failed: ${errorMessage(error)}`),
                originalPath,
            };
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
        } catch (error: unknown) {
            // `run` is not awaited: a throw here (a failing listener, a bug) must neither become an
            // unhandled rejection that ends the process mid-migration nor leave the operation running.
            this.logger.error(`[migration] Run ${operation.id} ended unexpectedly: ${loggableErrorMessage(error)}`);
            this.failUnexpectedly(operation, plan, error);
        } finally {
            this.releaseInFlight(heldKeys);
        }
    }

    /** Ends an operation that is still running after an unexpected throw; never throws itself. */
    private failUnexpectedly(operation: MigrationOperation, plan: MigrationPlan, cause: unknown): void {
        try {
            const current = this.operations.get(operation.id);
            if (current?.status === "running") {
                const result: MigrationOperationResult = {
                    success: false,
                    error: maskErrorText(`Migration failed unexpectedly: ${errorMessage(cause)}`),
                    originalPath: plan.originalDir,
                };
                this.save(finishMigrationOperation(current, result, this.now()));
            }
        } catch (error: unknown) {
            this.logger.error(`[migration] Run ${operation.id} could not be marked failed: ${loggableErrorMessage(error)}`);
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
            this.logger.error(`[migration] The journal of ${operation.id} could not be written: ${loggableErrorMessage(error)}`);
            return {
                success: false,
                error: maskErrorText(
                    `Migration not started: the migration journal could not be written: ${loggableErrorMessage(error)}`,
                ),
                originalPath: plan.originalDir,
            };
        }
        const result = await this.executeJournaled(plan, operation.id, ledger);
        await this.discardJournalOf(operation.id, ledger);
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
            return {success: false, error: maskErrorText(`Migration failed: ${errorMessage(error)}`), originalPath: plan.originalDir};
        }
    }

    /** Removes the journal of a run that ended; its ledger knows how to retire it. */
    private discardJournalOf(operationId: string, ledger: JournaledMigrationLedger): Promise<void> {
        return this.discardJournal(operationId, {
            remove: () => ledger.discard(),
            retire: () => ledger.complete(this.now().toISOString()),
        });
    }

    /** The journal of a recovered migration, rewritten as completed when it cannot be removed. */
    private retireJournal(document: MigrationJournalDocument): Promise<void> {
        return this.journal.write({...document, ledger: [], completedAt: this.now().toISOString()});
    }

    /**
     * The operation's outcome is already known, so a journal that cannot be
     * removed is logged, never thrown. It is retried with a backoff first, then
     * rewritten as completed (empty ledger, `completedAt`) so the next boot does
     * not replay a rollback against whatever lives at that slug by then (CR-02).
     */
    private async discardJournal(
        operationId: string,
        actions: {readonly remove: () => Promise<void>; readonly retire: () => Promise<void>},
    ): Promise<void> {
        for (let attempt = 1; attempt <= JOURNAL_REMOVE_ATTEMPTS; attempt += 1) {
            try {
                await actions.remove();
                return;
            } catch (error: unknown) {
                this.logger.error(
                    `[migration] The journal of ${operationId} could not be removed (attempt ${attempt}/${JOURNAL_REMOVE_ATTEMPTS}): ${errorMessage(error)}`,
                );
                if (attempt < JOURNAL_REMOVE_ATTEMPTS) {
                    await this.sleep(JOURNAL_REMOVE_BACKOFF_MS * 4 ** (attempt - 1));
                }
            }
        }
        try {
            await actions.retire();
            this.logger.info(`[migration] The journal of ${operationId} was marked completed instead; it is not replayed.`);
        } catch (error: unknown) {
            this.logger.error(
                `[migration] The journal of ${operationId} could not be marked completed either: ${errorMessage(error)}. ` +
                    "A rollback replayed from it only touches directories this migration still owns.",
            );
        }
    }
}

export const migrationOperationService = new MigrationOperationService();
