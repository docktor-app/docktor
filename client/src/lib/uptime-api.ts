import {apiFetch} from "./api";

export type IncidentCause = "UNHEALTHY" | "ERROR";

// Mirrors the 14-04 contract of GET /api/stacks/:id/uptime. Incidents are
// newest first; an open incident has endedAt and durationMs set to null.
export interface Incident {
    id: string;
    cause: IncidentCause;
    startedAt: string;
    endedAt: string | null;
    durationMs: number | null;
}

export interface StackUptime {
    stackId: string;
    windowDays: number;
    windowStart: string;
    // Start of the observed period: windowStart when history predates the
    // window, later for a young stack, null when the stack has no history.
    since: string | null;
    percent: number | null;
    upMs: number;
    downMs: number;
    incidents: Incident[];
}

export function getStackUptime(stackId: string): Promise<StackUptime> {
    return apiFetch<StackUptime>(`/api/stacks/${encodeURIComponent(stackId)}/uptime`);
}
