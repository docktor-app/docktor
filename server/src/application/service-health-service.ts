import type {StackStatus} from "../generated/prisma/enums.js";
import {
    describeProbeTransition,
    evaluateProbe,
    seedProbeState,
    type ProbeState,
} from "../domain/health-probe.js";
import type {ServiceProbeClearedEvent, ServiceProbeCompletedEvent} from "../domain/events.js";
import {normalizeHealth, type HealthSourceName} from "../domain/service-health.js";
import {deriveStackStatus, isTransitionalStatus} from "../domain/stack-state-derivation.js";
import {withKeyedLock} from "../lib/keyed-mutex.js";
import type {DockerodeClientPort} from "./ports/dockerode-client-port.js";
import type {EventBusPort} from "./ports/event-bus-port.js";

export interface ServiceHealthServiceRow {
    serviceName: string;
    containerId: string | null;
    containerState: string | null;
    healthStatus: string | null;
}

export interface ServiceHealthServiceStack {
    id: string;
    status: string;
    services: ReadonlyArray<ServiceHealthServiceRow>;
}

/** The slice of StackRepository this service uses; StackRepository satisfies it as is. */
export interface ServiceHealthServiceRepo {
    findByComposeProject(composeProject: string): Promise<ServiceHealthServiceStack | null>;
    updateServiceState(data: {
        stackId: string;
        serviceName: string;
        containerId: string | null;
        containerState: string;
        healthStatus: string | null;
    }): Promise<void>;
    updateStackStatus(
        stackId: string,
        status: StackStatus,
    ): Promise<{
        id: string;
        fromStatus: string | null;
        toStatus: string;
        message: string | null;
        createdAt: Date;
    } | null>;
}

/** One persisted health change of a Service row, whoever caused it. */
interface HealthChange {
    containerId: string | null;
    containerState: string;
    previous: string | null;
    next: string | null;
    source: HealthSourceName;
    message: string | null;
}

const PROBE_REMOVED_MESSAGE = "HTTP probe removed";

/** What the service remembers about the container it last probed (Pitfall 5). */
interface ProbeEntry {
    containerId: string;
    startedAt: string | null;
    probe: ProbeState;
}

const NEW_CONTAINER_STATE: ProbeState = {consecutiveFailures: 0, health: "starting"};

/**
 * The only writer of probe-derived health (#23, D-03, D-07). It turns a
 * finished probe into a health value with the pure rule in domain/health-probe
 * and, only when that changes the service's health, persists it, records it as
 * `http-probe` history and re-emits the stack's re-derived status through the
 * same `stack.container_state_changed` event StatePoller emits. That is why
 * NotificationWatcher, the live-state bridge and incident tracking behave for a
 * probe exactly as they do for Docker health, with no change of their own.
 *
 * Per-service probe state is kept in memory, keyed by `stackId/serviceName`
 * (never Service.id, which a deploy replaces, Pitfall 10). After a Docktor
 * restart the first observation continues from the stored health instead of
 * resetting it, so a restart never flaps a stack.
 */
export class ServiceHealthService {
    private readonly entries = new Map<string, ProbeEntry>();

    constructor(
        private readonly repo: ServiceHealthServiceRepo,
        private readonly bus: Pick<EventBusPort, "emit">,
        // Held for the probe-lifecycle handling (handleProbeCleared) that reads
        // Docker's own health back when a probe stops being authoritative.
        private readonly docker: Pick<DockerodeClientPort, "inspectContainer">,
        private readonly now: () => number = Date.now,
    ) {}

    /** Never rejects: a failure is logged with the stack/service and swallowed. */
    async handleProbeCompleted(event: ServiceProbeCompletedEvent): Promise<void> {
        // One lock per stack: results for different services of a stack both
        // re-read the Service rows and derive the same stack status.
        await withKeyedLock(`service-health:${event.stackId}`, async () => {
            try {
                await this.applyProbeResult(event);
            } catch (err) {
                console.error(
                    `[ServiceHealthService] failed to apply probe result for "${event.stackId}/${event.serviceName}":`,
                    err,
                );
            }
        });
    }

    private async applyProbeResult(event: ServiceProbeCompletedEvent): Promise<void> {
        const stack = await this.repo.findByComposeProject(event.stackId);
        if (stack === null || isTransitionalStatus(stack.status)) {
            return;
        }
        const row = stack.services.find((service) => service.serviceName === event.serviceName);
        // A result for a container that stopped while it was being probed would
        // resurrect a health value for a service that is no longer running.
        if (row === undefined || row.containerState !== "running") {
            return;
        }
        // D-08: a result is applied only to the container it was taken from. One
        // still queued for a container a deploy or restart replaced must not
        // write the old id, history or health over the new container's row. A
        // null row id means Docktor does not know the current container, so no
        // result can be attributed to it (HealthProbeJob never probes such a row).
        if (row.containerId !== event.containerId) {
            return;
        }

        const stored = normalizeHealth(row.healthStatus);
        const probe = this.advance(event, stored);
        if (probe.health === stored) {
            return;
        }
        await this.applyHealth(stack, row, {
            containerId: event.containerId,
            containerState: "running",
            previous: stored,
            next: probe.health,
            source: "http-probe",
            message: describeProbeTransition(probe.health, event.outcome),
        });
    }

