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

    inspectContainer(containerId: string): Promise<Dockerode.ContainerInspectInfo>;

    listContainers(all?: boolean): Promise<Dockerode.ContainerInfo[]>;

    getLogStream(containerId: string, tail?: number): Promise<NodeJS.ReadableStream>;

    getLogTail(containerId: string, tail?: number): Promise<string>;
}
