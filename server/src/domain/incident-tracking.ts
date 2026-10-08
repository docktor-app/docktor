// Incident rules (#24, D-11).
//
// One StackIncident row per UNHEALTHY/ERROR episode of a stack. An episode
// opens when the stack enters UNHEALTHY or ERROR, spans UNHEALTHY <-> ERROR
// flips (the opening status stays as the cause), and ends when the stack
// reaches RUNNING, HEALTHY or STOPPED. STOPPED ends an episode because an
// intentional stop is not downtime (D-09). Every other status is transitional
// and leaves the episode untouched.

export type IncidentCause = "UNHEALTHY" | "ERROR";

export type IncidentAction =
    | {readonly kind: "open"; readonly cause: IncidentCause}
    | {readonly kind: "close"}
    | {readonly kind: "none"};

const NONE: IncidentAction = {kind: "none"};
const CLOSE: IncidentAction = {kind: "close"};

export function decideIncidentAction(open: {readonly triggerType: string} | null, status: string): IncidentAction {
    if (status === "UNHEALTHY" || status === "ERROR") {
        return open === null ? {kind: "open", cause: status} : NONE;
    }
    if (status === "RUNNING" || status === "HEALTHY" || status === "STOPPED") {
        return open === null ? NONE : CLOSE;
    }
    return NONE;
}
