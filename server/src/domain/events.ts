/**
 * Domain-event catalog (D-04, D-15, D-16). Pure types only — no I/O, no
 * imports from lib/, infrastructure/, repositories/, or jobs/. Each key in
 * DomainEventMap names something that already happened (past tense), not a
 * command; the bus (server/src/infrastructure/event-bus.ts) is generic over
 * this map so callers get the correct payload type inferred from the event
 * name.
 *
 * This catalog covers only events with an existing, grounded producer in
 * server/src/ today. Two categories are intentionally NOT here yet:
 *   - Notification-intent events (backup failure, restore lifecycle, low
 *     disk) — added by plan 10-12 when NotificationWatcher's direct call
 *     sites migrate onto the bus.
 *   - Audit-trail fields on the configuration-changed payload — added by
 *     plan 10-13 when the StackEvent audit trail becomes a subscriber.
 */

/** A stack's status-machine transition completed. */
export interface StackStatusChangedEvent {
    stackId: string;
    status: string;
    previousStatus?: string;
    message?: string;
}

/** A container's runtime state changed (dockerode event stream / reconcile). */
export interface StackContainerStateChangedEvent {
    stackId: string;
    serviceName: string;
    containerState: string;
    healthStatus: string | null;
    stackStatus: string;
    statusLog?: {
        id: string;
        fromStatus: string | null;
        toStatus: string;
        message: string | null;
        createdAt: string;
    };
}

/** A stack's compose/env configuration changed, from either an app-initiated save or an external edit. */
export interface StackConfigChangedEvent {
    stackId: string;
    newHash: string;
    // Distinguishes an app-initiated save (always "app") from a genuine
    // external edit (FileWatcher's publish call sites, always "external") —
    // mirrors lib/state-broadcaster.ts's ConfigChangedEvent.source exactly
    // (G-08-2) so the client's "changed externally" toast gating carries
    // over unchanged.
    source: "app" | "external";
}

/** A stack's compose/env configuration failed to parse. */
export interface StackConfigErrorEvent {
    stackId: string;
    message: string;
}

/** An image update was detected (or ruled out) for one of a stack's services. */
export interface StackUpdateAvailableEvent {
    stackId: string;
    imageRef: string;
    latestTag: string | null;
    hasUpdate: boolean;
}

/** A notification record was created and persisted. */
export interface NotificationCreatedEvent {
    notificationId: string;
}

/** A proxy TLS certificate's status changed (issuance, renewal, expiry approach, failure). */
export interface ProxyCertStatusChangedEvent {
    proxyConfigId: string;
    stackId: string;
    domain: string;
    // Matches @docktor/shared's certStatusSchema exactly — mirrors
    // lib/state-broadcaster.ts's ProxyCertStatusEvent.status.
    status: "pending" | "issued" | "failed" | "expiring";
    message?: string;
}

/**
 * The domain-event catalog: one key per event, mapped to its payload type.
 * The bus (EventBusPort) is generic over this map so emit()/subscribe()
 * infer the correct payload from the event name.
 */
export interface DomainEventMap {
    "stack.status_changed": StackStatusChangedEvent;
    "stack.container_state_changed": StackContainerStateChangedEvent;
    "stack.config_changed": StackConfigChangedEvent;
    "stack.config_error": StackConfigErrorEvent;
    "stack.update_available": StackUpdateAvailableEvent;
    "notification.created": NotificationCreatedEvent;
    "proxy.cert_status_changed": ProxyCertStatusChangedEvent;
}
