import {spawn} from "node:child_process";
import {mkdir, mkdtemp, readdir, rm, stat, writeFile} from "node:fs/promises";
import path from "node:path";

import type {ResticExecutorPort} from "../application/ports/restic-executor-port.js";
import type {ResticRepositoryTarget, SftpConnection} from "../domain/restic-repository.js";
import {AppError} from "../lib/errors.js";
import {getStacksDir} from "../lib/stacks-dir.js";

export interface ResticRunResult {
    exitCode: number;
    stderr: string;
}

/**
 * True when a restic error means "the repository has not been initialized yet".
 * Since restic 0.17 a missing repository exits with code 10 and says
 * "repository does not exist". The bare "unable to open config file" prefix is
 * deliberately NOT matched: restic uses it for every backend Stat failure, so for
 * S3 it would also swallow bad credentials, an unreachable endpoint or a missing
 * bucket and report them as an uninitialised repository.
 */
export function isRepositoryNotFoundError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    if ((err as {exitCode?: number}).exitCode === 10) return true;
    return err.message.includes("repository does not exist");
}

export interface ResticSnapshot {
    id: string;
    time: string;
    hostname: string;
    tags: string[] | null;
    paths: string[];
    short_id: string;
}

export interface ResticRunOptions {
    /** Stops restic (SIGTERM) and rejects when it has not finished in this many milliseconds. */
    readonly timeoutMs?: number;
}

/** Tag spawnRestic puts on every stderr line it forwards to `onLine`. */
const STDERR_LINE_PREFIX = "[stderr] ";

/** A key directory this old cannot belong to a live run, so it was orphaned by a hard kill. */
const ORPHANED_KEY_DIR_AGE_MS = 60 * 60 * 1000;

export interface BackupRepoConfig {
    repoType: "local" | "sftp" | "s3";
    repoPath?: string;
    sftpHost?: string;
    sftpUser?: string;
    sftpPort?: number;
    sftpKey?: string;
    s3Endpoint?: string;
    s3Bucket?: string;
    s3AccessKey?: string;
    s3SecretKey?: string;
    password: string; // already decrypted
}

export interface RetentionPolicy {
    keepDaily: number;
    keepWeekly: number;
    keepMonthly: number;
}

export interface ResticExecutorOptions {
    /** Restic binary; defaults to RESTIC_BINARY, then "restic". */
    readonly binary?: string;
    /** Directory for SSH state (known_hosts, per-run key directories); defaults to <stacksDir>/.docktor/ssh. */
    readonly sshDir?: string;
}

export class ResticExecutor implements ResticExecutorPort {
    private readonly binary: string;
    private readonly sshDir: string | undefined;

    constructor(options: ResticExecutorOptions = {}) {
        this.binary = options.binary ?? process.env.RESTIC_BINARY ?? "restic";
        this.sshDir = options.sshDir;
    }

    /**
     * Runs restic against the resolved repository target, streaming stdout lines
     * via the optional onLine callback.
     *
     * Credentials must NEVER appear on the CLI — they belong in the env object.
     * For SFTP targets the private key is written to a 0600 file that exists only
     * for the lifetime of this one restic process; it is never placed in env,
     * argv or logs (argv carries only the key file path).
     *
     * @param cwd - Optional working directory for the restic process. Use this to run
     *              restic from the stack directory so backups use relative paths.
     * @param options - Optional run options, e.g. a deadline for probes that must not hang.
     */
    async run(
        args: string[],
        repository: ResticRepositoryTarget,
        onLine?: (line: string) => void,
        cwd?: string,
        options: ResticRunOptions = {},
    ): Promise<ResticRunResult> {
        if (repository.kind === "sftp") {
            return this.runWithSftpIdentity(repository, args, onLine, cwd, options);
        }
        return this.spawnRestic(args, {...repository.env}, onLine, cwd, options.timeoutMs);
    }

