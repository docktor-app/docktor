import type {DomainEventMap} from "../../domain/events.js";

/**
 * Port for the in-process domain-event bus (D-04, D-16, D-17). Declared
 * here so application services depend on this contract, not on the
 * concrete InMemoryEventBus (infrastructure/event-bus.ts) or on Node's
 * EventEmitter directly.
 *
 * Contract, not an implementation note: `emit` never throws and never
 * awaits. A publisher calls `emit` only after its own work (e.g. a
 * database write) has resolved, and a subscriber's failure or slowness
 * must never be able to strand that publisher — no subscriber exception
 * propagates back through `emit`, and `emit` returns synchronously without
 * waiting for any subscriber (sync or async) to finish.
 */
export interface EventBusPort {
    emit<K extends keyof DomainEventMap & string>(event: K, payload: DomainEventMap[K]): void;

    subscribe<K extends keyof DomainEventMap & string>(
        event: K,
        handler: (payload: DomainEventMap[K]) => void | Promise<void>,
    ): () => void;
}
