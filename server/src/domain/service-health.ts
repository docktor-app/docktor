/**
 * Pure helpers for the per-service health history (#23, D-12). No I/O, no
 * Prisma — shared by the producers that detect a change and the code that
 * records it, so both agree on what counts as "the same health".
 */

/** Where a health value came from; the string form used in events and API payloads. */
export type HealthSourceName = "docker-healthcheck" | "http-probe";

/**
 * Collapses "no health value" spellings (undefined, null, empty string) to
 * null so a container without a healthcheck compares equal however the
 * caller happened to represent it.
 */
export function normalizeHealth(value: string | null | undefined): string | null {
    return value === undefined || value === "" ? null : value;
}

/** True when the normalized health value actually differs between two observations. */
export function isHealthTransition(
    prev: string | null | undefined,
    next: string | null | undefined,
): boolean {
    return normalizeHealth(prev) !== normalizeHealth(next);
}
