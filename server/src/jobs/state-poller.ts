import {dockerodeClient} from "../infrastructure/dockerode-client.js"
import type {DockerodeClientPort} from "../application/ports/dockerode-client-port.js"
import type {EventBusPort} from "../application/ports/event-bus-port.js"
import type {ProbeOwnershipPort} from "../application/ports/probe-ownership-port.js"
import {probedServiceRegistry} from "../application/probed-service-registry.js"
import {domainEventBus} from "../infrastructure/event-bus.js"
import type {StackStatus} from "../generated/prisma/enums.js"
import {deriveStackStatus, isTransitionalStatus} from "../domain/stack-state-derivation.js"
import {
    isHealthTransition,
    isReplacedContainer,
    normalizeHealth,
    probeOwnedHealth,
    type HealthSourceName,
} from "../domain/service-health.js"
import {WatcherJob} from "./job.js"

// Narrows an unknown thrown value to one carrying a given HTTP status code
// (dockerode attaches `statusCode` to its errors).
function hasStatusCode(err: unknown, statusCode: number): boolean {
    return typeof err === "object" && err !== null && "statusCode" in err && err.statusCode === statusCode
}

export interface ServiceState {
    serviceName: string
    containerId?: string | null
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

function storedHealthOf(services: ReadonlyArray<ServiceState>, serviceName: string): string | null {
    return normalizeHealth(services.find((s) => s.serviceName === serviceName)?.healthStatus)
}

function storedContainerIdOf(services: ReadonlyArray<ServiceState>, serviceName: string): string | null {
    return services.find((s) => s.serviceName === serviceName)?.containerId ?? null
}

type ListedContainer = Awaited<ReturnType<DockerodeClientPort["listContainers"]>>[number]

interface ObservedContainer {
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

export class StatePoller extends WatcherJob {
    readonly name = "StatePoller"
    // Reconcile every 60 seconds as a safety net alongside the event stream.
    protected readonly reconcileCronExpression = "*/60 * * * * *"

    private abortController: AbortController | null = null
    private readonly docker: Pick<DockerodeClientPort, "getEventStream" | "inspectContainer" | "listContainers">
    private readonly repo: StatePollerRepo | null
    private readonly bus: Pick<EventBusPort, "emit">
    private readonly probeOwnership: ProbeOwnershipPort

