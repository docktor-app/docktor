import type {EventBusPort} from "../ports/event-bus-port.js";
import type {ServiceHealthChangedEvent} from "../../domain/events.js";

/**
 * Narrow write-only shape of ServiceHealthEventRepository — this subscriber
 * never reads the history, so it depends on the one method it calls.
 */
export interface ServiceHealthHistoryRepo {
    record(input: {
        stackId: string;
        serviceName: string;
        fromStatus: string | null;
        toStatus: string | null;
        source: ServiceHealthChangedEvent["source"];
        message?: string;
    }): Promise<unknown>;
}

/**
 * The single write path for ServiceHealthEvent (#23, D-12): appends one row
 * per service.health_changed event. A rejected write is caught and logged
 * with the stack/service it belongs to, so a history failure can never reject
 * into the bus, the poller or the catch-up that produced the event.
 */
export function subscribeServiceHealthHistory(
    bus: Pick<EventBusPort, "subscribe">,
    repo: ServiceHealthHistoryRepo,
): () => void {
    return bus.subscribe("service.health_changed", (payload) => recordTransition(repo, payload));
}

async function recordTransition(repo: ServiceHealthHistoryRepo, payload: ServiceHealthChangedEvent): Promise<void> {
    try {
        await repo.record({
            stackId: payload.stackId,
            serviceName: payload.serviceName,
            fromStatus: payload.fromStatus,
            toStatus: payload.toStatus,
            source: payload.source,
            message: payload.message,
        });
    } catch (err) {
        console.error(
            `[service-health-history-subscriber] failed to record health transition for "${payload.stackId}/${payload.serviceName}":`,
            err,
        );
    }
}
