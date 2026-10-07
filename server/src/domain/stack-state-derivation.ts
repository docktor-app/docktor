import type {StackStatus} from "../generated/prisma/enums.js";

/**
 * Statuses owned by an in-flight Docktor operation (deploy, update, backup,
 * restore, migration). Observed-state derivation from container events must
 * never overwrite them, or it would race the operation that is about to
 * finish and set the real outcome itself (OBS-03).
 */
export const TRANSITIONAL_STATES: ReadonlySet<string> = new Set<string>([
    "DEPLOYING",
    "UPDATING",
    "BACKING_UP",
    "RESTORING",
    "MIGRATING",
]);

export function isTransitionalStatus(status: string): boolean {
    return TRANSITIONAL_STATES.has(status);
}

/**
 * Derives the aggregate stack status from the observed state of its
 * services. Shared by StatePoller and the post-deploy catch-up so both
 * always agree on what a set of containers means.
 */
export function deriveStackStatus(
    services: ReadonlyArray<{containerState?: string | null; healthStatus?: string | null}>,
): StackStatus {
    const states = services.map((s) => s.containerState ?? "");
    const healthStatuses = services.map((s) => s.healthStatus ?? null);

    // If ANY service is "restarting" or "dead" → ERROR
    if (states.some((s) => s === "restarting" || s === "dead")) {
        return "ERROR";
    }

    // If ALL services are "exited" → STOPPED
    if (states.length > 0 && states.every((s) => s === "exited")) {
        return "STOPPED";
    }

    // If ANY service is "unhealthy" → UNHEALTHY
    if (healthStatuses.some((h) => h === "unhealthy")) {
        return "UNHEALTHY";
    }

    // If ALL running services are "healthy" (and at least one has health check) → HEALTHY
    const hasHealthCheck = healthStatuses.some((h) => h !== null);
    if (hasHealthCheck && healthStatuses.every((h) => h === "healthy" || h === null)) {
        return "HEALTHY";
    }

    // Default for mixed states and when all are running
    return "RUNNING";
}
