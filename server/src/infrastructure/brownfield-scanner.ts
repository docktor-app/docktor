import fg from "fast-glob";
import fs from "node:fs/promises";
import path from "node:path";

import type {SkippedDirectory, SkippedDirectoryReason} from "@docktor/shared";

import {ComposeAnalyzer, composeAnalyzer, type BindMountInfo} from "./compose-analyzer.js";
import type {BrownfieldScannerPort, DirectoryScanResult, ScannedStack} from "../application/ports/brownfield-scanner-port.js";

const NOT_FOUND_CODES = new Set(["ENOENT", "ENOTDIR"]);
const PERMISSION_DENIED_CODES = new Set(["EACCES", "EPERM"]);

/** Maps a filesystem error code to a skip reason, or undefined for an unexpected error. */
function skipReasonForCode(code: string | undefined): SkippedDirectoryReason | undefined {
    if (code === undefined) return undefined;
    if (NOT_FOUND_CODES.has(code)) return "not_found";
    if (PERMISSION_DENIED_CODES.has(code)) return "permission_denied";
    return undefined;
}

/** Host paths of the given bind mounts, de-duplicated in first-seen order. */
function distinctPaths(mounts: BindMountInfo[]): string[] {
    return Array.from(new Set(mounts.map((m) => m.path)));
}

export class BrownfieldScanner implements BrownfieldScannerPort {
    // WR-10: "compose.yml" (no docker- prefix) is a valid Compose file name
    // too — Docker Compose's own resolution order is compose.yaml ->
    // compose.yml -> docker-compose.yaml -> docker-compose.yml.
    private readonly COMPOSE_FILE_PATTERNS = [
        "**/docker-compose.yml",
        "**/docker-compose.yaml",
        "**/compose.yaml",
        "**/compose.yml",
    ];

    private readonly SYSTEM_DIR_EXCLUDES = [
        "**/proc/**",
        "**/sys/**",
        "**/dev/**",
        "**/node_modules/**",
        "**/.git/**",
        // #72/D-08, RESEARCH Pitfall 3: the opted-in migration backup at
        // <newStack>/pre-migration-backup/ holds a copy of the old compose
        // file, which the glob patterns above would otherwise offer as a new
        // importable stack (duplicate-slug adoption risk).
        "**/pre-migration-backup/**",
        // An in-place migration keeps the original as <id>-pre-migration[-N]
        // next to the stacks (see domain/migration-target.ts); it still holds
        // a compose file and must not be offered as a new stack either.
        "**/*-pre-migration/**",
        "**/*-pre-migration-[0-9]*/**",
    ];

    private readonly SYSTEM_DIRS = ["/proc", "/sys", "/dev"];

    constructor(private readonly analyzer: ComposeAnalyzer = composeAnalyzer) {}

    // Deliberately path.posix.normalize() here, not the host-OS-aware
    // path.normalize() used everywhere else in this class: SYSTEM_DIRS is a
    // fixed list of Linux-only special filesystem entries (/proc, /sys, /dev —
    // these are meaningless paths on Windows, where no user would ever type
    // them as a scan root), so the comparison must stay POSIX regardless of
    // which host OS actually runs this code. Using the host-native normalize()
    // made this check silently stop matching entirely on a win32 host
    // (path.normalize("/proc") -> "\\proc", which never equals the literal
    // "/proc"), letting a directory this scanner must never touch slip
    // straight through to fast-glob.
    private isSystemDirectory(dir: string): boolean {
        return this.SYSTEM_DIRS.includes(path.posix.normalize(dir));
    }

