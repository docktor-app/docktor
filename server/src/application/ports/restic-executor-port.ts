import type {ResticRepositoryTarget} from "../../domain/restic-repository.js";
import type {
    BackupRepoConfig,
    RetentionPolicy,
    ResticRunOptions,
    ResticRunResult,
    ResticSnapshot,
} from "../../infrastructure/restic-executor.js";

/**
 * Port for the restic binary invocation dependency (D-07). Declared here
 * rather than consumers importing the concrete ResticExecutor class, so
 * application services stay unit-testable with a plain fake and the
 * dependency arrow keeps pointing inward (application depends on a port,
 * not on infrastructure/). The constructor is not part of the port — only
 * instance behaviour is.
 *
 * Callers hand over the resolved repository target; the executor alone turns it
 * into process env and, for SFTP, ssh arguments.
 */
export interface ResticExecutorPort {
    run(
        args: string[],
        repository: ResticRepositoryTarget,
        onLine?: (line: string) => void,
        cwd?: string,
        options?: ResticRunOptions,
    ): Promise<ResticRunResult>;

    buildBackupArgs(stackPath: string, stackId: string): string[];

    buildForgetArgs(stackId: string, policy: RetentionPolicy): string[];

    buildRestoreArgs(snapshotId: string, targetPath: string): string[];

    buildInitArgs(): string[];

    snapshots(repository: ResticRepositoryTarget, tag: string): Promise<ResticSnapshot[]>;

    checkVersion(): Promise<{available: boolean; version?: string}>;
}

export type {BackupRepoConfig, ResticRepositoryTarget, ResticRunOptions, RetentionPolicy, ResticRunResult, ResticSnapshot};
