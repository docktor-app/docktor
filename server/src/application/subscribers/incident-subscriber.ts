import type {EventBusPort} from "../ports/event-bus-port.js";
import type {IncidentTracker} from "../incident-tracker.js";

export type IncidentTrackingPort = Pick<IncidentTracker, "observeStackStatus">;

/**
 * Feeds every stack status the domain events carry into the incident tracker
 * (#24, D-11). Both events are needed: StackService/BackupService emit
 * stack.status_changed, while the StatePoller and catch-up path (including
 * probe-driven changes) emit stack.container_state_changed with the stack's
 * resulting status. The tracker never rejects, so the handlers can return its
 * promise without a try/catch of their own.
 */
export function subscribeIncidentTracking(
    bus: Pick<EventBusPort, "subscribe">,
    tracker: IncidentTrackingPort,
): () => void {
    const unsubscribers = [
        bus.subscribe("stack.status_changed", (payload) => tracker.observeStackStatus(payload.stackId, payload.status)),
        bus.subscribe("stack.container_state_changed", (payload) =>
            tracker.observeStackStatus(payload.stackId, payload.stackStatus),
        ),
    ];

    return () => {
        for (const unsubscribe of unsubscribers) {
            unsubscribe();
        }
    };
}
