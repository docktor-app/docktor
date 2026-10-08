import type {EventBusPort} from "../ports/event-bus-port.js";
import type {ServiceHealthService} from "../service-health-service.js";

export type ProbeResultHandler = Pick<ServiceHealthService, "handleProbeCompleted">;

/**
 * Feeds finished HTTP probes into the service that turns them into health
 * (#23, D-03). The handler never rejects, so the subscriber can return its
 * promise without a try/catch of its own.
 */
export function subscribeProbeResults(
    bus: Pick<EventBusPort, "subscribe">,
    handler: ProbeResultHandler,
): () => void {
    return bus.subscribe("service.probe_completed", (payload) => handler.handleProbeCompleted(payload));
}
