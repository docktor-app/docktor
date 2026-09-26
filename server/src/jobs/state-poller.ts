import {dockerodeClient} from "../infrastructure/dockerode-client.js"
import type {DockerodeClientPort} from "../application/ports/dockerode-client-port.js"
import type {EventBusPort} from "../application/ports/event-bus-port.js"
import {domainEventBus} from "../infrastructure/event-bus.js"
import type {StackStatus} from "../generated/prisma/enums.js"
import {WatcherJob} from "./job.js"

export interface ServiceState {
    serviceName: string
    containerState?: string | null
    healthStatus?: string | null
}

export interface StackWithServices {
    id: string
    status: string
    services: ServiceState[]
}

export interface UpdateServiceStateArgs {
    stackId: string
    serviceName: string
    containerId: string
    containerState: string
    healthStatus: string | null
}

export interface StatePollerRepo {
    findByComposeProject(composeProject: string): Promise<StackWithServices | null>
    findAll(): Promise<StackWithServices[]>
    updateServiceState(data: UpdateServiceStateArgs): Promise<void>
    updateStackStatus(stackId: string, status: StackStatus): Promise<{
        id: string
        fromStatus: StackStatus | null
        toStatus: StackStatus
        message: string | null
        createdAt: Date
    } | null>
}

const TRANSITIONAL_STATES = new Set<string>([
    "DEPLOYING",
    "UPDATING",
    "BACKING_UP",
    "RESTORING",
    "MIGRATING",
])

function deriveStackStatus(services: Array<{containerState?: string | null; healthStatus?: string | null}>): StackStatus {
    const states = services.map((s) => s.containerState ?? "")
    const healthStatuses = services.map((s) => s.healthStatus ?? null)

    // If ANY service is "restarting" or "dead" → ERROR
    if (states.some((s) => s === "restarting" || s === "dead")) {
        return "ERROR"
    }

    // If ALL services are "exited" → STOPPED
    if (states.length > 0 && states.every((s) => s === "exited")) {
        return "STOPPED"
    }

    // If ANY service is "unhealthy" → UNHEALTHY
    if (healthStatuses.some((h) => h === "unhealthy")) {
        return "UNHEALTHY"
    }

    // If ALL running services are "healthy" (and at least one has health check) → HEALTHY
    const hasHealthCheck = healthStatuses.some((h) => h !== null)
    if (hasHealthCheck && healthStatuses.every((h) => h === "healthy" || h === null)) {
        return "HEALTHY"
    }

    // Default for mixed states and when all are running
    return "RUNNING"
}

export class StatePoller extends WatcherJob {
    readonly name = "StatePoller"
    // Reconcile every 60 seconds as a safety net alongside the event stream.
    protected readonly reconcileCronExpression = "*/60 * * * * *"

    private abortController: AbortController | null = null
    private readonly docker: Pick<DockerodeClientPort, "getEventStream" | "inspectContainer" | "listContainers">
    private readonly repo: StatePollerRepo | null
    private readonly bus: Pick<EventBusPort, "emit">

    constructor(
        docker?: Pick<DockerodeClientPort, "getEventStream" | "inspectContainer" | "listContainers">,
        repo?: StatePollerRepo,
        bus?: Pick<EventBusPort, "emit">,
    ) {
        super()
        this.docker = docker ?? dockerodeClient
        // repo is stored as-is; if undefined, getRepo() will load it lazily
        this.repo = repo ?? null
        this.bus = bus ?? domainEventBus
    }

    private async getRepo(): Promise<StatePollerRepo> {
        if (this.repo !== null) return this.repo
        // Lazy-load to avoid pulling db.ts into the module graph at test time
        const {stackRepository} = await import("../repositories/stack-repository.js")
        return stackRepository as unknown as StatePollerRepo
    }

    protected async attach(): Promise<void> {
        await this.startEventStream()
    }

    protected async detach(): Promise<void> {
        if (this.abortController) {
            this.abortController.abort()
            this.abortController = null
        }
    }

