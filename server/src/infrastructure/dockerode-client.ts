import Dockerode from "dockerode"
import {processDockerLogChunk} from "../lib/docker-log-parser.js"
import type {DockerodeClientPort} from "../application/ports/dockerode-client-port.js"

// Vitest mocks Dockerode as a plain function (vi.fn()), not a class.
// Using a factory wrapper lets tests inject the mock without `new`.
// In production, Dockerode is called with `new` via its normal constructor path.
function createDockerInstance(options?: Dockerode.DockerOptions): Dockerode {
    const Docker = Dockerode as unknown as (opts?: Dockerode.DockerOptions) => Dockerode
    return Docker(options) // Auto-detects socket path based on platform
}

/**
 * Socket timeout of request/response Docker calls. Three times the probe
 * path's own 10 s bound and far above a healthy answer. It bounds calls that
 * used to stay pending for as long as dockerd was frozen (StatePoller
 * reconcile and catch-up, routes).
 */
export const DOCKER_REQUEST_TIMEOUT_MS = 30_000

export class DockerodeClient implements DockerodeClientPort {
    // Request/response calls: bounded by a socket timeout (UAT G-14-1b).
    private readonly docker: Dockerode
    // The event and follow-logs streams. docker-modem's `timeout` is an
    // idle-socket timeout that destroys the request, and these sockets are
    // idle between events, so a timeout must never apply to them.
    private readonly streamDocker: Dockerode

    constructor() {
        this.docker = createDockerInstance({timeout: DOCKER_REQUEST_TIMEOUT_MS})
        this.streamDocker = createDockerInstance()
    }

    async getEventStream(signal?: AbortSignal): Promise<NodeJS.ReadableStream> {
        return (this.streamDocker as any).getEvents({
            filters: {
                type: ["container"],
                event: ["start", "stop", "die", "kill", "health_status"],
            },
            abortSignal: signal,
        })
    }

    async inspectContainer(containerId: string, signal?: AbortSignal): Promise<Dockerode.ContainerInspectInfo> {
        // Without a signal inspect() receives exactly the options it always did.
        return this.docker.getContainer(containerId).inspect(signal ? {abortSignal: signal} : undefined)
    }

    async listContainers(all = true): Promise<Dockerode.ContainerInfo[]> {
        return this.docker.listContainers({all})
    }

    async connectNetwork(
        networkId: string,
        containerId: string,
        aliases: readonly string[],
        signal?: AbortSignal,
    ): Promise<void> {
        // @types/dockerode omits abortSignal here, but dockerode's Network.connect forwards it
        // (lib/network.js) and docker-modem strips it before building the request body.
        const options: Dockerode.NetworkConnectOptions & {abortSignal?: AbortSignal} = {
            Container: containerId,
            EndpointConfig: {Aliases: [...aliases]},
            ...(signal && {abortSignal: signal}),
        }
        await this.docker.getNetwork(networkId).connect(options)
    }

    async disconnectNetwork(networkId: string, containerId: string, signal?: AbortSignal): Promise<void> {
        await this.docker.getNetwork(networkId).disconnect({
            Container: containerId,
            Force: false,
            ...(signal && {abortSignal: signal}),
        })
    }

    async getLogStream(containerId: string, tail = 100): Promise<NodeJS.ReadableStream> {
        return this.streamDocker.getContainer(containerId).logs({
            stdout: true,
            stderr: true,
            follow: true,
            tail,
            timestamps: true,
        }) as unknown as NodeJS.ReadableStream
    }

    /**
     * Resolves the last `tail` lines of a container's combined stdout/stderr
     * as a single string. Unlike getLogStream, `follow` is false — dockerode
     * resolves a terminated Buffer rather than a never-ending stream, which
     * is what a one-shot reconcile pass needs. Resolves "" (rather than
     * throwing) when the container does not exist, so a poller degrades to
     * "cannot distinguish failed from pending" instead of crashing.
     */
    async getLogTail(containerId: string, tail = 200): Promise<string> {
        let buffer: Buffer
        try {
            buffer = (await this.docker.getContainer(containerId).logs({
                stdout: true,
                stderr: true,
                follow: false,
                tail,
                timestamps: true,
            })) as unknown as Buffer
        } catch (err: any) {
            if (err?.statusCode === 404) return ""
            throw err
        }

        const lines: string[] = []
        processDockerLogChunk(buffer, containerId, (event) => {
            lines.push(event.line)
        })
        return lines.join("\n")
    }
}

let _dockerodeClient: DockerodeClient | undefined

export function getDockerodeClient(): DockerodeClient {
    if (!_dockerodeClient) {
        _dockerodeClient = new DockerodeClient()
    }
    return _dockerodeClient
}

export const dockerodeClient = new Proxy({} as DockerodeClient, {
    get(_target, prop, receiver) {
        return Reflect.get(getDockerodeClient(), prop, receiver)
    },
})
