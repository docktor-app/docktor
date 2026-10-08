import {describe, expect, it, vi} from "vitest"
import {registerDomainSubscribers} from "../../../src/application/subscribers/register.js"
import type {EventBusPort} from "../../../src/application/ports/event-bus-port.js"
import type {DomainEventMap} from "../../../src/domain/events.js"

interface RecordedSubscription {
    event: keyof DomainEventMap & string
    order: number
}

/**
 * A bus double that records the order in which `subscribe()` is called, one
 * entry per call — including multiple calls for the same event key, since
 * both the audit subscriber and the live-state bridge subscribe to
 * stack.config_changed. Every `subscribe()` returns its own disposer stub so
 * the returned combined disposer can be asserted against.
 */
function createRecordingBus(): {
    bus: Pick<EventBusPort, "subscribe">
    subscriptions: RecordedSubscription[]
    disposers: Array<ReturnType<typeof vi.fn>>
} {
    const subscriptions: RecordedSubscription[] = []
    const disposers: Array<ReturnType<typeof vi.fn>> = []
    let counter = 0

    const bus: Pick<EventBusPort, "subscribe"> = {
        subscribe: ((event: keyof DomainEventMap & string) => {
            subscriptions.push({event, order: counter++})
            const disposer = vi.fn()
            disposers.push(disposer)
            return disposer
        }) as EventBusPort["subscribe"],
    }

    return {bus, subscriptions, disposers}
}

function createDeps() {
    return {
        stackEventRepo: {createEvent: vi.fn().mockResolvedValue(undefined)},
        notificationService: {notify: vi.fn().mockResolvedValue(undefined)},
        broadcaster: {publish: vi.fn()},
        serviceHealthEventRepo: {record: vi.fn().mockResolvedValue(undefined)},
        incidentTracker: {observeStackStatus: vi.fn().mockResolvedValue(undefined)},
        probeResultHandler: {
            handleProbeCompleted: vi.fn().mockResolvedValue(undefined),
            handleProbeCleared: vi.fn().mockResolvedValue(undefined),
        },
    }
}

describe("registerDomainSubscribers", () => {
    it("registers the audit subscriber's subscription for stack.config_changed before the bridge's subscription for the same event", () => {
        const {bus, subscriptions} = createRecordingBus()

        registerDomainSubscribers(bus, createDeps())

        const configChangedSubscriptions = subscriptions.filter((s) => s.event === "stack.config_changed")
        expect(configChangedSubscriptions).toHaveLength(2)
        expect(configChangedSubscriptions[0]?.order).toBeLessThan(configChangedSubscriptions[1]?.order as number)
    })

    it("registers the audit subscriber (stack.config_changed, stack.config_error) before the notification subscriber's first subscription", () => {
        const {bus, subscriptions} = createRecordingBus()

        registerDomainSubscribers(bus, createDeps())

        const firstAuditOrder = Math.min(
            ...subscriptions.filter((s) => s.event === "stack.config_changed" || s.event === "stack.config_error").map((s) => s.order),
        )
        const firstNotificationOrder = Math.min(
            ...subscriptions.filter((s) => s.event === "backup.failed").map((s) => s.order),
        )

        expect(firstAuditOrder).toBeLessThan(firstNotificationOrder)
    })

    it("registers the service-health history subscriber for service.health_changed", () => {
        const {bus, subscriptions} = createRecordingBus()

        registerDomainSubscribers(bus, createDeps())

        expect(subscriptions.filter((s) => s.event === "service.health_changed")).toHaveLength(1)
    })

    it("registers the incident tracker for both stack status events, after the service-health history subscriber", () => {
        const {bus, subscriptions} = createRecordingBus()

        registerDomainSubscribers(bus, createDeps())

        const healthOrder = subscriptions.find((s) => s.event === "service.health_changed")?.order as number
        // The state-broadcast bridge also listens to these events; the two
        // incident subscriptions come right before the two probe-result ones,
        // which are the last registrations overall.
        const incidentPair = subscriptions.slice(-4, -2)
        expect(incidentPair.map((s) => s.event).sort()).toEqual(["stack.container_state_changed", "stack.status_changed"])
        expect(Math.min(...incidentPair.map((s) => s.order))).toBeGreaterThan(healthOrder)
    })

    it("registers the probe-result handler for service.probe_completed and service.probe_cleared last", () => {
        const {bus, subscriptions} = createRecordingBus()

        registerDomainSubscribers(bus, createDeps())

        expect(subscriptions.filter((s) => s.event === "service.probe_completed")).toHaveLength(1)
        expect(subscriptions.filter((s) => s.event === "service.probe_cleared")).toHaveLength(1)
        expect(subscriptions.slice(-2).map((s) => s.event)).toEqual(["service.probe_completed", "service.probe_cleared"])
    })

    it("returns a disposer that removes every underlying subscription", () => {
        const {bus, disposers} = createRecordingBus()

        const dispose = registerDomainSubscribers(bus, createDeps())
        expect(disposers.length).toBeGreaterThan(0)
        for (const disposer of disposers) {
            expect(disposer).not.toHaveBeenCalled()
        }

        dispose()

        for (const disposer of disposers) {
            expect(disposer).toHaveBeenCalledTimes(1)
        }
    })
})
