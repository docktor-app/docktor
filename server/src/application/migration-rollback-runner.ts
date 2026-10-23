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
import type {DockerExecutorPort} from "./ports/docker-executor-port.js";
import type {ExternalStackControlPort} from "./ports/external-stack-control-port.js";
import type {StackFilesystemPort} from "./ports/stack-filesystem-port.js";
import type {VolumeMigratorPort} from "./ports/volume-migrator-port.js";

/** What the rollback verified, and the restart error when starting the old stack failed. */
export interface MigrationRollbackOutcome {
    readonly report: MigrationRollbackReport;
    readonly restartError?: string;
}

export interface MigrationRollbackRunnerDependencies {
    stackFs: Pick<StackFilesystemPort, "removeDirectory" | "ownsDirectory">;
    stackRepo: Pick<StackRepository, "delete" | "exists">;
    migrator: Pick<VolumeMigratorPort, "moveDirectory">;
    /** Only the keep-volumes down: the volume-deleting `down` is deliberately not reachable from a rollback (T-22-19). */
    docker: Pick<DockerExecutorPort, "downKeepVolumes">;
    oldStack: Pick<ExternalStackControlPort, "start" | "restoreServices">;
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
    /** The deploy of the new stack started, so it may have recreated containers of a shared project. */
    readonly deployStarted: boolean;
    readonly onProgress: MigrationProgressListener | undefined;
}

/**
 * Undoes what a failed migration run did, in reverse order, from its ledger
 * (#100). It only undoes what the ledger says this run did, never deletes a
 * volume, never replaces a path, and reports only what it verified: the old
 * stack counts as restored once its services were seen running (D-07).
 *
 * The runner is replay-safe, because a journal replayed after a restart may
 * describe work that was already undone, or that a later run has replaced:
 * the new stack's directory, record and containers are only touched while the
 * directory still carries this run's ownership marker (CR-01, CR-02), and the
 * original is only moved back when it is not already in place.
 */
export class MigrationRollbackRunner {
    constructor(private readonly deps: MigrationRollbackRunnerDependencies) {}

    async run(
        entries: readonly MigrationLedgerEntry[],
        options: {readonly onProgress?: MigrationProgressListener} = {},
    ): Promise<MigrationRollbackOutcome> {
        const state: RollbackState = {
            oldStack: "not-stopped",
            original: "untouched",
            cleanupErrors: [],
            deployStarted: entries.some((entry) => entry.kind === "deploy_started"),
            onProgress: options.onProgress,
        };
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
                return this.attempt(state, "remove the stack record", () =>
                    this.whenOwned(entry, () => this.removeRecord(entry.stackId)),
                );
            case "created_directory":
                return this.attempt(state, "remove the new stack directory", () =>
                    this.whenOwned(entry, () => this.deps.stackFs.removeDirectory(entry.stackId)),
                );
            case "moved_aside":
                return this.moveOriginalBack(entry, state);
            case "stopped_old_stack":
                return this.restoreOldStack(entry, state);
            case "deploy_started":
                return this.attempt(state, "take the new stack down", () =>
                    this.whenOwned(entry, () => this.deps.docker.downKeepVolumes(entry.stackId)),
                );
        }
    }

    /**
     * Runs `action` only while the stack directory still carries this run's
     * marker. Without it the directory, record or project belongs to someone
     * else (the restored original, or a stack that has been in use since) and is
     * left alone.
     */
    private async whenOwned(
        entry: Extract<MigrationLedgerEntry, {kind: "created_directory" | "created_record" | "deploy_started"}>,
        action: () => Promise<void>,
    ): Promise<void> {
        if (await this.deps.stackFs.ownsDirectory(entry.stackId, entry.ownerId)) {
            await action();
            return;
        }
        this.deps.logger.info(
            `[MigrationService] Rollback left "${entry.stackId}" alone for ${entry.kind}: it is not marked as created by this migration`,
        );
    }

    /** A record that was never created (the write-ahead entry preceded the create) or is gone already needs no delete. */
    private async removeRecord(stackId: string): Promise<void> {
        if (await this.deps.stackRepo.exists(stackId)) {
            await this.deps.stackRepo.delete(stackId);
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
            if (!(await this.deps.pathTaken(asideDir))) {
                // Nothing under the aside name: the original already is where it belongs (an earlier
                // rollback moved it back, or the rename never happened). Never touch what is there.
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
            await this.bringBack(entry, target, state);
        } catch (error: unknown) {
            this.deps.logger.error(`[MigrationService] Failed to restart the old stack: ${errorMessage(error)}`);
            state.oldStack = "restart-failed";
            state.restartError = errorMessage(error);
            return;
        }
        state.oldStack = (await this.waitUntilRunning(target, entry.runningBefore)) ? "restored-running" : "restart-unverified";
    }

    /**
     * When the new stack shared the old stack's compose project and its deploy
     * started, the keep-volumes down removed the old containers as well, so the
     * services are recreated from the restored original files. Otherwise the
     * original containers still exist and are only started, never recreated.
     */
    private bringBack(
        entry: Extract<MigrationLedgerEntry, {kind: "stopped_old_stack"}>,
        target: ComposeProjectTarget,
        state: RollbackState,
    ): Promise<void> {
        return entry.sharesProjectWithNewStack && state.deployStarted
            ? this.deps.oldStack.restoreServices(target, entry.runningBefore)
            : this.deps.oldStack.start(target, entry.runningBefore);
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
