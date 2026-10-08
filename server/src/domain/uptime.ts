import type {StackStatus} from "../generated/prisma/enums.js";

// Uptime rules (#24, D-09).
//
// A stack's uptime percentage is up / (up + down) over StatusLog intervals
// inside the retention window. up = RUNNING or HEALTHY, down = UNHEALTHY or
// ERROR; every other status (STOPPED, DRAFT and the transitional ones) is
// neutral and excluded from both sides. The percentage is null when the
// window holds no up or down time.
//
// Uptime comes from StatusLog intervals and never from incident durations:
// an incident can span neutral time (e.g. a DEPLOYING stretch mid-outage).
// Time while Docktor itself was down carries the last status forward, so the
// figure is "as observed by Docktor".

const UP_STATUSES: ReadonlySet<StackStatus> = new Set<StackStatus>(["RUNNING", "HEALTHY"]);
const DOWN_STATUSES: ReadonlySet<StackStatus> = new Set<StackStatus>(["UNHEALTHY", "ERROR"]);

const DAY_MS = 86_400_000;

export type StatusClass = "up" | "down" | "neutral";

export interface StatusTransition {
    readonly toStatus: string;
    readonly at: Date;
}

export interface UptimeResult {
    readonly percent: number | null;
    readonly upMs: number;
    readonly downMs: number;
    /** Start of the observed span: the first transition clamped to the window start; null without transitions. */
    readonly observedFrom: Date | null;
}

export function classifyStatus(status: string): StatusClass {
    if ((UP_STATUSES as ReadonlySet<string>).has(status)) {
        return "up";
    }
    if ((DOWN_STATUSES as ReadonlySet<string>).has(status)) {
        return "down";
    }
    return "neutral";
}

export function windowStartFor(now: Date, days: number): Date {
    return new Date(now.getTime() - days * DAY_MS);
}

/**
 * `transitions` is ascending by `at`. The first entry may lie before
 * `windowStart` (the status in force when the window opened); each interval
 * runs to the next transition or `now`, clamped to [windowStart, now].
 */
export function computeUptime(
    transitions: readonly StatusTransition[],
    windowStart: Date,
    now: Date,
): UptimeResult {
    const first = transitions[0];
    if (first === undefined) {
        return {percent: null, upMs: 0, downMs: 0, observedFrom: null};
    }

    let upMs = 0;
    let downMs = 0;
    transitions.forEach((transition, index) => {
        const from = Math.max(transition.at.getTime(), windowStart.getTime());
        const next = transitions[index + 1];
        const to = Math.min(next?.at.getTime() ?? now.getTime(), now.getTime());
        if (to <= from) {
            return;
        }
        const statusClass = classifyStatus(transition.toStatus);
        if (statusClass === "up") {
            upMs += to - from;
        } else if (statusClass === "down") {
            downMs += to - from;
        }
    });

    const observed = upMs + downMs;
    return {
        percent: observed === 0 ? null : (upMs / observed) * 100,
        upMs,
        downMs,
        observedFrom: new Date(Math.max(first.at.getTime(), windowStart.getTime())),
    };
}
