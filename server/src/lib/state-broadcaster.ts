import {EventEmitter} from "node:events"
import type {StateEvent} from "@docktor/shared"

// The event shapes live in @docktor/shared (state-events.ts) so server and
// client share one Zod definition of every /api/events frame. The names are
// re-exported so existing server importers compile unchanged.
export type {
    ConfigChangedEvent,
    ConfigErrorEvent,
    ContainerStateEvent,
    MigrationProgressEvent,
    NotificationCreatedEvent,
    ProxyCertStatusEvent,
    StackStatusEvent,
    StateEvent,
    UpdateAvailableEvent,
} from "@docktor/shared"

export class StateBroadcaster extends EventEmitter {
    publish(event: StateEvent): void {
        this.emit("event", event)
    }

    subscribe(handler: (event: StateEvent) => void): () => void {
        this.on("event", handler)
        return () => this.off("event", handler)
    }
}

export const stateEventBroadcaster = new StateBroadcaster()
stateEventBroadcaster.setMaxListeners(100)
