import type {EventBusPort} from "../ports/event-bus-port.js";
import type {StateBroadcaster} from "../../lib/state-broadcaster.js";
import {subscribeStackEvents, type StackEventSubscriberRepo} from "./stack-event-subscriber.js";
import {subscribeNotifications, type NotificationSubscriberNotificationService} from "./notification-subscriber.js";
import {subscribeStateBroadcast} from "./state-broadcast-subscriber.js";
import {subscribeServiceHealthHistory, type ServiceHealthHistoryRepo} from "./service-health-history-subscriber.js";
import {subscribeIncidentTracking, type IncidentTrackingPort} from "./incident-subscriber.js";
import {subscribeProbeResults, type ProbeResultHandler} from "./probe-result-subscriber.js";

export interface RegisterDomainSubscribersDeps {
    stackEventRepo: StackEventSubscriberRepo;
    notificationService: NotificationSubscriberNotificationService;
    broadcaster: Pick<StateBroadcaster, "publish">;
    serviceHealthEventRepo: ServiceHealthHistoryRepo;
    incidentTracker: IncidentTrackingPort;
    probeResultHandler: ProbeResultHandler;
}

/**
 * The single place this phase's subscription order is decided (D-15). Not a
 * barrel — application/index.ts calls this one function instead of
 * subscribing each of the categories inline, so the order below is a
 * deliberate, documented decision rather than an accident of import order.
 *
 * Order, and why it is fixed:
 *   1. Audit trail (stack-event-subscriber, plan 10-13) — PD-11: `emit`
 *      never awaits a handler (D-16), so the earliest an audit write can be
 *      issued relative to the other two subscribers is the best ordering
 *      the bus contract allows. The live-state frame that triggers a
 *      connected client's refetch of the stack's event list (subscriber 3
 *      below) must not be published ahead of this write being issued.
 *   2. Notifications (plan 10-12) — no ordering dependency on the other two;
 *      placed second only because it has no reason to be first or last.
 *   3. Live-state bridge (plan 10-11) — subscribes to the same
 *      stack.config_changed event the audit subscriber does; must be
 *      registered after it per the ordering guarantee above.
 *   4. Service health history (#23, D-12) — no ordering dependency: it is the
 *      only consumer of service.health_changed.
 *   5. Incident tracking (#24, D-11) — no ordering dependency: it is
 *      state-based and idempotent like NotificationWatcher, so it does not
 *      matter which subscriber sees a status first.
 *   6. Probe results (#23, D-03) — no ordering dependency: it is the only
 *      consumer of service.probe_completed. It produces
 *      service.health_changed and stack.container_state_changed, which the
 *      subscribers above handle whenever they run. Registered last.
 */
export function registerDomainSubscribers(
    bus: Pick<EventBusPort, "subscribe">,
    deps: RegisterDomainSubscribersDeps,
): () => void {
    const disposeStackEvents = subscribeStackEvents(bus, deps.stackEventRepo);
    const disposeNotifications = subscribeNotifications(bus, deps.notificationService);
    const disposeStateBroadcast = subscribeStateBroadcast(bus, deps.broadcaster);
    const disposeServiceHealthHistory = subscribeServiceHealthHistory(bus, deps.serviceHealthEventRepo);
    const disposeIncidentTracking = subscribeIncidentTracking(bus, deps.incidentTracker);
    const disposeProbeResults = subscribeProbeResults(bus, deps.probeResultHandler);

    return () => {
        disposeStackEvents();
        disposeNotifications();
        disposeStateBroadcast();
        disposeServiceHealthHistory();
        disposeIncidentTracking();
        disposeProbeResults();
    };
}
