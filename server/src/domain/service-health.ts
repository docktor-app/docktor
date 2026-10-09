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

/**
 * D-08. True only when a stored container id exists and differs from the
 * observed one. A missing stored id (rows just recreated by a deploy, or a
 * service never observed) says nothing about identity, so it never counts as
 * a replacement.
 */
export function isReplacedContainer(
    storedContainerId: string | null | undefined,
    observedContainerId: string,
): boolean {
    return storedContainerId !== null && storedContainerId !== undefined && storedContainerId !== observedContainerId;
}

/**
 * D-07/D-08. The health a Docker observer writes for a probe-owned service.
 * The probe owns the value (D-07), so it is kept as stored, except when the
 * observer sees a new or restarted container: that container has not been
 * probed yet, so it starts as `starting` when running and as no health
 * otherwise (D-08). The previous container's value is never carried over.
 */
export function probeOwnedHealth(
    storedHealth: string | null | undefined,
    observedState: string,
    replaced: boolean,
): string | null {
    if (!replaced) return normalizeHealth(storedHealth);
    return observedState === "running" ? "starting" : null;
}
