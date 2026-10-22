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
export function runningServices(_containers: readonly ProjectContainer[]): string[] {
    return [];
}

/** The names of the running containers. */
export function stillRunning(_containers: readonly ProjectContainer[]): string[] {
    return [];
}

/** The refusal for a stop that left containers of the old project running (D-04). */
export function stopNotVerifiedMessage(_project: string, _remaining: readonly string[]): string {
    return "";
}
