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
 */
import {execFile} from "node:child_process";
import type {Dirent} from "node:fs";
import {readdir} from "node:fs/promises";
import {promisify} from "node:util";
import type {DiskUsageScannerPort} from "../application/ports/disk-usage-scanner-port.js";

const execFileAsync = promisify(execFile);

/** Per-path ceiling: a multi-terabyte volume on a slow disk can take minutes. */
const DU_TIMEOUT_MS = 10 * 60_000;

/** Injectable shell-out seam, same shape as the socket inspector's runner. */
export type CommandRunner = (file: string, args: readonly string[]) => Promise<{stdout: string}>;

export interface DiskUsageFsOps {
    readdir(dir: string): Promise<Dirent[]>;
}

const defaultRunner: CommandRunner = (file, args) =>
    execFileAsync(file, [...args], {timeout: DU_TIMEOUT_MS});

const defaultFsOps: DiskUsageFsOps = {
    readdir: (dir) => readdir(dir, {withFileTypes: true}),
};

function isMissingDirectory(err: unknown): boolean {
    return typeof err === "object" && err !== null && "code" in err && err.code === "ENOENT";
}

export class DiskUsageScanner implements DiskUsageScannerPort {
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
        const {stdout} = await this.runner("du", ["-sk", "--", path]);
        const firstField = stdout.split("\t")[0]?.trim() ?? "";
        // Number("") is 0, so an empty field must be rejected explicitly.
        if (!/^\d+$/.test(firstField)) return null;
        const kibibytes = Number(firstField);
        return Number.isSafeInteger(kibibytes) ? kibibytes * 1024 : null;
    }
}

export const diskUsageScanner = new DiskUsageScanner();
