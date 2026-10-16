import {useEffect, useRef} from "react"

import type {MigrationOperation} from "@docktor/shared"

export interface ContainerStateEvent {
    type: "container_state"
    stackId: string
    serviceName: string
    containerState: string
    healthStatus: string | null
    stackStatus: string
    statusLog?: {
        id: string
        fromStatus: string | null
        toStatus: string
        message: string | null
        createdAt: string
    }
}

export interface StackStatusEvent {
    type: "stack_status"
    stackId: string
    stackStatus: string
}

// source is structurally identical to server/src/lib/state-broadcaster.ts's
// ConfigChangedEvent.source — this file is a hand-maintained mirror of the
// server's StateEvent union, so field names must stay byte-identical.
export interface ConfigChangedEvent {
    type: "config_changed"
    stackId: string
    source: "app" | "external"
}

export interface ConfigErrorEvent {
    type: "config_error"
    stackId: string
    message: string
}

export interface UpdateAvailableEvent {
    type: "update_available"
    stackId: string
    imageRef: string
    latestTag: string | null
    hasUpdate: boolean
}

export interface NotificationCreatedEvent {
    type: "notification_created"
    notificationId: string
}

// Structurally identical to server/src/lib/state-broadcaster.ts's
// ProxyCertStatusEvent — this file is a hand-maintained mirror of the
// server's StateEvent union, so field names must stay byte-identical.
export interface ProxyCertStatusEvent {
    type: "proxy_cert_status"
    proxyConfigId: string
    stackId: string
    domain: string
    status: "pending" | "issued" | "failed"
    message?: string
}

// Structurally identical to server/src/lib/state-broadcaster.ts's
// MigrationProgressEvent (G-18-job) — the operation is the shared
// MigrationOperation snapshot, so the mirror cannot drift from the REST shape.
export interface MigrationProgressEvent {
    type: "migration_progress"
    operation: MigrationOperation
}

export type StateEvent = ContainerStateEvent | StackStatusEvent | ConfigChangedEvent | ConfigErrorEvent | UpdateAvailableEvent | NotificationCreatedEvent | ProxyCertStatusEvent | MigrationProgressEvent

const BASE = globalThis.location?.port === "5173" ? "http://localhost:3000" : ""

export function useContainerEvents(onEvent: (event: StateEvent) => void) {
    const handler = useRef(onEvent)
    handler.current = onEvent

    useEffect(() => {
        const es = new EventSource(`${BASE}/api/events`, {withCredentials: true})
        es.onmessage = (e) => handler.current(JSON.parse(e.data))
        es.onerror = () => {} // Native EventSource auto-reconnects
        return () => es.close()
    }, [])
}
