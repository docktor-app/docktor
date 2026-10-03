import type Dockerode from "dockerode";
import {extractRequestedHostPorts, parseEnvAssignments} from "../domain/host-ports.js";
import {
    resolvePortConflicts,
    type DocktorStackPorts,
    type PortConflict,
    type RunningContainerPorts,
} from "../domain/port-conflicts.js";
import type {StackFilesystemPort} from "./ports/stack-filesystem-port.js";
import type {DockerodeClientPort} from "./ports/dockerode-client-port.js";
import type {SocketInspectorPort} from "./ports/socket-inspector-port.js";

/**
 * Narrow read port onto StackRepository (D-07) — just enough for the
 * database tier of the D-15 port-conflict check. Declared here rather than
 * importing the concrete class, so this service stays unit-testable with a
 * plain object, matching every other application service's port convention.
 */
export interface PortConflictStackReader {
    findAll(): Promise<DocktorStackPorts[]>;
}

function stripLeadingSlash(name: string): string {
    return name.startsWith("/") ? name.slice(1) : name;
}

/**
 * Issue #21/D-13/D-14/D-15: computes the D-15 three-tier port-conflict
 * warnings (Docktor stacks via the database -> any running container via
 * dockerode -> best-effort listening sockets via SocketInspector) for one
 * stack's compose file. Never throws: DeployPreflightService wraps this in
 * Promise.allSettled, and the container-listing tier below already degrades
 * to [] on its own rather than failing the whole check — a Docker API
 * outage must never block the deploy this check only ever advises on.
 */
export class PortConflictService {
    constructor(
        private readonly stacks: PortConflictStackReader,
        private readonly fs: Pick<StackFilesystemPort, "readCompose" | "readEnv">,
        private readonly docker: Pick<DockerodeClientPort, "listContainers">,
        private readonly sockets: SocketInspectorPort,
    ) {}

    async check(stackId: string): Promise<PortConflict[]> {
        const compose = await this.readComposeSafely(stackId);
        const env = await this.readEnvSafely(stackId);
        const requested = extractRequestedHostPorts(compose, parseEnvAssignments(env));
        if (requested.length === 0) return [];

        const [stacks, containers, listeners] = await Promise.all([
            this.stacks.findAll(),
            this.listContainersSafely(),
            this.sockets.listListeners(),
        ]);

        return resolvePortConflicts({stackId, requested, stacks, containers, listeners});
    }

    /**
     * A Docker API failure degrades the container tier to [] rather than
     * failing the whole check — the database (Docktor stacks) tier still
     * catches every Docktor-managed conflict regardless of whether dockerode
     * itself is reachable right now.
     */
    private async listContainersSafely(): Promise<RunningContainerPorts[]> {
        try {
            const containers = await this.docker.listContainers(false);
            return containers.map((container) => this.mapContainer(container));
        } catch (err) {
            console.warn(
                "[PortConflictService] listContainers failed, treating the container tier as empty:",
                err instanceof Error ? err.message : err,
            );
            return [];
        }
    }

    private mapContainer(container: Dockerode.ContainerInfo): RunningContainerPorts {
        return {
            containerName: stripLeadingSlash(container.Names?.[0] ?? ""),
            composeProject: container.Labels?.["com.docker.compose.project"] ?? null,
            publishedPorts: (container.Ports ?? [])
                .filter((port): port is typeof port & {PublicPort: number} => typeof port.PublicPort === "number")
                .map((port) => ({
                    port: port.PublicPort,
                    protocol: port.Type === "udp" ? ("udp" as const) : ("tcp" as const),
                })),
        };
    }

    /**
     * A read failure (missing file, permission error) degrades to "" —
     * requesting no ports — rather than propagating, mirroring
     * ComposeReviewService's readComposeSafely/readEnvSafely convention: a
     * check that can't read the stack's own files must never block the
     * deploy it only ever advises on.
     */
    private async readComposeSafely(stackId: string): Promise<string> {
        try {
            return await this.fs.readCompose(stackId);
        } catch (err) {
            console.warn(
                `[PortConflictService] failed to read compose file for stack "${stackId}", skipping port check:`,
                err instanceof Error ? err.message : err,
            );
            return "";
        }
    }

    private async readEnvSafely(stackId: string): Promise<string> {
        try {
            return await this.fs.readEnv(stackId);
        } catch (err) {
            console.warn(
                `[PortConflictService] failed to read env file for stack "${stackId}":`,
                err instanceof Error ? err.message : err,
            );
            return "";
        }
    }
}
