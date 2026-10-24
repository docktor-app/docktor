import {useEffect, useRef} from "react"

import {stateEventSchema, type StateEvent} from "@docktor/shared"

// The event shapes live in @docktor/shared (state-events.ts), shared with the
// server's StateBroadcaster. The names are re-exported so consumers keep their imports.
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

const BASE = globalThis.location?.port === "5173" ? "http://localhost:3000" : ""

interface UseContainerEventsOptions {
    /** Called each time the connection opens, the first time and after every automatic reconnect. */
    onOpen?: () => void
}

export function useContainerEvents(onEvent: (event: StateEvent) => void, options?: UseContainerEventsOptions) {
    const handler = useRef(onEvent)
    handler.current = onEvent
    const onOpen = useRef(options?.onOpen)
    onOpen.current = options?.onOpen

    useEffect(() => {
        const es = new EventSource(`${BASE}/api/events`, {withCredentials: true})
        es.onopen = () => onOpen.current?.()
        es.onmessage = (e) => {
            let frame: unknown
            try {
                frame = JSON.parse(e.data)
            } catch {
                // A malformed frame must not break the stream; the next frame is independent.
                return
            }
            // T-22-08: a frame that is not a known event shape never reaches a handler.
            const parsed = stateEventSchema.safeParse(frame)
            if (parsed.success) handler.current(parsed.data)
        }
        es.onerror = () => {} // Native EventSource auto-reconnects
        return () => es.close()
    }, [])
}
