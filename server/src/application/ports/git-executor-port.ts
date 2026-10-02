/**
 * Port for the git shell-out dependency that syncs a template repository
 * (#19) into a local checkout directory. The adapter (`GitExecutor`) owns
 * the full safety contract so every caller gets it for free:
 *   - the remote URL is re-validated against an allowlist of git transports
 *     immediately before any process is spawned (T-12-13), even though
 *     callers are expected to have already validated it at the API boundary
 *     via `@docktor/shared`'s `templateRepoUrlSchema`
 *   - `git` is invoked via `execFile` with an argv array only, never a shell
 *   - every checkout mutation is serialized per directory and atomic (probe
 *     #19 idempotency/concurrency) — a concurrent or repeated sync for the
 *     same directory never clones into a non-empty directory, never leaves
 *     a second copy of the cache, and never leaves a reader observing a
 *     partially-written checkout
 */
export interface GitCheckoutResult {
    /** The checked-out HEAD commit SHA, or null for an empty remote (no commits yet). */
    headCommitSha: string | null;
    /** Whether this call cloned fresh, fast-forward pulled, or had to discard and re-clone. */
    mode: "cloned" | "pulled" | "recloned";
}

export interface GitExecutorPort {
    /**
     * Ensures `checkoutDir` holds an up-to-date checkout of `remoteUrl`.
     * Safe to call repeatedly and concurrently for the same directory.
     */
    syncCheckout(remoteUrl: string, checkoutDir: string): Promise<GitCheckoutResult>;
}
