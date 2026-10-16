import {randomUUID} from "node:crypto";
import type {MigrationOperation, MigrationOperationResult} from "@docktor/shared";
import {finishMigrationOperation, startMigrationOperation} from "../domain/migration-operation.js";
import {NotFoundError} from "../lib/errors.js";
import {
    migrationService,
    type MigrationInput,
    type MigrationPlan,
    type MigrationResult,
    type MigrationService,
} from "./migration-service.js";

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

    constructor(
        private readonly migrations: MigrationRunner = migrationService,
        private readonly newId: () => string = randomUUID,
        private readonly now: () => Date = () => new Date(),
    ) {}

    async start(input: MigrationInput): Promise<MigrationOperation> {
        const plan = await this.migrations.preflight(input);
        const operation = startMigrationOperation({
            id: this.newId(),
            stackId: plan.stackId,
            displayName: input.displayName,
            composePath: input.composePath,
            backup: input.backup,
            stopOldStack: input.stopOldStack,
            startedAt: this.now(),
        });
        this.operations.set(operation.id, operation);
        void this.run(operation.id, plan);
        return operation;
    }

    get(operationId: string): MigrationOperation {
        const operation = this.operations.get(operationId);
        if (!operation) {
            throw new NotFoundError("Migration operation not found");
        }
        return operation;
    }

    private async run(operationId: string, plan: MigrationPlan): Promise<void> {
        const result = await this.execute(plan);
        this.operations.set(operationId, finishMigrationOperation(this.get(operationId), result, this.now()));
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
