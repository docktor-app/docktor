/** One mount of a container, as Docker records it (`Mounts` of the container list). */
export interface ProjectContainerMount {
    readonly type: string;
    readonly name?: string;
    readonly source: string;
    readonly destination: string;
}

/** One container of an external compose project. */
export interface ProjectContainer {
    readonly id: string;
    readonly name: string;
    /** The compose service the container runs, or null when the label is missing. */
    readonly service: string | null;
    readonly running: boolean;
    /**
     * The container is restarting or paused: not `running`, yet a process that
     * can still write to its volumes. Absent means false.
     */
    readonly restartingOrPaused?: boolean;
    readonly mounts: readonly ProjectContainerMount[];
}

/**
 * The compose project Docker actually runs for a compose file. `containers`
 * means a container of this file carries the name; `files` means no container
 * exists and the name is predicted from the compose file, its `.env` and the
 * directory name.
 */
export interface ResolvedComposeProject {
    readonly name: string;
    readonly source: "containers" | "files";
    readonly containers: readonly ProjectContainer[];
}

export type ComposeProjectResolution =
    | {readonly kind: "resolved"; readonly project: ResolvedComposeProject}
    | {readonly kind: "unresolved"; readonly reason: string};

/** A compose project addressed by its compose file and the project name Docker runs it under (`-p`). */
export interface ComposeProjectTarget {
    readonly composePath: string;
    readonly project: string;
}

/**
 * True while the container can still write to its volumes: running, restarting
 * (a crash loop) or paused. Only an exited, created or dead container is down,
 * so only those may count as stopped (WR-02).
 */
export function isActive(container: ProjectContainer): boolean {
    return container.running || container.restartingOrPaused === true;
}

/** The sorted, unique services of the active containers: what a rollback starts again. */
export function runningServices(containers: readonly ProjectContainer[]): string[] {
    const services = containers
        .filter(isActive)
        .flatMap((container) => (container.service === null ? [] : [container.service]));
    return [...new Set(services)].sort((a, b) => a.localeCompare(b));
}

/** The names of the active containers (running, restarting or paused). */
export function stillRunning(containers: readonly ProjectContainer[]): string[] {
    return containers.filter(isActive).map((container) => container.name);
}

/**
 * The names of the active containers that carry no compose service label. A
 * rollback starts services by name, so such a container could not be started
 * again after the stop (WR-05).
 */
export function activeWithoutService(containers: readonly ProjectContainer[]): string[] {
    return containers.filter((container) => isActive(container) && container.service === null).map((container) => container.name);
}

/** The refusal for a stop that left containers of the old project running (D-04). */
export function stopNotVerifiedMessage(project: string, remaining: readonly string[]): string {
    return `Migration refused: after stopping the old stack, these containers of the Docker Compose project "${project}" are still running: ${remaining.join(", ")}. Nothing was created or copied. Stop them by hand, then try again.`;
}

const MIN_STOP_TIMEOUT_MS = 120_000;
const MAX_STOP_TIMEOUT_MS = 900_000;
const STOP_TIMEOUT_PER_CONTAINER_MS = 30_000;

/**
 * How long `docker compose stop` may take for this many containers: compose
 * waits up to its own grace period per container, so a flat limit fails big
 * projects. 30 s per container, never below 2 minutes, never above 15.
 */
export function composeStopTimeoutMs(containerCount: number): number {
    return Math.min(MAX_STOP_TIMEOUT_MS, Math.max(MIN_STOP_TIMEOUT_MS, STOP_TIMEOUT_PER_CONTAINER_MS * containerCount));
}
