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

/** The sorted, unique services of the running containers. */
export function runningServices(containers: readonly ProjectContainer[]): string[] {
    const services = containers
        .filter((container) => container.running)
        .flatMap((container) => (container.service === null ? [] : [container.service]));
    return [...new Set(services)].sort((a, b) => a.localeCompare(b));
}

/** The names of the running containers. */
export function stillRunning(containers: readonly ProjectContainer[]): string[] {
    return containers.filter((container) => container.running).map((container) => container.name);
}

/** The refusal for a stop that left containers of the old project running (D-04). */
export function stopNotVerifiedMessage(project: string, remaining: readonly string[]): string {
    return `Migration refused: after stopping the old stack, these containers of the Docker Compose project "${project}" are still running: ${remaining.join(", ")}. Nothing was created or copied. Stop them by hand, then try again.`;
}
