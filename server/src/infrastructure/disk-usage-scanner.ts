/**
 * Disk usage adapter for #27 (D-13): lists the subdirectories of a stack's
 * `volumes/` folder and sizes a path with `du -sk`.
 *
 * `du` is run through `execFile` with an argv array, never a shell, and with
 * `--` before the path so a directory named like a flag is still a path.
 * Each path gets its own `du` call: du de-duplicates hard links across the
 * arguments of a single call, which would make the per-volume numbers
 * depend on which volumes were measured together.
 *
 * The directory names under `volumes/` are written by stack containers, so
 * they are untrusted. Only real directories are listed (a Dirent reports
 * `isDirectory() === false` for a symlink), so a link pointing into the host
 * mount is never followed.
 *
 * `du` failures (RESEARCH Pitfall 8): exit 1 with an unreadable entry still
 * prints a total, which is used. A missing binary (Windows dev host) or a
 * timeout without output yields null, so the caller keeps the previous value
 * instead of recording a wrong one.
 */
import {execFile} from "node:child_process";
import type {Dirent} from "node:fs";
import {lstat, readdir} from "node:fs/promises";
import {promisify} from "node:util";
import type {DiskUsageScannerPort} from "../application/ports/disk-usage-scanner-port.js";

const execFileAsync = promisify(execFile);

/** Per-path ceiling: a multi-terabyte volume on a slow disk can take minutes. */
const DU_TIMEOUT_MS = 10 * 60_000;

/** Injectable shell-out seam, same shape as the socket inspector's runner. */
export type CommandRunner = (file: string, args: readonly string[]) => Promise<{stdout: string}>;

export interface DiskUsageFsOps {
    readdir(dir: string): Promise<Dirent[]>;
    /** Must not follow symlinks. */
    lstat(path: string): Promise<{isDirectory(): boolean}>;
}

const defaultRunner: CommandRunner = (file, args) =>
    execFileAsync(file, [...args], {timeout: DU_TIMEOUT_MS});

const defaultFsOps: DiskUsageFsOps = {
    readdir: (dir) => readdir(dir, {withFileTypes: true}),
    lstat: (path) => lstat(path),
};

function isMissingDirectory(err: unknown): boolean {
    return typeof err === "object" && err !== null && "code" in err && err.code === "ENOENT";
}

/** execFile rejections carry the child's stdout; anything else has none. */
function stdoutOfFailure(err: unknown): string {
    if (typeof err !== "object" || err === null || !("stdout" in err)) return "";
    return typeof err.stdout === "string" ? err.stdout : "";
}

/** KiB total from `du -sk` output (first tab-separated field) as bytes, or null when unparseable. */
function parseDuBytes(stdout: string): number | null {
    const firstField = stdout.split("\t")[0]?.trim() ?? "";
    // Number("") is 0, so an empty field must be rejected explicitly.
    if (!/^\d+$/.test(firstField)) return null;
    const kibibytes = Number(firstField);
    return Number.isSafeInteger(kibibytes) ? kibibytes * 1024 : null;
}

export class DiskUsageScanner implements DiskUsageScannerPort {
    private warnedDuMissing = false;

    constructor(
        private readonly runner: CommandRunner = defaultRunner,
        private readonly fsOps: DiskUsageFsOps = defaultFsOps,
    ) {}

    async listVolumeDirectories(volumesDir: string): Promise<string[] | null> {
        let entries: Dirent[];
        try {
            entries = await this.fsOps.readdir(volumesDir);
        } catch (err) {
            if (isMissingDirectory(err)) return null;
            throw err;
        }
        return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    }

    async measureBytes(path: string): Promise<number | null> {
        try {
            const {stdout} = await this.runner("du", ["-sk", "--", path]);
            return parseDuBytes(stdout);
        } catch (err) {
            if (isMissingDirectory(err)) {
                this.warnDuMissingOnce();
                return null;
            }
            // Exit 1 with a printed total, or a killed run with none.
            return parseDuBytes(stdoutOfFailure(err));
        }
    }

    async isRealDirectory(path: string): Promise<boolean> {
        try {
            return (await this.fsOps.lstat(path)).isDirectory();
        } catch {
            return false;
        }
    }

    private warnDuMissingOnce(): void {
        if (this.warnedDuMissing) return;
        this.warnedDuMissing = true;
        console.warn("[DiskUsageScanner] du is not available; disk usage will not be measured");
    }
}

export const diskUsageScanner = new DiskUsageScanner();
