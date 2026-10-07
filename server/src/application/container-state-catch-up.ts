import type {StackStatus} from "../generated/prisma/enums.js";
import {deriveStackStatus} from "../domain/stack-state-derivation.js";
import type {DockerodeClientPort} from "./ports/dockerode-client-port.js";
import type {EventBusPort} from "./ports/event-bus-port.js";

const COMPOSE_PROJECT_LABEL = "com.docker.compose.project";
const COMPOSE_SERVICE_LABEL = "com.docker.compose.service";

/** Narrow repository port: only what the catch-up reads and writes. */
export interface ContainerStateCatchUpRepo {
    findByComposeProject(id: string): Promise<{
        id: string;
        status: string;
        services: ReadonlyArray<{serviceName: string}>;
    } | null>;

    updateServiceState(data: {
        stackId: string;
        serviceName: string;
        containerId: string;
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
    containerId: string;
    containerState: string;
    healthStatus: string | null;
}

/**
 * Reads a stack's real containers from Docker right after a deploy-family
 * operation leaves its transitional status, writes per-service state, derives
 * the stack status with the same rule StatePoller uses, and emits
 * StatePoller's per-service `stack.container_state_changed` event so every
 * open client view updates immediately instead of waiting for the next 60s
 * reconcile (#34).
 */
export class ContainerStateCatchUp {
    constructor(
        private readonly docker: Pick<DockerodeClientPort, "listContainers" | "inspectContainer">,
        private readonly repo: ContainerStateCatchUpRepo,
        private readonly bus: Pick<EventBusPort, "emit">,
    ) {}

    async catchUp(stackId: string): Promise<void> {
        const stack = await this.repo.findByComposeProject(stackId);
        if (!stack) return;

        const containers = (await this.docker.listContainers(true)).filter(
            (c) => c.Labels?.[COMPOSE_PROJECT_LABEL] === stackId,
        );

        const observations: ServiceObservation[] = [];
        for (const {serviceName} of stack.services) {
            const match = containers.find((c) => c.Labels?.[COMPOSE_SERVICE_LABEL] === serviceName);
            if (!match) continue;
            const info = await this.docker.inspectContainer(match.Id);
            observations.push({
                serviceName,
                containerId: match.Id,
                containerState: info.State.Status,
                healthStatus: info.State.Health?.Status ?? null,
            });
        }

        for (const o of observations) {
            await this.repo.updateServiceState({stackId, ...o});
        }

        const stackStatus = deriveStackStatus(observations);
        const statusLog = await this.repo.updateStackStatus(stackId, stackStatus);

        observations.forEach((o, index) => {
            this.bus.emit("stack.container_state_changed", {
                stackId,
                serviceName: o.serviceName,
                containerState: o.containerState,
                healthStatus: o.healthStatus,
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
}