    private async startEventStream(): Promise<void> {
        this.abortController = new AbortController()
        const signal = this.abortController.signal

        let stream: NodeJS.ReadableStream
        try {
            stream = await this.docker.getEventStream(signal)
        } catch (err) {
            if (signal.aborted) return
            console.error("[StatePoller] failed to open event stream:", err)
            setTimeout(() => {
                if (!signal.aborted) this.startEventStream()
            }, 2000)
            return
        }

        stream.on("data", (chunk: Buffer) => {
            try {
                const event = JSON.parse(chunk.toString())
                this.handleEvent(event).catch((err: unknown) => {
                    console.error("[StatePoller] handleEvent error:", err)
                })
            } catch {
                // ignore unparseable chunks
            }
        })

        stream.on("end", () => {
            if (signal.aborted) return
            setTimeout(() => {
                if (!signal.aborted) this.startEventStream()
            }, 2000)
        })

        stream.on("error", (err: Error) => {
            if (signal.aborted) return
            console.error("[StatePoller] event stream error:", err)
            setTimeout(() => {
                if (!signal.aborted) this.startEventStream()
            }, 2000)
        })
    }

    async handleEvent(event: {
        Type?: string
        Action?: string
        Actor?: {
            ID?: string
            Attributes?: Record<string, string>
        }
        // Legacy format support
        id?: string
        status?: string
    }): Promise<void> {
        // Extract fields from either new or legacy format
        const containerId = event.Actor?.ID || event.id
        const action = event.Action || event.status
        const attributes = event.Actor?.Attributes || {}

        console.log("[StatePoller] Docker event:", {
            type: event.Type,
            id: containerId?.substring(0, 12) || "unknown",
            action,
            project: attributes["com.docker.compose.project"],
            service: attributes["com.docker.compose.service"],
        })

        // Skip events without container ID (network/volume events)
        if (!containerId || event.Type !== "container") {
            return
        }

        const composeProject = attributes["com.docker.compose.project"]
        const serviceName = attributes["com.docker.compose.service"]

        // Skip unmanaged containers (no compose labels)
        if (!composeProject || !serviceName) return

        const repo = await this.getRepo()

        // Find the stack by compose project name
        const stack = await repo.findByComposeProject(composeProject)
        if (!stack) return

        // Skip stacks in transitional states
        if (TRANSITIONAL_STATES.has(stack.status)) return

        // Inspect the container (may no longer exist if destroy/remove event)
        let info
        try {
            info = await this.docker.inspectContainer(containerId)
        } catch (err: any) {
            // Container no longer exists - use event action instead
            if (err.statusCode === 404) {
                const containerState = action === "destroy" ? "exited" : (action || "unknown")
                await repo.updateServiceState({
                    stackId: stack.id,
                    serviceName,
                    containerId,
                    containerState,
                    healthStatus: null,
                })
                const derivedStatus = deriveStackStatus(
                    stack.services.map((s) =>
                        s.serviceName === serviceName
                            ? {containerState, healthStatus: null}
                            : {containerState: s.containerState, healthStatus: s.healthStatus},
                    ),
                )
                console.log(`[StatePoller] Container 404: service=${serviceName}, state=${containerState}, derived=${derivedStatus}`)
                await repo.updateStackStatus(stack.id, derivedStatus)
                this.bus.emit("stack.container_state_changed", {
                    stackId: stack.id,
                    serviceName,
                    containerState,
                    healthStatus: null,
                    stackStatus: derivedStatus,
                })
                return
            }
            throw err
        }

        const containerState = info.State.Status
        const healthStatus = (info.State as any).Health?.Status ?? null

        console.log(`[StatePoller] Inspected: service=${serviceName}, state=${containerState}, health=${healthStatus}`)

        // Update the service row in DB
        await repo.updateServiceState({
            stackId: stack.id,
            serviceName,
            containerId,
            containerState,
            healthStatus,
        })

        // Derive aggregate stack status
        const updatedServices = stack.services.map((s) => {
            if (s.serviceName === serviceName) {
                return {containerState, healthStatus}
            }
            return {containerState: s.containerState, healthStatus: s.healthStatus}
        })
        const derivedStatus = deriveStackStatus(updatedServices)

        console.log(`[StatePoller] handleEvent: stack=${stack.id}, service=${serviceName}, derived=${derivedStatus}, services=[${updatedServices.map(s => s.containerState).join(", ")}]`)

        // Update stack status in DB (returns statusLog if status changed)
        const statusLog = await repo.updateStackStatus(stack.id, derivedStatus)

        // Emit the domain event — the state-broadcast subscriber turns this
        // into the container_state SSE event.
        this.bus.emit("stack.container_state_changed", {
            stackId: stack.id,
            serviceName,
            containerState,
            healthStatus,
            stackStatus: derivedStatus,
            ...(statusLog && {
                statusLog: {
                    id: statusLog.id,
                    fromStatus: statusLog.fromStatus,
                    toStatus: statusLog.toStatus,
                    message: statusLog.message,
                    createdAt: statusLog.createdAt.toISOString(),
                },
            }),
        })
    }

