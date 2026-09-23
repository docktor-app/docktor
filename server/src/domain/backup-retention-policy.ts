// Imported from the port's re-export (not infrastructure/restic-executor.js
// directly) so this stays a domain -> application/ports/ type-only edge
// rather than a domain -> infrastructure/ edge the layering fitness rule
// (test/unit/architecture/layering.test.ts) forbids. RetentionPolicy's one
// declaration site is still infrastructure/restic-executor.ts; the port
// file re-exports it (10-02), this module imports that re-export.
import type {RetentionPolicy} from "../application/ports/restic-executor-port.js";

/**
 * Pure retention-policy parsing rule behind BackupService.runBackup's
 * scheduled forget/prune step (D-08). No repository, no database client, no
 * filesystem, no Fastify — takes the nullable JSON column value in and
 * returns a RetentionPolicy, or the defaults when the input can't produce
 * one.
 */

// The same three defaults previously declared inline in backup-service.ts's
// private parseRetentionPolicy — relocated verbatim, not redesigned.
// Frozen so a caller mutating the returned value (or, if ever imported
// directly, this export itself) cannot corrupt this module's own state —
// parseRetentionPolicy always hands back a fresh copy, never this object.
export const DEFAULT_RETENTION_POLICY: RetentionPolicy = Object.freeze({
    keepDaily: 7,
    keepWeekly: 4,
    keepMonthly: 12,
});

/**
 * Parses the nullable JSON-encoded retention policy stored on a Stack row.
 * A parse failure — null/empty input, invalid JSON, or JSON that doesn't
 * parse to an object — falls through to the defaults silently rather than
 * throwing, because a malformed stored policy must not be able to fail a
 * backup run (load-bearing behaviour, preserved exactly). A parsed object
 * missing one of the three keys is returned as-is (not backfilled key by
 * key) — that is the same outcome the pre-extraction implementation
 * produced for that input, pinned rather than redesigned.
 */
export function parseRetentionPolicy(retentionJson: string | null): RetentionPolicy {
    if (retentionJson) {
        try {
            const parsed: unknown = JSON.parse(retentionJson);
            if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
                return parsed as RetentionPolicy;
            }
            // A parsed value that is not an object (a number, a string, an
            // array) falls through to the defaults rather than being
            // returned as a policy — this is the one hardening this
            // extraction adds: provably unreachable today (no caller has
            // ever stored a non-object policy), but latent.
        } catch {
            // Fall through to defaults.
        }
    }
    return {...DEFAULT_RETENTION_POLICY};
}
