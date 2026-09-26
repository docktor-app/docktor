import type {ContainerStatus} from "../../infrastructure/docker-executor.js";

/**
 * Port for the `docker compose` / `docker` CLI invocation dependency
 * (D-07). Declared here rather than consumers importing the concrete
 * DockerExecutor class, so application services stay unit-testable with a
 * plain fake and the dependency arrow keeps pointing inward (application
 * depends on a port, not on infrastructure/).
 */
export interface DockerExecutorPort {
    up(stackId: string): Promise<void>;

    stop(stackId: string): Promise<void>;

    restart(stackId: string): Promise<void>;

    down(stackId: string): Promise<void>;

    ps(stackId: string): Promise<ContainerStatus[]>;

    composePull(stackId: string): Promise<string>;

    pull(imageRef: string): Promise<void>;

    manifestInspect(imageRef: string): Promise<{
        digest: string | null
        latestTag: string | null
    } | null>;

    imageDigest(imageRef: string): Promise<string | null>;
}

export type {ContainerStatus};