    protected async reconcile(): Promise<void> {
        console.log("[StatePoller] Starting reconcile...")
        const repo = await this.getRepo()
        const containers = await this.docker.listContainers(true)

        console.log(`[StatePoller] Found ${containers.length} total containers`)

        // Group containers by compose project
        const byProject = new Map<string, typeof containers>()
        for (const container of containers) {
            const project = container.Labels?.["com.docker.compose.project"]
            if (!project) continue
            if (!byProject.has(project)) byProject.set(project, [])
            byProject.get(project)!.push(container)
        }

        // Update each project's services
        for (const [project, projectContainers] of byProject) {
            try {
                const stack = await repo.findByComposeProject(project)
                if (!stack) continue
                if (TRANSITIONAL_STATES.has(stack.status)) continue

                console.log(`[StatePoller] Processing stack=${stack.id}, services in DB: [${stack.services.map(s => s.serviceName).join(", ")}]`)
                console.log(`[StatePoller] Containers found: [${projectContainers.map(c => c.Labels?.["com.docker.compose.service"]).join(", ")}]`)

                // Update all service states
                for (const container of projectContainers) {
                    const svcName = container.Labels?.["com.docker.compose.service"]
                    if (!svcName) continue

                    await repo.updateServiceState({
                        stackId: stack.id,
                        serviceName: svcName,
                        containerId: container.Id,
                        containerState: container.State,
                        healthStatus: null,
                    })
                }

                // Recalculate and update stack status
                const updatedServices = stack.services.map((s) => {
                    const matchingContainer = projectContainers.find(
                        (c) => c.Labels?.["com.docker.compose.service"] === s.serviceName,
                    )
                    if (matchingContainer) {
                        return {containerState: matchingContainer.State, healthStatus: null}
                    }
                    // Service has no running container
                    return {containerState: "exited", healthStatus: null}
                })
                const derivedStatus = deriveStackStatus(updatedServices)

                console.log(`[StatePoller] Reconcile: stack=${stack.id}, derived=${derivedStatus}, services=[${updatedServices.map((s, i) => `${stack.services[i]?.serviceName}:${s.containerState}`).join(", ")}]`)

                // Update stack status in DB. Returns the created statusLog
                // row only when the status actually changed — the
                // repository returns null and skips the write when the
                // derived status equals the stack's current status. The
                // event below fires only when the repository reports a
                // real transition, so a steady-state tick is silent for
                // both the notification watcher and the live-state stream.
                const statusLog = await repo.updateStackStatus(stack.id, derivedStatus)

                // Emit the domain event — the state-broadcast subscriber
                // turns this into the stack_status SSE event.
                if (statusLog) {
                    this.bus.emit("stack.status_changed", {
                        stackId: stack.id,
                        status: derivedStatus,
                    })
                }
            } catch (err) {
                console.error(`[StatePoller] reconcile error for project ${project}:`, err)
            }
        }
    }
}

export const statePoller = new StatePoller()
