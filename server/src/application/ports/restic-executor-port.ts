import type {
    BackupRepoConfig,
    RetentionPolicy,
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
 */
export interface ResticExecutorPort {
    run(
        args: string[],
        env: Record<string, string>,
        onLine?: (line: string) => void,
        cwd?: string,
    ): Promise<ResticRunResult>;

    buildBackupArgs(stackPath: string, stackId: string): string[];

    buildForgetArgs(stackId: string, policy: RetentionPolicy): string[];

    buildRestoreArgs(snapshotId: string, targetPath: string): string[];

    buildInitArgs(): string[];

    snapshots(env: Record<string, string>, tag: string): Promise<ResticSnapshot[]>;

    buildEnv(config: BackupRepoConfig): Record<string, string>;

    buildRepoUrl(config: BackupRepoConfig): string;

    checkVersion(): Promise<{available: boolean; version?: string}>;
}

export type {BackupRepoConfig, RetentionPolicy, ResticRunResult, ResticSnapshot};