    /**
     * Writes the decrypted key to a per-run 0600 file, points restic's ssh at it
     * and pins the server host key on first use (D-03, D-04). The key directory
     * is removed in `finally`, so success, a non-zero exit and a spawn error all
     * leave nothing behind. A hard kill (SIGKILL, OOM) skips `finally`, so each run
     * also sweeps key directories left behind by earlier ones. known_hosts is never
     * removed: the first connection's pin must survive runs and container recreation.
     */
    private async runWithSftpIdentity(
        repository: Extract<ResticRepositoryTarget, {kind: "sftp"}>,
        args: string[],
        onLine?: (line: string) => void,
        cwd?: string,
        options: ResticRunOptions = {},
    ): Promise<ResticRunResult> {
        const sshDir = this.sshDir ?? path.join(getStacksDir(), ".docktor", "ssh");
        // The path is embedded in a double-quoted token of sftp.command.
        if (sshDir.includes('"')) {
            throw new AppError("Restic SSH directory path contains a double quote and cannot be passed to ssh");
        }
        await mkdir(sshDir, {recursive: true, mode: 0o700});
        await this.sweepOrphanedKeyDirs(sshDir);
        const keyDir = await mkdtemp(path.join(sshDir, "key-"));
        try {
            const keyPath = path.join(keyDir, "id");
            await writeFile(keyPath, normalisePrivateKey(repository.sftp.privateKey), {mode: 0o600, flag: "wx"});
            const command = this.buildSftpCommand(repository.sftp, keyPath, path.join(sshDir, "known_hosts"));
            return await this.spawnRestic(
                ["-o", toCsvField(`sftp.command=${command}`), ...args],
                {...repository.env},
                onLine,
                cwd,
                options.timeoutMs,
            );
        } finally {
            await this.removeKeyDir(keyDir);
        }
    }

    /**
     * Cleanup must never mask the outcome of the run it follows: a failure here
     * (EBUSY on Windows, a permissions glitch) is logged and the sweep of the next
     * run retries it.
     */
    private async removeKeyDir(keyDir: string): Promise<void> {
        try {
            await rm(keyDir, {recursive: true, force: true});
        } catch (err) {
            console.error(`[ResticExecutor] failed to remove SFTP key directory ${keyDir}`, err);
        }
    }

    /** Removes `key-*` directories old enough that no live run can still own them. */
    private async sweepOrphanedKeyDirs(sshDir: string): Promise<void> {
        try {
            const cutoff = Date.now() - ORPHANED_KEY_DIR_AGE_MS;
            for (const entry of await readdir(sshDir, {withFileTypes: true})) {
                if (!entry.isDirectory() || !entry.name.startsWith("key-")) continue;
                const dir = path.join(sshDir, entry.name);
                if ((await stat(dir)).mtimeMs < cutoff) await this.removeKeyDir(dir);
            }
        } catch (err) {
            console.error("[ResticExecutor] failed to sweep orphaned SFTP key directories", err);
        }
    }

    /**
     * Builds the ssh command restic runs for the SFTP backend. Restic splits it on
     * whitespace and adds neither host nor user, so both are part of it. Path tokens
     * are wrapped whole in double quotes; host and user are pattern-validated in the
     * domain (no whitespace, quotes or leading dash).
     */
    private buildSftpCommand(sftp: SftpConnection, keyPath: string, knownHostsPath: string): string {
        return [
            "ssh",
            `-i "${keyPath}"`,
            "-o IdentitiesOnly=yes",
            "-o BatchMode=yes",
            "-o ConnectTimeout=15",
            "-o StrictHostKeyChecking=accept-new",
            `-o "UserKnownHostsFile=${knownHostsPath}"`,
            "-o ServerAliveInterval=60",
            "-o ServerAliveCountMax=240",
            ...(sftp.port === undefined ? [] : [`-p ${sftp.port}`]),
            `-l ${sftp.user}`,
            sftp.host,
            "-s sftp",
        ].join(" ");
    }

    /** Spawns the restic binary with the given args and env. */
    private spawnRestic(
        args: string[],
        env: Record<string, string>,
        onLine?: (line: string) => void,
        cwd?: string,
        timeoutMs?: number,
    ): Promise<ResticRunResult> {
        console.log(`[ResticExecutor] Running: ${this.binary}`, args, cwd ? `(cwd: ${cwd})` : '')
        return new Promise((resolve, reject) => {
            const child = spawn(this.binary, args, {
                env: {...process.env, ...env},
                stdio: ["ignore", "pipe", "pipe"],
                cwd: cwd ?? undefined,
                timeout: timeoutMs,
            });

            let stderrBuf = "";
            let lineBuf = "";
            let stderrLineBuf = "";

            child.stdout.on("data", (chunk: Buffer) => {
                const text = chunk.toString("utf8")
                console.log(`[ResticExecutor] stdout chunk (${text.length} bytes): ${text.substring(0, 100)}...`)
                lineBuf += text;
                const lines = lineBuf.split("\n");
                // Last element may be incomplete — keep it in the buffer
                lineBuf = lines.pop() ?? "";
                for (const line of lines) {
                    if (line.trim()) {
                        console.log(`[ResticExecutor] Emitting line: ${line.substring(0, 80)}`)
                        onLine?.(line);
                    }
                }
            });

            child.stderr.on("data", (chunk: Buffer) => {
                const text = chunk.toString("utf8");
                stderrBuf += text;  // Keep accumulating for error message

                // Also emit lines to onLine callback with [stderr] prefix
                stderrLineBuf += text;
                const lines = stderrLineBuf.split("\n");
                stderrLineBuf = lines.pop() ?? "";
                for (const line of lines) {
                    if (line.trim()) {
                        console.log(`[ResticExecutor] Emitting stderr: ${line.substring(0, 80)}`);
                        onLine?.(`${STDERR_LINE_PREFIX}${line}`);
                    }
                }
            });

            child.on("error", reject);

            child.on("close", (code, signal) => {
                console.log(`[ResticExecutor] Process exited with code ${code}`)
                // Flush any partial stdout line remaining in the buffer
                if (lineBuf.trim()) onLine?.(lineBuf.trim());
                // Flush any partial stderr line remaining in the buffer
                if (stderrLineBuf.trim()) onLine?.(`${STDERR_LINE_PREFIX}${stderrLineBuf.trim()}`);

                if (timeoutMs !== undefined && code === null && signal === "SIGTERM") {
                    reject(new Error(`restic did not finish within ${timeoutMs / 1000} seconds and was stopped`));
                    return;
                }

                const exitCode = code ?? 1;
                if (exitCode !== 0) {
                    const error = new Error(`restic exited with code ${exitCode}: ${stderrBuf}`);
                    (error as Error & {exitCode: number}).exitCode = exitCode;
                    (error as Error & {stderr: string}).stderr = stderrBuf;
                    reject(error);
                } else {
                    resolve({exitCode: 0, stderr: stderrBuf});
                }
            });
        });
    }

