import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {randomUUID} from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {ALLOWED_TEMPLATE_REPO_PROTOCOLS, isAllowedGitRemoteUrl} from "@docktor/shared";
import {AppError, BadRequestError} from "../lib/errors.js";
import {withKeyedLock} from "../lib/keyed-mutex.js";
import type {GitCheckoutResult, GitExecutorPort} from "../application/ports/git-executor-port.js";

const execFileAsync = promisify(execFile);

// Applied to every git invocation (T-12-13/T-12-14): `protocol.ext.allow=never`
// blocks the `ext::` transport-helper syntax (arbitrary command execution via
// a crafted URL) even if it somehow slipped past isAllowedGitRemoteUrl, and
// `core.symlinks=false` makes git check out symlinks as plain text files
// instead of materializing them — defense in depth alongside
// TemplateSourceReader's own lstat-based rejection of any symlink it finds.
const COMMON_CONFIG = ["-c", "protocol.ext.allow=never", "-c", "core.symlinks=false"];

export class GitCommandError extends AppError {
    constructor(subcommand: string, stderrFirstLine: string, cause?: unknown) {
        super(`git ${subcommand} failed: ${stderrFirstLine}`);
        if (cause !== undefined) {
            this.cause = cause;
        }
    }
}

/**
 * Shells out to the system `git` binary (execFile, argv only, never a shell)
 * to sync a template repository into a local checkout directory.
 *
 * Idempotency + atomicity contract (probe #19): every fresh clone is written
 * to a temp sibling directory (`<checkoutDir>.tmp-<uuid>`) and atomically
 * renamed into place, so a reader of `checkoutDir` never observes a
 * partially-written checkout. Calling `syncCheckout` twice in a row for the
 * same directory never clones twice: once `<dir>/.git` exists, it
 * fast-forward pulls instead, falling back to a fresh re-clone only if the
 * pull itself fails (e.g. the remote history was rewritten, or the
 * directory isn't actually a git checkout). Every call is also serialized
 * per resolved directory path via `withKeyedLock`, so two overlapping calls
 * for the same directory can never interleave their clone/pull/rename steps.
 */
export class GitExecutor implements GitExecutorPort {
    private readonly allowedProtocols: readonly string[];
    private readonly timeoutMs: number;

    constructor(options: {allowedProtocols?: readonly string[]; timeoutMs?: number} = {}) {
        this.allowedProtocols = options.allowedProtocols ?? ALLOWED_TEMPLATE_REPO_PROTOCOLS;
        this.timeoutMs = options.timeoutMs ?? 60_000;
    }

    async syncCheckout(remoteUrl: string, checkoutDir: string): Promise<GitCheckoutResult> {
        // Re-validated here even though callers are expected to have already
        // validated at the API boundary (templateRepoUrlSchema) — this is the
        // last line of defense before a process is ever spawned (T-12-13).
        if (!isAllowedGitRemoteUrl(remoteUrl, this.allowedProtocols)) {
            throw new BadRequestError(
                "Use an https://, git:// or ssh:// repository URL without embedded credentials",
            );
        }

        return withKeyedLock(`git-checkout:${path.resolve(checkoutDir)}`, async () => {
            if (await this.isGitCheckout(checkoutDir)) {
                try {
                    await this.runGit(["-C", checkoutDir, "pull", "--ff-only"]);
                    return {headCommitSha: await this.revParseHead(checkoutDir), mode: "pulled" as const};
                } catch {
                    return this.cloneInto(remoteUrl, checkoutDir, "recloned");
                }
            }
            return this.cloneInto(remoteUrl, checkoutDir, "cloned");
        });
    }

    private async isGitCheckout(dir: string): Promise<boolean> {
        try {
            await fs.lstat(path.join(dir, ".git"));
            return true;
        } catch {
            return false;
        }
    }

    private async cloneInto(
        remoteUrl: string,
        checkoutDir: string,
        mode: "cloned" | "recloned",
    ): Promise<GitCheckoutResult> {
        await fs.mkdir(path.dirname(checkoutDir), {recursive: true});
        const tmpDir = `${checkoutDir}.tmp-${randomUUID()}`;
        try {
            // "--" marks the end of options so a hostile-but-allowlisted URL
            // can never be misread as a flag by git clone itself.
            await this.runGit(["clone", "--depth", "1", "--single-branch", "--no-tags", "--", remoteUrl, tmpDir]);
            // Whatever was at checkoutDir before (a stale checkout that
            // failed to pull, or a non-git directory) is discarded only
            // after the new clone has succeeded — a failed clone leaves the
            // previous checkout untouched.
            await fs.rm(checkoutDir, {recursive: true, force: true});
            await fs.rename(tmpDir, checkoutDir);
        } catch (err) {
            await fs.rm(tmpDir, {recursive: true, force: true});
            if (err instanceof GitCommandError) throw err;
            throw err;
        }
        return {headCommitSha: await this.revParseHead(checkoutDir), mode};
    }

    /** Runs `git`, raising a GitCommandError (first stderr line, original error in `cause`) on failure. */
    private async runGit(args: string[]): Promise<{stdout: string; stderr: string}> {
        try {
            return await execFileAsync("git", [...COMMON_CONFIG, ...args], {
                timeout: this.timeoutMs,
                env: {
                    ...process.env,
                    GIT_TERMINAL_PROMPT: "0",
                    GIT_ALLOW_PROTOCOL: this.allowedProtocols.join(":"),
                },
            });
        } catch (err: unknown) {
            const raw = (err as {stderr?: string; message?: string}).stderr
                ?? (err as {message?: string}).message
                ?? "";
            const stderrFirstLine = raw.trim().split("\n")[0] ?? "";
            throw new GitCommandError(args[0] ?? "(unknown)", stderrFirstLine, err);
        }
    }

    /** Never throws: an empty remote (no commits yet) resolves to null, not an error. */
    private async revParseHead(dir: string): Promise<string | null> {
        try {
            const {stdout} = await execFileAsync(
                "git",
                [...COMMON_CONFIG, "-C", dir, "rev-parse", "--verify", "--quiet", "HEAD"],
                {timeout: this.timeoutMs},
            );
            const sha = stdout.trim();
            return sha.length > 0 ? sha : null;
        } catch {
            return null;
        }
    }
}

export const gitExecutor = new GitExecutor();
