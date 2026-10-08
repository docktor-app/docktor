import {describe, expect, it} from "vitest";
import {
    PROBE_FAILURE_THRESHOLD,
    PROBE_INTERVAL_MS,
    PROBE_STARTUP_GRACE_MS,
    describeProbeTransition,
    evaluateProbe,
    formatProbeFailure,
    isProbeSuccess,
    probeStaggerOffsetMs,
    seedProbeState,
    type ProbeOutcome,
    type ProbeState,
} from "../../../src/domain/health-probe.js";

const OK: ProbeOutcome = {ok: true, status: 200};
const FAIL_503: ProbeOutcome = {ok: false, reason: {kind: "http-status", status: 503}};
const STARTED = 1_000_000;

function evaluate(prev: ProbeState, outcome: ProbeOutcome, sinceStartMs: number): ProbeState {
    return evaluateProbe(prev, outcome, {startedAtMs: STARTED, nowMs: STARTED + sinceStartMs});
}

describe("probe constants (D-06, D-08)", () => {
    it("fixes the interval, threshold and grace the decisions lock", () => {
        expect(PROBE_INTERVAL_MS).toBe(30_000);
        expect(PROBE_FAILURE_THRESHOLD).toBe(3);
        expect(PROBE_STARTUP_GRACE_MS).toBe(60_000);
    });
});

describe("isProbeSuccess (D-02)", () => {
    it.each([
        [199, false],
        [200, true],
        [302, true],
        [399, true],
        [400, false],
        [503, false],
    ])("status %i -> %s", (status, expected) => {
        expect(isProbeSuccess(status)).toBe(expected);
    });
});

describe("evaluateProbe (D-08)", () => {
    it.each<ProbeState>([
        {consecutiveFailures: 0, health: "starting"},
        {consecutiveFailures: 2, health: "healthy"},
        {consecutiveFailures: 5, health: "unhealthy"},
    ])("a success from %o is healthy with no failures", (prev) => {
        expect(evaluate(prev, {ok: true, status: 204}, 5_000)).toEqual({consecutiveFailures: 0, health: "healthy"});
    });

    it("ignores a failure inside the startup grace while still starting", () => {
        expect(evaluate({consecutiveFailures: 0, health: "starting"}, FAIL_503, 30_000)).toEqual({
            consecutiveFailures: 0,
            health: "starting",
        });
    });

    it("counts failures after the grace and turns unhealthy at the threshold", () => {
        let state: ProbeState = {consecutiveFailures: 0, health: "starting"};
        const seen: ProbeState[] = [];
        for (const sinceStart of [61_000, 91_000, 121_000]) {
            state = evaluate(state, FAIL_503, sinceStart);
            seen.push(state);
        }
        expect(seen).toEqual([
            {consecutiveFailures: 1, health: "starting"},
            {consecutiveFailures: 2, health: "starting"},
            {consecutiveFailures: 3, health: "unhealthy"},
        ]);
    });

    it("counts a failure right after a success even inside the grace window", () => {
        expect(evaluate({consecutiveFailures: 0, health: "healthy"}, FAIL_503, 10_000)).toEqual({
            consecutiveFailures: 1,
            health: "healthy",
        });
    });

    it("keeps counting while already unhealthy", () => {
        expect(evaluate({consecutiveFailures: 3, health: "unhealthy"}, FAIL_503, 500_000)).toEqual({
            consecutiveFailures: 4,
            health: "unhealthy",
        });
    });

    it("applies no grace when the start time is unknown (0)", () => {
        const next = evaluateProbe({consecutiveFailures: 0, health: "starting"}, FAIL_503, {startedAtMs: 0, nowMs: 100_000_000});
        expect(next).toEqual({consecutiveFailures: 1, health: "starting"});
    });
});

describe("seedProbeState", () => {
    it.each([
        ["unhealthy", {consecutiveFailures: 3, health: "unhealthy"}],
        ["healthy", {consecutiveFailures: 0, health: "healthy"}],
        [null, {consecutiveFailures: 0, health: "starting"}],
        ["starting", {consecutiveFailures: 0, health: "starting"}],
        ["other", {consecutiveFailures: 0, health: "starting"}],
    ])("stored %s", (stored, expected) => {
        expect(seedProbeState(stored)).toEqual(expected);
    });
});

describe("probeStaggerOffsetMs (D-06)", () => {
    it("is deterministic and inside the interval", () => {
        const first = probeStaggerOffsetMs("app/web");
        expect(probeStaggerOffsetMs("app/web")).toBe(first);
        expect(Number.isInteger(first)).toBe(true);
        expect(first).toBeGreaterThanOrEqual(0);
        expect(first).toBeLessThan(PROBE_INTERVAL_MS);
    });

    it("spreads different services over the interval", () => {
        const offsets = new Set(["a/web", "a/db", "b/web", "b/db", "c/api", "c/worker"].map(probeStaggerOffsetMs));
        expect(offsets.size).toBeGreaterThan(1);
    });
});

describe("formatProbeFailure", () => {
    it.each([
        [{kind: "http-status", status: 503} as const, "Responded with HTTP 503"],
        [{kind: "timeout", seconds: 5} as const, "No response within 5s"],
        [{kind: "refused"} as const, "Connection refused"],
        [{kind: "network-unreachable"} as const, "Docktor couldn't reach the container's network"],
        [{kind: "no-address"} as const, "The container has no reachable network address"],
        [{kind: "invalid-config", message: "X"} as const, "X"],
    ])("%o", (reason, expected) => {
        expect(formatProbeFailure(reason)).toBe(expected);
    });
});

describe("describeProbeTransition", () => {
    it("names the threshold when a failure turns the service unhealthy", () => {
        expect(describeProbeTransition("unhealthy", FAIL_503)).toBe("Responded with HTTP 503 after 3 failed checks");
    });

    it("reports the status of the success that made it healthy", () => {
        expect(describeProbeTransition("healthy", OK)).toBe("Responded with HTTP 200");
    });

    it("has no message for starting", () => {
        expect(describeProbeTransition("starting", FAIL_503)).toBeNull();
        expect(describeProbeTransition("starting", OK)).toBeNull();
    });
});
