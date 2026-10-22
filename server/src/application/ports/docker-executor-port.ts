import type {ContainerStatus} from "../../infrastructure/docker-executor.js";

/**
 * Port for the `docker compose` / `docker` CLI invocation dependency
 * (D-07). Declared here rather than consumers importing the concrete
 * DockerExecutor class, so application services stay unit-testable with a
 * plain fake and the dependency arrow keeps pointing inward (application
 * depends on a port, not on infrastructure/).
 */
export interface DockerExecutorPort {
    /**
     * Brings the stack up. Orphan containers (containers of the project no
     * longer in the compose file) are removed unless `removeOrphans` is false.
     */
    up(stackId: string, options?: {readonly removeOrphans?: boolean}): Promise<void>;

    stop(stackId: string): Promise<void>;

    restart(stackId: string): Promise<void>;

    /** Removes the stack's containers and volumes (`down -v`). A migration rollback must never call it. */
    down(stackId: string): Promise<void>;

    /**
     * Removes the project's containers and networks, never its volumes or images.
     * The only down a migration rollback may use.
     */
    downKeepVolumes(stackId: string): Promise<void>;

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
