import type {
    MigrationLedgerEntry,
    MigrationRollbackOldStackOutcome,
    MigrationRollbackOriginalOutcome,
    MigrationRollbackReport,
} from "@docktor/shared";
import {
    allServicesRunning,
    compensationOrder,
    RESTART_VERIFY_INTERVAL_MS,
    RESTART_VERIFY_TIMEOUT_MS,
} from "../domain/migration-rollback.js";
import type {ComposeProjectTarget} from "../domain/compose-project.js";
import type {StackRepository} from "../repositories/stack-repository.js";
import {errorMessage, reportMigrationProgress, type MigrationLogger, type MigrationProgressListener} from "./migration-progress.js";
import type {ComposeProjectResolverPort} from "./ports/compose-project-resolver-port.js";
import type {ExternalStackControlPort} from "./ports/external-stack-control-port.js";
import type {StackFilesystemPort} from "./ports/stack-filesystem-port.js";
import type {VolumeMigratorPort} from "./ports/volume-migrator-port.js";

/** What the rollback verified, and the restart error when starting the old stack failed. */
export interface MigrationRollbackOutcome {
    readonly report: MigrationRollbackReport;
    readonly restartError?: string;
}

export interface MigrationRollbackRunnerDependencies {
    stackFs: Pick<StackFilesystemPort, "removeDirectory">;
    stackRepo: Pick<StackRepository, "delete">;
    migrator: Pick<VolumeMigratorPort, "moveDirectory">;
    oldStack: Pick<ExternalStackControlPort, "start">;
    projects: Pick<ComposeProjectResolverPort, "listContainers">;
    /** True when anything, even a dangling symlink, occupies the path; the rename back only goes into a free one. */
    pathTaken: (target: string) => Promise<boolean>;
    logger: MigrationLogger;
    sleep: (ms: number) => Promise<void>;
    /** Milliseconds, comparable between calls. */
    now: () => number;
}

/** What the compensation learns on its way back through the ledger. */
interface RollbackState {
    oldStack: MigrationRollbackOldStackOutcome;
    original: MigrationRollbackOriginalOutcome;
    keptOriginalAt?: string;
    restartError?: string;
    readonly cleanupErrors: string[];
    readonly onProgress: MigrationProgressListener | undefined;
}

/**
 * Undoes what a failed migration run did, in reverse order, from its ledger
 * (#100). It only undoes what the ledger says this run did, never deletes a
 * volume, never replaces a path, and reports only what it verified: the old
 * stack counts as restored once its services were seen running (D-07).
 */
export class MigrationRollbackRunner {
    constructor(private readonly deps: MigrationRollbackRunnerDependencies) {}

    async run(
        entries: readonly MigrationLedgerEntry[],
        options: {readonly onProgress?: MigrationProgressListener} = {},
    ): Promise<MigrationRollbackOutcome> {
        const state: RollbackState = {oldStack: "not-stopped", original: "untouched", cleanupErrors: [], onProgress: options.onProgress};
        for (const entry of compensationOrder(entries)) {
            await this.compensate(entry, state);
        }
        const report: MigrationRollbackReport = {
            oldStack: state.oldStack,
            original: state.original,
            ...(state.keptOriginalAt === undefined ? {} : {keptOriginalAt: state.keptOriginalAt}),
            cleanupErrors: state.cleanupErrors,
        };
        return state.restartError === undefined ? {report} : {report, restartError: state.restartError};
    }

    private compensate(entry: MigrationLedgerEntry, state: RollbackState): Promise<void> {
        switch (entry.kind) {
            case "created_record":
                return this.attempt(state, "remove the stack record", () => this.deps.stackRepo.delete(entry.stackId));
            case "created_directory":
                return this.attempt(state, "remove the new stack directory", () => this.deps.stackFs.removeDirectory(entry.stackId));
            case "moved_aside":
                return this.moveOriginalBack(entry, state);
            case "stopped_old_stack":
                return this.restoreOldStack(entry, state);
            case "deploy_started":
                return Promise.resolve();
        }
    }

    /** One cleanup action: a failure is logged and listed, and never stops the remaining steps. */
    private async attempt(state: RollbackState, what: string, action: () => Promise<void>): Promise<void> {
        try {
            await action();
        } catch (error: unknown) {
            this.recordCleanupError(state, what, error);
        }
    }

    private recordCleanupError(state: RollbackState, what: string, error: unknown): void {
        const message = `${what}: ${errorMessage(error)}`;
        this.deps.logger.error(`[MigrationService] Rollback could not ${message}`);
        state.cleanupErrors.push(message);
    }

    /**
     * G-18-7: rename the original back, but only into a free path, so nothing is
     * ever replaced or deleted. When that is impossible the renamed original stays
     * where it is and the report names the place.
     */
    private async moveOriginalBack(entry: Extract<MigrationLedgerEntry, {kind: "moved_aside"}>, state: RollbackState): Promise<void> {
        const {originalDir, asideDir} = entry;
        try {
            if (!(await this.deps.pathTaken(originalDir))) {
                await this.deps.migrator.moveDirectory(asideDir, originalDir);
                state.original = "restored";
                return;
            }
        } catch (error: unknown) {
            this.recordCleanupError(state, "move the original directory back", error);
        }
        if (state.original !== "restored") {
            state.original = "left-aside";
            state.keptOriginalAt = asideDir;
        }
    }

    /** D-11, #100: start only the services that ran before the stop, then wait until they are seen running. */
    private async restoreOldStack(entry: Extract<MigrationLedgerEntry, {kind: "stopped_old_stack"}>, state: RollbackState): Promise<void> {
        if (state.original === "left-aside") {
            state.oldStack = "left-stopped";
            return;
        }
        if (entry.runningBefore.length === 0) {
            state.oldStack = "not-stopped";
            return;
        }
        const target: ComposeProjectTarget = {composePath: entry.composePath, project: entry.project};
        reportMigrationProgress(this.deps.logger, state.onProgress, "restarting_old_stack");
        try {
            await this.deps.oldStack.start(target, entry.runningBefore);
        } catch (error: unknown) {
            this.deps.logger.error(`[MigrationService] Failed to restart the old stack: ${errorMessage(error)}`);
            state.oldStack = "restart-failed";
            state.restartError = errorMessage(error);
            return;
        }
        state.oldStack = (await this.waitUntilRunning(target, entry.runningBefore)) ? "restored-running" : "restart-unverified";
    }

    /** D-07: polls the project until every service runs or the timeout passes. */
    private async waitUntilRunning(target: ComposeProjectTarget, services: readonly string[]): Promise<boolean> {
        const deadline = this.deps.now() + RESTART_VERIFY_TIMEOUT_MS;
        for (;;) {
            if (await this.seenRunning(target, services)) {
                return true;
            }
            if (this.deps.now() >= deadline) {
                return false;
            }
            await this.deps.sleep(RESTART_VERIFY_INTERVAL_MS);
        }
    }

    private async seenRunning(target: ComposeProjectTarget, services: readonly string[]): Promise<boolean> {
        try {
            return allServicesRunning(services, await this.deps.projects.listContainers(target.project, target.composePath));
        } catch (error: unknown) {
            this.deps.logger.warn(`[MigrationService] Could not check whether the old stack runs yet: ${errorMessage(error)}`);
            return false;
        }
    }
}
