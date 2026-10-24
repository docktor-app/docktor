import type {
    ComposeProjectResolution,
    ProjectContainer,
    ProjectContainerMount,
    ResolvedComposeProject,
} from "../../domain/compose-project.js";

/**
 * Port for finding out which compose project Docker really runs for an
 * external stack's compose file, and which containers belong to it (#102).
 * Declared here so application services stay unit-testable with a plain fake
 * and the dependency arrow keeps pointing inward.
 */
export interface ComposeProjectResolverPort {
    /**
     * The project that runs `composePath`, decided from the labels of the
     * containers of that file (a stack started with `-p`, `COMPOSE_PROJECT_NAME`
     * or from another directory keeps its real name). Without any container
     * the name is predicted from the files. Never rejects: whatever prevents a
     * confident answer is returned as `unresolved` with the reason.
     */
    resolve(composePath: string): Promise<ComposeProjectResolution>;

    /**
     * The containers of `project` that belong to the directory of `composePath`,
     * running or not, as Docker reports them now. Rejects when Docker cannot be
     * queried.
     */
    listContainers(project: string, composePath: string): Promise<readonly ProjectContainer[]>;
}

export type {ComposeProjectResolution, ProjectContainer, ProjectContainerMount, ResolvedComposeProject};