    /**
     * A service stopped being probed. Its in-memory probe state is dropped so a
     * later probe starts over, and a health value the probe left behind is
     * replaced by the truth (RESEARCH Pitfall 4): null when the container
     * stopped, Docker's own health when the probe block was removed. Never
     * rejects, like handleProbeCompleted.
     */
    async handleProbeCleared(event: ServiceProbeClearedEvent): Promise<void> {
        await withKeyedLock(`service-health:${event.stackId}`, async () => {
            try {
                await this.applyProbeCleared(event);
            } catch (err) {
                console.error(
                    `[ServiceHealthService] failed to clear probe health for "${event.stackId}/${event.serviceName}":`,
                    err,
                );
            }
        });
    }

    private async applyProbeCleared(event: ServiceProbeClearedEvent): Promise<void> {
        this.entries.delete(`${event.stackId}/${event.serviceName}`);

        const stack = await this.repo.findByComposeProject(event.stackId);
        if (stack === null || isTransitionalStatus(stack.status)) {
            return;
        }
        const row = stack.services.find((service) => service.serviceName === event.serviceName);
        // The job saw the container stopped, but it may have started again
        // since; its probes resume and decide the health then.
        if (row === undefined || (event.reason === "container-not-running" && row.containerState === "running")) {
            return;
        }

        const stored = normalizeHealth(row.healthStatus);
        const revert = await this.healthAfterClear(event, row);
        if (revert.next === stored) {
            return;
        }
        await this.applyHealth(stack, row, {
            containerId: row.containerId,
            containerState: row.containerState ?? "",
            previous: stored,
            ...revert,
        });
    }

    // A stopped container has no health; a container that is still running goes
    // back to what Docker itself reports, which is null when it has no healthcheck.
    private async healthAfterClear(
        event: ServiceProbeClearedEvent,
        row: ServiceHealthServiceRow,
    ): Promise<{next: string | null; source: HealthSourceName; message: string | null}> {
        if (event.reason === "container-not-running" || row.containerState !== "running" || row.containerId === null) {
            return {next: null, source: "http-probe", message: null};
        }
        return {next: await this.dockerHealth(row.containerId), source: "docker-healthcheck", message: PROBE_REMOVED_MESSAGE};
    }

    private async dockerHealth(containerId: string): Promise<string | null> {
        try {
            const info = await this.docker.inspectContainer(containerId);
            return normalizeHealth(info.State.Health?.Status);
        } catch {
            // Without a readable container there is no health to restore.
            return null;
        }
    }

    // Runs the pure rule for this result and remembers the new state. The state
    // to continue from is, in order: the stored health for a service seen for
    // the first time; `starting` for a new container (changed id or start
    // time); the stored health again when the remembered health disagrees with
    // the row, because the row is the truth once an observer reset it (a Docker
    // start event, the post-deploy catch-up) or the container-gone path cleared
    // it; otherwise the remembered state.
    private advance(event: ServiceProbeCompletedEvent, stored: string | null): ProbeState {
        const key = `${event.stackId}/${event.serviceName}`;
        const existing = this.entries.get(key);
        // A null start time means the container could not be inspected for this
        // probe, which says nothing about whether it is a new container.
        const startedAt = event.containerStartedAt ?? existing?.startedAt ?? null;

        let prev: ProbeState;
        if (existing === undefined) {
            prev = seedProbeState(stored);
        } else if (isNewContainer(existing, event)) {
            prev = NEW_CONTAINER_STATE;
        } else if (existing.probe.health !== stored) {
            prev = seedProbeState(stored);
        } else {
            prev = existing.probe;
        }

        const parsedStart = startedAt === null ? Number.NaN : Date.parse(startedAt);
        const probe = evaluateProbe(prev, event.outcome, {
            startedAtMs: Number.isNaN(parsedStart) ? 0 : parsedStart,
            nowMs: this.now(),
        });
        this.entries.set(key, {containerId: event.containerId, startedAt, probe});
        return probe;
    }

    // Order matters: the row is written before either event, so a consumer
    // that reacts to the event reads the new state (write-before-emit).
    private async applyHealth(
        stack: ServiceHealthServiceStack,
        row: ServiceHealthServiceRow,
        change: HealthChange,
    ): Promise<void> {
        const {containerId, containerState, previous, next, source, message} = change;

        await this.repo.updateServiceState({
            stackId: stack.id,
            serviceName: row.serviceName,
            containerId,
            containerState,
            healthStatus: next,
        });
        this.bus.emit("service.health_changed", {
            stackId: stack.id,
            serviceName: row.serviceName,
            fromStatus: previous,
            toStatus: next,
            source,
            ...(message !== null && {message}),
        });

        const stackStatus = deriveStackStatus(
            stack.services.map((service) =>
                service.serviceName === row.serviceName
                    ? {containerState, healthStatus: next}
                    : {containerState: service.containerState, healthStatus: service.healthStatus},
            ),
        );
        const statusLog = await this.repo.updateStackStatus(stack.id, stackStatus);

        // Same payload shape as StatePoller.handleEvent, so every consumer of
        // the event treats a probe-driven change like a Docker-driven one.
        this.bus.emit("stack.container_state_changed", {
            stackId: stack.id,
            serviceName: row.serviceName,
            containerState,
            healthStatus: next,
            stackStatus,
            ...(statusLog && {
                statusLog: {
                    id: statusLog.id,
                    fromStatus: statusLog.fromStatus,
                    toStatus: statusLog.toStatus,
                    message: statusLog.message,
                    createdAt: statusLog.createdAt.toISOString(),
                },
            }),
        });
    }
}

function isNewContainer(existing: ProbeEntry, event: ServiceProbeCompletedEvent): boolean {
    if (existing.containerId !== event.containerId) {
        return true;
    }
    return (
        event.containerStartedAt !== null &&
        existing.startedAt !== null &&
        existing.startedAt !== event.containerStartedAt
    );
}
