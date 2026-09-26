import { EventEmitter } from "node:events"
import type { EventBusPort } from "../application/ports/event-bus-port.js"
import type { DomainEventMap } from "../domain/events.js"

/**
 * In-memory, synchronous domain-event bus (D-04, D-16). Its defining
 * property is per-subscriber failure isolation (D-17): a throwing or
 * rejecting subscriber can never prevent another subscriber for the same
 * event from running, and can never propagate back to the code that called
 * `emit`.
 *
 * A private Node EventEmitter is used for listener storage and removal
 * only — its own `emit()` is deliberately never called. Node's
 * `EventEmitter.emit()` does not isolate listeners: a throwing listener
 * aborts the whole dispatch and every listener registered after it never
 * runs (falsified live in 10-RESEARCH.md's "Common Pitfalls > Pitfall 1").
 * `emit()` below instead iterates `rawListeners()` and dispatches to each
 * one inside its own try/catch.
 */
export class InMemoryEventBus implements EventBusPort {
    private readonly emitter = new EventEmitter()

    constructor() {
        // Matches lib/state-broadcaster.ts's existing precedent (100, not
        // Node's default of 10) — this bus accumulates more heterogeneous
        // subscribers per event than the broadcaster's single SSE channel
        // did, since D-15 moves three separate side-effect categories
        // (notifications, the audit trail, status broadcasts) onto it.
        this.emitter.setMaxListeners(100)
    }

    emit<K extends keyof DomainEventMap & string>(event: K, payload: DomainEventMap[K]): void {
        // rawListeners() (not listeners()) so a future subscribe()
        // implementation that wraps handlers stays observable through this
        // same dispatch loop.
        const listeners = this.emitter.rawListeners(event) as Array<
            (p: DomainEventMap[K]) => void | Promise<void>
        >
        for (const listener of listeners) {
            try {
                const result = listener(payload)
                if (result instanceof Promise) {
                    result.catch((err: unknown) => {
                        console.error(`[EventBus] async subscriber failed for "${event}":`, err)
                    })
                }
            } catch (err) {
                console.error(`[EventBus] subscriber failed for "${event}":`, err)
            }
        }
    }

    subscribe<K extends keyof DomainEventMap & string>(
        event: K,
        handler: (payload: DomainEventMap[K]) => void | Promise<void>,
    ): () => void {
        this.emitter.on(event, handler)
        let unsubscribed = false
        return () => {
            if (unsubscribed) return
            unsubscribed = true
            this.emitter.off(event, handler)
        }
    }
}

export const domainEventBus = new InMemoryEventBus()
