import type {EventBusPort} from "../application/ports/event-bus-port.js"
import {domainEventBus} from "../infrastructure/event-bus.js"
import type {NotificationEvent} from "../application/notification-service.js"
import type {Job, JobHealthReporter} from "./job.js"
import {WatcherJob} from "./job.js"

export interface NotificationWatcherNotificationService {
    notify(event: NotificationEvent): Promise<void>
}

export class NotificationWatcher extends WatcherJob {
    readonly name = "NotificationWatcher"
    // PD-6: a missed in-process broadcast leaves no queryable drift to
    // reconcile against, unlike a stale file hash or container state — this
    // watcher has nothing to reconcile, so it schedules nothing.
    protected readonly reconcileCronExpression = null

    private activeIncidents: Map<string, Set<string>> = new Map()
    private unhealthyTimers: Map<string, NodeJS.Timeout> = new Map()
    private unsubscribers: Array<() => void> = []

    constructor(
        private readonly notificationService: NotificationWatcherNotificationService,
        private readonly bus: Pick<EventBusPort, "subscribe">,
    ) {
        super()
    }

    protected attach(): void {
        // Two subscriptions, not one filtered channel: the old
        // StateBroadcaster subscription received both `container_state` and
        // `stack_status` live-state events on a single callback and filtered
        // by `event.type`. The bus has a separate domain event per kind, so
        // this watcher subscribes to both and forwards each to the same
        // handler — detach() disposes both.
        this.unsubscribers = [
            this.bus.subscribe("stack.status_changed", (payload) => {
                // Field-name note (plan 10-12 action text): this domain
                // event's status field is named `status`, not `stackStatus`
                // — the only field-name difference between the two events
                // this watcher subscribes to (10-03's mirroring keeps every
                // other field name identical to the pre-migration StateEvent
                // shapes).
                void this.handleStatusChange(payload.stackId, payload.status)
            }),
            this.bus.subscribe("stack.container_state_changed", (payload) => {
                void this.handleStatusChange(payload.stackId, payload.stackStatus)
            }),
        ]
        console.log("[NotificationWatcher] Started - subscribed to the domain-event bus")
    }

    protected detach(): void {
        console.log("[NotificationWatcher] Stopped")
        for (const unsubscribe of this.unsubscribers) {
            unsubscribe()
        }
        this.unsubscribers = []

        for (const timer of this.unhealthyTimers.values()) {
            clearTimeout(timer)
        }
        this.unhealthyTimers.clear()
        this.activeIncidents.clear()
    }

    /**
     * Unreachable: reconcileCronExpression is null, so WatcherJob never
     * schedules a cron tick that could call this. Implemented (rather than
     * left undefined) to document why, per PD-6 — a missed broadcast has no
     * queryable drift to reconcile against.
     */
    protected reconcile(): void {
        // Intentionally empty — see class-level doc comment.
    }

    async handleStatusChange(stackId: string, stackStatus: string): Promise<void> {
        console.log(`[NotificationWatcher] Received status change: stackId=${stackId} status=${stackStatus}`)

        if (!this.activeIncidents.has(stackId)) {
            this.activeIncidents.set(stackId, new Set())
        }
        const active = this.activeIncidents.get(stackId)!

        if (stackStatus === "ERROR") {
            // Cancel any pending UNHEALTHY timer (ERROR supersedes UNHEALTHY)
            const existingTimer = this.unhealthyTimers.get(stackId)
            if (existingTimer !== undefined) {
                clearTimeout(existingTimer)
                this.unhealthyTimers.delete(stackId)
            }

            if (!active.has("error")) {
                active.add("error")
                const timestamp = new Date().toISOString()
                console.log(`[NotificationWatcher] Creating stack_error notification for ${stackId}`)
                await this.notificationService.notify({
                    type: "stack_error",
                    stackId,
                    subject: `Stack error: ${stackId}`,
                    message: `Stack ${stackId} entered ERROR state at ${timestamp}\n\nThis notification will not repeat until the stack recovers.`,
                })
                console.log(`[NotificationWatcher] stack_error notification created for ${stackId}`)
            } else {
                console.log(`[NotificationWatcher] Skipping duplicate error notification for ${stackId}`)
            }
            return
        }

        if (stackStatus === "UNHEALTHY") {
            if (!active.has("unhealthy") && !this.unhealthyTimers.has(stackId)) {
                const timer = setTimeout(() => {
                    this.unhealthyTimers.delete(stackId)
                    const currentActive = this.activeIncidents.get(stackId)
                    if (currentActive && !currentActive.has("unhealthy")) {
                        currentActive.add("unhealthy")
                        void this.notificationService.notify({
                            type: "stack_unhealthy",
                            stackId,
                            subject: `Stack unhealthy: ${stackId}`,
                            message: `Stack ${stackId} has been UNHEALTHY for over 2 minutes.\n\nThis notification will not repeat until the stack recovers.`,
                        })
                    }
                }, 120_000)
                this.unhealthyTimers.set(stackId, timer)
            }
            return
        }

        // Recovery: RUNNING, HEALTHY, STOPPED
        if (stackStatus === "RUNNING" || stackStatus === "HEALTHY" || stackStatus === "STOPPED") {
            const existingTimer = this.unhealthyTimers.get(stackId)
            if (existingTimer !== undefined) {
                clearTimeout(existingTimer)
                this.unhealthyTimers.delete(stackId)
            }
            this.activeIncidents.delete(stackId)
        }
    }
}

let _watcher: NotificationWatcher | null = null
let _healthReporter: JobHealthReporter | null = null

async function createProductionWatcher(): Promise<NotificationWatcher> {
    const {notificationService} = await import("../application/index.js")
    const watcher = new NotificationWatcher(notificationService, domainEventBus)
    if (_healthReporter) watcher.setHealthReporter(_healthReporter)
    return watcher
}

// A Job facade over the lazily-constructed production NotificationWatcher —
// the lazy construction itself (not this facade) is what keeps db.ts and
// the rest of the production dependency chain out of the unit-test module
// graph; several suites depend on that staying true.
export const notificationWatcher: Job = {
    name: "NotificationWatcher",
    kind: "watcher",
    start: async () => {
        if (!_watcher) {
            _watcher = await createProductionWatcher()
        }
        await _watcher.start()
    },
    stop: () => _watcher?.stop(),
    setHealthReporter: (reporter: JobHealthReporter) => {
        _healthReporter = reporter
        _watcher?.setHealthReporter(reporter)
    },
}
