import {randomUUID} from "node:crypto";
import path from "node:path";
import type {MigrationOperation, MigrationOperationResult} from "@docktor/shared";
import {
    finishMigrationOperation,
    pruneFinishedOperations,
    startMigrationOperation,
} from "../domain/migration-operation.js";
import {domainEventBus} from "../infrastructure/event-bus.js";
import {ConflictError, NotFoundError} from "../lib/errors.js";
import {toComparablePath} from "../domain/self-stack-paths.js";
import {slugify} from "../lib/slugify.js";
import type {EventBusPort} from "./ports/event-bus-port.js";
import {
    migrationService,
    type MigrationInput,
    type MigrationPlan,
    type MigrationResult,
    type MigrationService,
} from "./migration-service.js";

const ONE_HOUR_MS = 60 * 60 * 1000;
const MAX_FINISHED_OPERATIONS = 50;

type MigrationRunner = Pick<MigrationService, "preflight" | "execute">;

function toOperationResult(result: MigrationResult): MigrationOperationResult {
    return {
        success: result.success,
        stackId: result.stackId,
        error: result.error,
        originalPath: result.originalPath,
        keptOriginalAt: result.keptOriginalAt,
    };
}

/**
 * Runs migrations as one-off background operations (G-18-job). `start` awaits
 * the side-effect-free preflight, so every refusal stays a synchronous 4xx and
 * creates no operation, then runs `execute` without awaiting it.
 *
 * The registry is process-local (one Docktor instance): a restart ends running
 * migrations together with the process, so persisting them would only keep
 * stale "running" rows.
 */
export class MigrationOperationService {
    private readonly operations = new Map<string, MigrationOperation>();
    private readonly inFlight = new Set<string>();

    constructor(
        private readonly migrations: MigrationRunner = migrationService,
        private readonly newId: () => string = randomUUID,
        private readonly now: () => Date = () => new Date(),
        private readonly events: Pick<EventBusPort, "emit"> = domainEventBus,
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
        void this.run(operation.id, plan, heldKeys);
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

    private async run(operationId: string, plan: MigrationPlan, heldKeys: readonly string[]): Promise<void> {
        try {
            const result = await this.execute(plan);
            const operation = this.operations.get(operationId);
            if (operation) {
                this.save(finishMigrationOperation(operation, result, this.now()));
            }
        } finally {
            this.releaseInFlight(heldKeys);
        }
    }

    private async execute(plan: MigrationPlan): Promise<MigrationOperationResult> {
        try {
            return toOperationResult(await this.migrations.execute(plan));
        } catch (error) {
            // execute reports step failures as results; a rejection is a bug or
            // an infrastructure fault, and must still end the operation.
            console.error("Migration run rejected unexpectedly:", error);
            const message = error instanceof Error ? error.message : String(error);
            return {success: false, error: `Migration failed: ${message}`, originalPath: plan.originalDir};
        }
    }
}

export const migrationOperationService = new MigrationOperationService();
