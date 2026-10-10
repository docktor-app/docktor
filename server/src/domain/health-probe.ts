/**
 * Pure rules for the HTTP health probe (#23). No I/O and no imports, so the
 * job that performs the request, the transport that classifies failures and
 * the application service that persists the result all agree on one rule set.
 *
 *   D-02  a response status of 200-399 is a success; everything else, including
 *         no response at all, is a failed probe (fail-closed)
 *   D-06  every probed service is checked every 30 seconds
 *   D-08  three consecutive failures turn a service unhealthy; failures during
 *         the 60-second startup grace do not count, and one success makes it
 *         healthy
 *
 * Fail-closed bounds (D-02, D-06, D-08): a Docker call on the probe path that
 * takes longer than PROBE_DOCKER_CALL_TIMEOUT_MS counts as a failed probe, and
 * a whole probe that takes longer than its timeout plus
 * PROBE_DEADLINE_MARGIN_MS does too, so a stalled daemon never stops probing.
 */

export const PROBE_INTERVAL_MS = 30_000;
/** Longest a single Docker Engine call (inspect, connect, disconnect) may take on the probe path. */
export const PROBE_DOCKER_CALL_TIMEOUT_MS = 10_000;
/**
 * Allowance on top of a probe's own timeout for the bounded Docker steps around
 * its request (target inspect, Docktor's own inspect, waiting for an in-flight
 * detach, connect and disconnect: five at most), so the overall per-probe bound
 * never pre-empts a probe the transport itself would still finish.
 */
export const PROBE_DEADLINE_MARGIN_MS = 5 * PROBE_DOCKER_CALL_TIMEOUT_MS;
export const PROBE_FAILURE_THRESHOLD = 3;
export const PROBE_STARTUP_GRACE_MS = 60_000;

export type ProbeHealth = "healthy" | "unhealthy" | "starting";

/** Why a probe failed; formatProbeFailure renders the user-facing text. */
export type ProbeFailureReason =
    | {kind: "http-status"; status: number}
    | {kind: "timeout"; seconds: number}
    | {kind: "refused"}
    | {kind: "network-unreachable"}
    | {kind: "no-address"}
    | {kind: "invalid-config"; message: string};

export type ProbeOutcome =
    | {ok: true; status: number}
    | {ok: false; reason: ProbeFailureReason};

export interface ProbeState {
    readonly consecutiveFailures: number;
    readonly health: ProbeHealth;
}

export interface ProbeContext {
    /** Epoch milliseconds the container started at; 0 means unknown (no grace). */
    readonly startedAtMs: number;
    readonly nowMs: number;
}

/** D-02: any 2xx or 3xx status counts as a success. */
export function isProbeSuccess(status: number): boolean {
    return status >= 200 && status <= 399;
}

/**
 * D-08. A success always yields healthy. A failure while the service is still
 * `starting` and the container is younger than the grace period is ignored;
 * the grace ends at the first success, as Docker's start_period does. Any
 * other failure counts, and the threshold turns the service unhealthy.
 */
export function evaluateProbe(prev: ProbeState, outcome: ProbeOutcome, ctx: ProbeContext): ProbeState {
    if (outcome.ok) {
        return {consecutiveFailures: 0, health: "healthy"};
    }
    const inGrace = prev.health === "starting" && ctx.nowMs - ctx.startedAtMs < PROBE_STARTUP_GRACE_MS;
    if (inGrace) {
        return {consecutiveFailures: 0, health: "starting"};
    }
    const consecutiveFailures = prev.consecutiveFailures + 1;
    return {
        consecutiveFailures,
        health: consecutiveFailures >= PROBE_FAILURE_THRESHOLD ? "unhealthy" : prev.health,
    };
}

/**
 * The state to continue from the first time a service is observed after a
 * Docktor restart. An unhealthy service starts at the threshold, so a restart
 * never resets it and never flaps the stack.
 */
export function seedProbeState(stored: string | null): ProbeState {
    if (stored === "unhealthy") {
        return {consecutiveFailures: PROBE_FAILURE_THRESHOLD, health: "unhealthy"};
    }
    if (stored === "healthy") {
        return {consecutiveFailures: 0, health: "healthy"};
    }
    return {consecutiveFailures: 0, health: "starting"};
}

/** Deterministic offset in [0, PROBE_INTERVAL_MS) that spreads services across the interval (D-06). */
export function probeStaggerOffsetMs(key: string): number {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = (Math.imul(hash, 31) + key.charCodeAt(i)) >>> 0;
    }
    return hash % PROBE_INTERVAL_MS;
}

/** The reason text stored in the health history and shown in the UI. */
export function formatProbeFailure(reason: ProbeFailureReason): string {
    switch (reason.kind) {
        case "http-status":
            return `Responded with HTTP ${reason.status}`;
        case "timeout":
            return `No response within ${reason.seconds}s`;
        case "refused":
            return "Connection refused";
        case "network-unreachable":
            return "Docktor couldn't reach the container's network";
        case "no-address":
            return "The container has no reachable network address";
        case "invalid-config":
            return reason.message;
    }
}

/**
 * The history message for a probe-driven health change, or null when the
 * change carries no message (`starting`). Reaching `unhealthy` names the
 * threshold so the entry explains why one failure was not enough.
 */
export function describeProbeTransition(next: ProbeHealth, outcome: ProbeOutcome): string | null {
    if (next === "healthy" && outcome.ok) {
        return `Responded with HTTP ${outcome.status}`;
    }
    if (next === "unhealthy" && !outcome.ok) {
        return `${formatProbeFailure(outcome.reason)} after ${PROBE_FAILURE_THRESHOLD} failed checks`;
    }
    return null;
}
