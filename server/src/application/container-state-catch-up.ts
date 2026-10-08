import type {StackStatus} from "../generated/prisma/enums.js";
import {isHealthTransition, normalizeHealth} from "../domain/service-health.js";
import {deriveStackStatus, isTransitionalStatus} from "../domain/stack-state-derivation.js";
import type {DockerodeClientPort} from "./ports/dockerode-client-port.js";
import type {EventBusPort} from "./ports/event-bus-port.js";
import type {ProbeOwnershipPort} from "./ports/probe-ownership-port.js";
import {probedServiceRegistry} from "./probed-service-registry.js";

const COMPOSE_PROJECT_LABEL = "com.docker.compose.project";
const COMPOSE_SERVICE_LABEL = "com.docker.compose.service";

/** Narrow repository port: only what the catch-up reads and writes. */
export interface ContainerStateCatchUpRepo {
    findByComposeProject(id: string): Promise<{
        id: string;
        status: string;
        services: ReadonlyArray<{serviceName: string; healthStatus: string | null}>;
    } | null>;

    updateServiceState(data: {
        stackId: string;
        serviceName: string;
        containerId: string | null;
        containerState: string;
        healthStatus: string | null;
    }): Promise<void>;

    updateStackStatus(stackId: string, status: StackStatus): Promise<{
        id: string;
        fromStatus: StackStatus | null;
        toStatus: StackStatus;
        message: string | null;
        createdAt: Date;
    } | null>;
}

interface ServiceObservation {
    serviceName: string;
    containerId: string | null;
    containerState: string;
    healthStatus: string | null;
}

type ListedContainer = Awaited<ReturnType<DockerodeClientPort["listContainers"]>>[number];

/**
 * Reads a stack's real containers from Docker right after a deploy-family
 * operation leaves its transitional status, writes per-service state, derives
 * the stack status with the same rule StatePoller uses, and emits
 * StatePoller's per-service `stack.container_state_changed` event so every
 * open client view updates immediately instead of waiting for the next 60s
 * reconcile (#34).
 *
 * Never rejects: it must not mask the outcome of the action that called it.
 */
export class ContainerStateCatchUp {
    constructor(
        private readonly docker: Pick<DockerodeClientPort, "listContainers" | "inspectContainer">,
        private readonly repo: ContainerStateCatchUpRepo,
        private readonly bus: Pick<EventBusPort, "emit">,
        private readonly probeOwnership: ProbeOwnershipPort = probedServiceRegistry,
    ) {}

    async catchUp(stackId: string): Promise<void> {
        try {
            await this.run(stackId);
        } catch (err) {
            console.error(`[ContainerStateCatchUp] catch-up failed for stack "${stackId}":`, err);
        }
    }

    private async run(stackId: string): Promise<void> {
        const stack = await this.repo.findByComposeProject(stackId);
        // Skip a vanished or empty stack (deriving over no services would claim
        // RUNNING) and a stack another operation has moved into a transitional
        // status since: that operation owns the status and will finish it itself.
        if (!stack || stack.services.length === 0 || isTransitionalStatus(stack.status)) return;

        const containers = (await this.docker.listContainers(true)).filter(
            (c) => c.Labels?.[COMPOSE_PROJECT_LABEL] === stackId,
        );

        const observations: ServiceObservation[] = [];
        for (const service of stack.services) {
            observations.push(await this.observe(stackId, service, containers));
        }

        // All writes complete before any event is emitted, so a failed write
        // never advertises state that was not persisted.
        for (const observation of observations) {
            await this.repo.updateServiceState({stackId, ...observation});
        }

        // Intentionally replaces a just-set ERROR with the status derived from
        // real containers, exactly as the 60s reconcile would; the action's own
        // failure result, Deployment record and ERROR log entry are untouched.
        const stackStatus = deriveStackStatus(observations);
        const statusLog = await this.repo.updateStackStatus(stackId, stackStatus);

        // Record each Docker-health transition seen here in the history, after
        // every write above and before the per-service state events.
        observations.forEach((observation, index) => {
            // D-07: a probe-owned service's health is the probe's, so Docker
            // never records a transition for it.
            if (this.probeOwnership.isProbeOwned(stackId, observation.serviceName)) return;
            const stored = stack.services[index]?.healthStatus;
            if (!isHealthTransition(stored, observation.healthStatus)) return;
            this.bus.emit("service.health_changed", {
                stackId,
                serviceName: observation.serviceName,
                fromStatus: normalizeHealth(stored),
                toStatus: normalizeHealth(observation.healthStatus),
                source: "docker-healthcheck",
            });
        });

        observations.forEach((observation, index) => {
            this.bus.emit("stack.container_state_changed", {
                stackId,
                serviceName: observation.serviceName,
                containerState: observation.containerState,
                healthStatus: observation.healthStatus,
                stackStatus,
                // The status-log entry rides on exactly one event so the
                // client timeline prepends it once.
                ...(index === 0 && statusLog && {
                    statusLog: {
                        id: statusLog.id,
                        fromStatus: statusLog.fromStatus,
                        toStatus: statusLog.toStatus,
                        message: statusLog.message,
                        createdAt: statusLog.createdAt.toISOString(),
                    },
                }),
            });
        });
    }

    private async observe(
        stackId: string,
        {serviceName, healthStatus: storedHealth}: {serviceName: string; healthStatus: string | null},
        containers: ReadonlyArray<ListedContainer>,
    ): Promise<ServiceObservation> {
        const match = containers.find((c) => c.Labels?.[COMPOSE_SERVICE_LABEL] === serviceName);
        // No container after the operation: report it exited rather than
        // inventing a state, matching reconcile's in-memory default.
        if (!match) {
            return {serviceName, containerId: null, containerState: "exited", healthStatus: null};
        }

        // D-07: a probe-owned service keeps its stored (probe) health.
        const probeOwned = this.probeOwnership.isProbeOwned(stackId, serviceName);

        try {
            const info = await this.docker.inspectContainer(match.Id);
            return {
                serviceName,
                containerId: match.Id,
                containerState: info.State.Status,
                healthStatus: probeOwned ? normalizeHealth(storedHealth) : (info.State.Health?.Status ?? null),
            };
        } catch {
            // Container vanished between list and inspect (or inspect failed):
            // fall back to the state the list call already reported and keep
            // the stored health rather than resetting it to null.
            return {
                serviceName,
                containerId: match.Id,
                containerState: match.State,
                healthStatus: normalizeHealth(storedHealth),
            };
        }
    }
}