    private async findComposeFiles(dir: string): Promise<string[]> {
        // Check read permission before scanning
        await fs.access(dir, fs.constants.R_OK);

        const files = await fg(this.COMPOSE_FILE_PATTERNS, {
            cwd: dir,
            absolute: true,
            ignore: this.SYSTEM_DIR_EXCLUDES,
            onlyFiles: true,
            suppressErrors: true, // Don't throw on permission errors mid-scan
        });

        // G-05.1-4: fast-glob's `absolute: true` output is
        // unconditionally "unixified" (backslashes -> forward
        // slashes) on every platform by design — glob
        // patterns/results are POSIX-delimited by convention, not
        // configurable. Node's win32 path.dirname() does not
        // renormalize separator style; it only slices at the last
        // separator it finds, so it would otherwise pass that
        // forward-slash spelling straight through to `directory`
        // (and `path`, assigned verbatim below) even on a native
        // Windows host. Normalizing once here — before both fields
        // are derived, and before the Set-based dedup below — is
        // what keeps `path` and `directory` consistent with the
        // host OS from a single call site, and it also canonicalizes
        // the spelling so two overlapping scan roots that surface
        // different spellings of one file collapse to one stack.
        // Deliberately the host-OS-aware `node:path` here (not
        // path.posix) — see
        // server/test/unit/infrastructure/brownfield-scanner-windows-paths.test.ts,
        // which pins exactly this "returns native separators on a
        // native Windows host" contract by mocking node:path to its
        // win32 implementation.
        return files.map((f) => path.normalize(f));
    }

    async scan(directories: string[]): Promise<DirectoryScanResult> {
        const foundFiles: string[] = [];
        const skipped: SkippedDirectory[] = [];

        // Roots are processed in request order so `skipped` mirrors what the
        // user typed. Each skipped root carries the reason it produced nothing
        // (G-18-3-scan): a root the container cannot see is otherwise
        // indistinguishable from an empty one.
        for (const dir of directories) {
            if (this.isSystemDirectory(dir)) {
                console.warn(`[BrownfieldScanner] Skipping system directory: ${dir}`);
                skipped.push({directory: dir, reason: "system_directory"});
                continue;
            }

            try {
                foundFiles.push(...(await this.findComposeFiles(dir)));
            } catch (err: unknown) {
                // Safe: fs.access/fast-glob only ever throw NodeJS.ErrnoException
                // (a standard Error subtype with a `code` field) on this path.
                const code = err instanceof Error ? (err as NodeJS.ErrnoException).code : undefined;
                const reason = skipReasonForCode(code);
                if (reason === undefined) {
                    throw err; // Re-throw unexpected errors
                }
                skipped.push({directory: dir, reason});
                console.warn(`[BrownfieldScanner] Skipped directory: ${dir} (${code})`);
            }
        }

        // Deduplicate (same file might be found from overlapping directory scans)
        const uniqueFiles = Array.from(new Set(foundFiles));

        // Parse each compose file and assess compatibility
        const stacks: ScannedStack[] = [];
        for (const filePath of uniqueFiles) {
            try {
                const content = await fs.readFile(filePath, "utf-8");
                const analysis = this.analyzer.analyzeCompatibility(content);

                stacks.push({
                    path: filePath,
                    directory: path.dirname(filePath),
                    compatibility: analysis.compatibility,
                    serviceCount: analysis.serviceCount,
                    namedVolumes: analysis.namedVolumes,
                    absolutePaths: distinctPaths(analysis.bindMounts.filter((m) => m.type === "absolute")),
                    // Relative mounts are listed so the migration dialog can copy
                    // them into the new stack directory; without them the new
                    // stack starts with empty data (G-18-4, 18-REVIEW WR-01).
                    relativePaths: distinctPaths(analysis.bindMounts.filter((m) => m.type === "relative")),
                    inlineEnvVars: analysis.inlineEnvVars.length > 0,
                    unsupportedFeatures: analysis.unsupportedFeatures,
                });
            } catch (err: unknown) {
                // Skip files that can't be read or parsed
                const message = err instanceof Error ? err.message : String(err);
                console.warn(`[BrownfieldScanner] Could not analyze ${filePath}: ${message}`);
            }
        }

        return {stacks, skippedDirectories: skipped.length, skipped};
    }
}

export const brownfieldScanner = new BrownfieldScanner();
