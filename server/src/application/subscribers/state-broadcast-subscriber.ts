import type {EventBusPort} from "../ports/event-bus-port.js"
import type {StateBroadcaster, StateEvent} from "../../lib/state-broadcaster.js"

/**
 * Bridges the domain-event bus onto the live-state broadcaster (D-15 item 3,
 * D-18). The live-state broadcaster becomes an ordinary bus subscriber
 * instead of a special-cased inline call, with zero change to what a
 * connected browser observes over GET /api/events.
 *
 * Mapping table (bus event key -> live-state event `type`), one entry per
 * domain event in DomainEventMap:
 *   stack.status_changed          -> stack_status
 *   stack.container_state_changed -> container_state
 *   stack.config_changed          -> config_changed
 *   stack.config_error            -> config_error
 *   stack.update_available        -> update_available
 *   notification.created          -> notification_created
 *   proxy.cert_status_changed     -> proxy_cert_status
 *
 * Every handler runs to completion synchronously — nothing here waits on a
 * promise — so an event emitted inside a publisher's method reaches the
 * broadcaster within the same synchronous turn as the old inline call did,
 * preserving ordering relative to whatever the publisher does next. Every
 * field is mapped explicitly
 * (never spread, never cast), so a future field added to a domain event is a
 * compile error here, not a silent passthrough onto the wire shape.
 */
export function subscribeStateBroadcast(
    bus: Pick<EventBusPort, "subscribe">,
    broadcaster: Pick<StateBroadcaster, "publish">,
): () => void {
    const unsubscribers: Array<() => void> = []

    unsubscribers.push(
        bus.subscribe("stack.status_changed", (payload) => {
            publish(broadcaster, {
                type: "stack_status",
                stackId: payload.stackId,
                stackStatus: payload.status,
            })
        }),
    )

    unsubscribers.push(
        bus.subscribe("stack.container_state_changed", (payload) => {
            const event: Extract<StateEvent, {type: "container_state"}> = {
                type: "container_state",
                stackId: payload.stackId,
                serviceName: payload.serviceName,
                containerState: payload.containerState,
                healthStatus: payload.healthStatus,
                stackStatus: payload.stackStatus,
            }
            if (payload.statusLog) {
                event.statusLog = {
                    id: payload.statusLog.id,
                    fromStatus: payload.statusLog.fromStatus,
                    toStatus: payload.statusLog.toStatus,
                    message: payload.statusLog.message,
                    createdAt: payload.statusLog.createdAt,
                }
            }
            publish(broadcaster, event)
        }),
    )

    unsubscribers.push(
        bus.subscribe("stack.config_changed", (payload) => {
            publish(broadcaster, {
                type: "config_changed",
                stackId: payload.stackId,
                newHash: payload.newHash,
                source: payload.source,
            })
        }),
    )

    unsubscribers.push(
        bus.subscribe("stack.config_error", (payload) => {
            publish(broadcaster, {
                type: "config_error",
                stackId: payload.stackId,
                message: payload.message,
            })
        }),
    )

    unsubscribers.push(
        bus.subscribe("stack.update_available", (payload) => {
            publish(broadcaster, {
                type: "update_available",
                stackId: payload.stackId,
                imageRef: payload.imageRef,
                latestTag: payload.latestTag,
                hasUpdate: payload.hasUpdate,
            })
        }),
    )

    unsubscribers.push(
        bus.subscribe("notification.created", (payload) => {
            publish(broadcaster, {
                type: "notification_created",
                notificationId: payload.notificationId,
            })
        }),
    )

    unsubscribers.push(
        bus.subscribe("proxy.cert_status_changed", (payload) => {
            const event: Extract<StateEvent, {type: "proxy_cert_status"}> = {
                type: "proxy_cert_status",
                proxyConfigId: payload.proxyConfigId,
                stackId: payload.stackId,
                domain: payload.domain,
                status: payload.status,
            }
            if (payload.message !== undefined) {
                event.message = payload.message
            }
            publish(broadcaster, event)
        }),
    )

    return () => {
        for (const unsubscribe of unsubscribers) {
            unsubscribe()
        }
    }
}

/**
 * Publishes one translated event to the broadcaster. The bus already
 * isolates subscribers from each other (D-17), so this try/catch is
 * additional: it keeps a broadcaster failure out of the log path the bus
 * would otherwise attribute to "subscriber failed for <event>", logging with
 * the live-state event's own type instead.
 */
function publish(broadcaster: Pick<StateBroadcaster, "publish">, event: StateEvent): void {
    try {
        broadcaster.publish(event)
    } catch (err) {
        console.error(`[state-broadcast-subscriber] failed to publish "${event.type}":`, err)
    }
}
