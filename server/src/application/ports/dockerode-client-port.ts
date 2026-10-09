import type Dockerode from "dockerode";

/**
 * Port for the Docker Engine API dependency (D-07). Declared here rather
 * than consumers importing the concrete DockerodeClient class, so
 * application services and jobs stay unit-testable with a plain fake and
 * the dependency arrow keeps pointing inward (application depends on a
 * port, not on infrastructure/). The lazily-initialising Proxy singleton
 * exported by infrastructure/dockerode-client.ts is unaffected by this
 * port — only the class declaration implements it.
 */
export interface DockerodeClientPort {
    getEventStream(signal?: AbortSignal): Promise<NodeJS.ReadableStream>;

    /** An aborted `signal` cancels the Engine API request; callers that pass none keep the unbounded behaviour. */
    inspectContainer(containerId: string, signal?: AbortSignal): Promise<Dockerode.ContainerInspectInfo>;

    listContainers(all?: boolean): Promise<Dockerode.ContainerInfo[]>;

    getLogStream(containerId: string, tail?: number): Promise<NodeJS.ReadableStream>;

    getLogTail(containerId: string, tail?: number): Promise<string>;

    /**
     * Connects a container to a network under the given endpoint aliases.
     * Used only by the probe transport, which joins a stack's network for the
     * duration of one probe request (amended D-05). Rejects with the daemon's
     * error (HTTP 403 when the container is already connected). An aborted
     * `signal` cancels the Engine API request.
     */
    connectNetwork(
        networkId: string,
        containerId: string,
        aliases: readonly string[],
        signal?: AbortSignal,
    ): Promise<void>;

    /**
     * Disconnects a container from a network; the counterpart of connecting.
     * An aborted `signal` cancels the Engine API request.
     */
    disconnectNetwork(networkId: string, containerId: string, signal?: AbortSignal): Promise<void>;
}
