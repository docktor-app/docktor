import type {EventBusPort} from "../ports/event-bus-port.js";
import type {ServiceHealthChangedEvent} from "../../domain/events.js";
import {ServiceHealthHistoryOutbox, type ServiceHealthHistoryRepo} from "./service-health-history-outbox.js";

export type {ServiceHealthHistoryRepo} from "./service-health-history-outbox.js";

/**
 * The single write path for ServiceHealthEvent (#23, D-12): appends one row
 * per service.health_changed event. The write goes through an outbox, so a
 * rejected write is logged with the stack/service it belongs to and retried
 * later, and a history failure can never reject into the bus, the poller or
 * the catch-up that produced the event. The disposer unsubscribes and stops
 * the outbox's retry timer.
 */
export function subscribeServiceHealthHistory(
    bus: Pick<EventBusPort, "subscribe">,
    repo: ServiceHealthHistoryRepo,
): () => void {
    const outbox = new ServiceHealthHistoryOutbox(repo);
    const unsubscribe = bus.subscribe("service.health_changed", (payload) => recordTransition(outbox, payload));
    return () => {
        unsubscribe();
        outbox.dispose();
    };
}

function recordTransition(outbox: ServiceHealthHistoryOutbox, payload: ServiceHealthChangedEvent): Promise<void> {
    return outbox.record({
        stackId: payload.stackId,
        serviceName: payload.serviceName,
        fromStatus: payload.fromStatus,
        toStatus: payload.toStatus,
        source: payload.source,
        message: payload.message,
    });
}