    constructor(
        docker?: Pick<DockerodeClientPort, "getEventStream" | "inspectContainer" | "listContainers">,
        repo?: StatePollerRepo,
        bus?: Pick<EventBusPort, "emit">,
        probeOwnership: ProbeOwnershipPort = probedServiceRegistry,
    ) {
        super()
        this.docker = docker ?? dockerodeClient
        // repo is stored as-is; if undefined, getRepo() will load it lazily
        this.repo = repo ?? null
        this.bus = bus ?? domainEventBus
        this.probeOwnership = probeOwnership
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
        if (isTransitionalStatus(stack.status)) return

        // Inspect the container (may no longer exist if destroy/remove event)
        let info
        try {
            info = await this.docker.inspectContainer(containerId)
        } catch (err: unknown) {
            // Container no longer exists - use event action instead
            if (hasStatusCode(err, 404)) {
                const containerState = action === "destroy" ? "exited" : (action || "unknown")
                await repo.updateServiceState({
                    stackId: stack.id,
                    serviceName,
                    containerId,
                    containerState,
                    healthStatus: null,
                })
                // WR-11: the clear belongs to whoever owns the service's health.
                this.emitHealthTransition(stack.id, serviceName, stack.services, null, this.healthSource(stack.id, serviceName))
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
        // D-07: a probe-owned service keeps its stored (probe) health; Docker's
        // healthcheck value is neither written nor derived from. D-08/WR-05:
        // Docker emits `start` both for a new container and for a restart of
        // the same one, the two cases where the container has not been probed
        // yet, so a probe-owned service starts over as `starting`.
        const probeOwned = this.probeOwnership.isProbeOwned(stack.id, serviceName)
        const healthStatus = probeOwned
            ? probeOwnedHealth(storedHealthOf(stack.services, serviceName), containerState, action === "start")
            : (info.State.Health?.Status ?? null)

        console.log(`[StatePoller] Inspected: service=${serviceName}, state=${containerState}, health=${healthStatus}`)

        // Update the service row in DB
        await repo.updateServiceState({
            stackId: stack.id,
            serviceName,
            containerId,
            containerState,
            healthStatus,
        })

        this.emitHealthTransition(stack.id, serviceName, stack.services, healthStatus, this.healthSource(stack.id, serviceName))

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

    // Reads one container's real state and Docker health and persists them.
    // When inspect fails, the list summary's state and the *stored* health are
    // kept: a transient Docker error must not reset a HEALTHY/UNHEALTHY
    // service to "no health" (RESEARCH Finding 4). `singleContainer` is true
    // when the service has exactly one container in the project.
    private async observeContainer(
        repo: StatePollerRepo,
        stack: StackWithServices,
        serviceName: string,
        container: ListedContainer,
        singleContainer: boolean,
    ): Promise<ObservedContainer> {
        let containerState = container.State
        const storedHealth = storedHealthOf(stack.services, serviceName)
        let healthStatus = storedHealth
        // D-07: a probe-owned service keeps its stored (probe) health.
        const probeOwned = this.probeOwnership.isProbeOwned(stack.id, serviceName)

        try {
            const info = await this.docker.inspectContainer(container.Id)
            containerState = info.State.Status
            if (!probeOwned) healthStatus = info.State.Health?.Status ?? null
        } catch {
            // Fall back to the values above; the per-project error path in
            // reconcile() is reserved for failures that abort the project.
        }

        // D-08/WR-05: a probe-owned service whose single container is a
        // different one than last stored starts over as `starting`. A scaled
        // service has no single container identity and keeps the stored value.
        if (probeOwned) {
            const replaced = singleContainer
                && isReplacedContainer(storedContainerIdOf(stack.services, serviceName), container.Id)
            healthStatus = probeOwnedHealth(storedHealth, containerState, replaced)
        }

        await repo.updateServiceState({
            stackId: stack.id,
            serviceName,
            containerId: container.Id,
            containerState,
            healthStatus,
        })
        this.emitHealthTransition(stack.id, serviceName, stack.services, healthStatus, this.healthSource(stack.id, serviceName))

        return {containerState, healthStatus}
    }

    // D-07: a transition of a probe-owned service's health is the probe's,
    // whichever observer writes it (a reset on a new container, a cleared one).
    private healthSource(stackId: string, serviceName: string): HealthSourceName {
        return this.probeOwnership.isProbeOwned(stackId, serviceName) ? "http-probe" : "docker-healthcheck"
    }

    // Write-before-emit: the history row is appended by a subscriber, so call
    // this only after the Service row is persisted. Emits only when the
    // service has a row in `services` and its normalized health really changed.
    private emitHealthTransition(
        stackId: string,
        serviceName: string,
        services: ReadonlyArray<ServiceState>,
        nextHealth: string | null,
        source: HealthSourceName,
    ): void {
        const previous = services.find((s) => s.serviceName === serviceName)
        if (!previous || !isHealthTransition(previous.healthStatus, nextHealth)) return

        this.bus.emit("service.health_changed", {
            stackId,
            serviceName,
            fromStatus: normalizeHealth(previous.healthStatus),
            toStatus: normalizeHealth(nextHealth),
            source,
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
                if (isTransitionalStatus(stack.status)) continue

                console.log(`[StatePoller] Processing stack=${stack.id}, services in DB: [${stack.services.map(s => s.serviceName).join(", ")}]`)
                console.log(`[StatePoller] Containers found: [${projectContainers.map(c => c.Labels?.["com.docker.compose.service"]).join(", ")}]`)

                // Observe and write every container's real state and health.
                // The first container seen for a service is the one the
                // stack status is derived from.
                const containerCounts = new Map<string, number>()
                for (const container of projectContainers) {
                    const svcName = container.Labels?.["com.docker.compose.service"]
                    if (svcName) containerCounts.set(svcName, (containerCounts.get(svcName) ?? 0) + 1)
                }

                const observed = new Map<string, ObservedContainer>()
                for (const container of projectContainers) {
                    const svcName = container.Labels?.["com.docker.compose.service"]
                    if (!svcName) continue

                    const singleContainer = containerCounts.get(svcName) === 1
                    const observation = await this.observeContainer(repo, stack, svcName, container, singleContainer)
                    if (!observed.has(svcName)) observed.set(svcName, observation)
                }

                // Recalculate and update stack status
                const updatedServices = stack.services.map((s) => {
                    // A service with no container counts as exited.
                    return observed.get(s.serviceName) ?? {containerState: "exited", healthStatus: null}
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