    /**
     * Returns the args array to pass to restic for a backup operation.
     * Format: [".", "--exclude", "./logs", "--exclude", "./backups", "--tag", stackId, "--json"]
     * The caller prepends "backup" as the subcommand when needed.
     *
     * IMPORTANT: Caller must set cwd to stackPath when calling run() so that "." resolves correctly.
     */
    buildBackupArgs(_stackPath: string, stackId: string): string[] {
        return [
            ".",
            "--exclude", "./logs",
            "--exclude", "./backups",
            "--tag", stackId,
            "--json"
        ];
    }

    /** Returns ["forget", "--tag", stackId, "--keep-daily", N, "--keep-weekly", N, "--keep-monthly", N, "--prune"] */
    buildForgetArgs(stackId: string, policy: RetentionPolicy): string[] {
        return [
            "forget",
            "--tag",
            stackId,
            "--keep-daily",
            String(policy.keepDaily),
            "--keep-weekly",
            String(policy.keepWeekly),
            "--keep-monthly",
            String(policy.keepMonthly),
            "--prune",
        ];
    }

    /**
     * Returns ["restore", snapshotId, "--target", "."]
     *
     * IMPORTANT: Caller must set cwd to stackPath when calling run() so that "." resolves correctly.
     */
    buildRestoreArgs(snapshotId: string, _targetPath: string): string[] {
        return ["restore", snapshotId, "--target", "."];
    }

    /** Returns ["init"] */
    buildInitArgs(): string[] {
        return ["init"];
    }

    /**
     * Lists snapshots for the given tag. Returns [] if the repository has not
     * been initialised yet (exit code 10). Throws on other non-zero exit codes.
     */
    async snapshots(repository: ResticRepositoryTarget, tag: string): Promise<ResticSnapshot[]> {
        const lines: string[] = [];
        try {
            await this.run(
                ["snapshots", "--tag", tag, "--json"],
                repository,
                (l) => {
                    // Only stdout carries the JSON; stderr lines (ssh's first-connection
                    // notice, restic warnings) arrive tagged and must not reach the parser.
                    if (!l.startsWith(STDERR_LINE_PREFIX)) lines.push(l);
                },
            );
        } catch (err) {
            if (isRepositoryNotFoundError(err)) return []; // Repository not initialized
            throw err;
        }

        const json = lines.join("");
        return JSON.parse(json) as ResticSnapshot[];
    }

    /**
     * Checks whether the restic binary is available and returns its version.
     */
    async checkVersion(): Promise<{available: boolean; version?: string}> {
        try {
            const lines: string[] = [];
            await this.spawnRestic(["version"], {}, (l) => lines.push(l));
            const versionLine = lines[0] ?? "";
            const match = versionLine.match(/restic\s+([\d.]+)/);
            return {available: true, version: match?.[1]};
        } catch {
            return {available: false};
        }
    }
}

/** OpenSSH rejects a key without a trailing newline; CRLF (pasted from Windows) is normalised to LF. */
function normalisePrivateKey(privateKey: string): string {
    const lf = privateKey.replace(/\r\n/g, "\n");
    return lf.endsWith("\n") ? lf : `${lf}\n`;
}

/** Restic parses each `-o` value as a CSV record, so a value containing double quotes must be quoted as a CSV field. */
function toCsvField(value: string): string {
    return `"${value.replaceAll('"', '""')}"`;
}

export const resticExecutor = new ResticExecutor();
