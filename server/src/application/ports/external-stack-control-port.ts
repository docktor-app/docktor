import type {ComposeProjectTarget} from "../../domain/compose-project.js";

/**
 * Port for controlling a compose project Docktor does not manage (D-10).
 * Declared here rather than consumers importing the concrete adapter, so
 * application services stay unit-testable with a plain fake and the dependency
 * arrow keeps pointing inward.
 *
 * `stop` and `start` never recreate a container; `restoreServices` is the one
 * command that does, and only for the rollback of a project whose containers
 * were removed. Every command addresses the project Docker actually runs (`-p <project>`
 * of the resolved {@link ComposeProjectTarget}), never a name derived from the
 * directory: a stack started with `-p` or from another directory keeps its name.
 */
export interface ExternalStackControlPort {
    /**
     * Stops the project's containers within `timeoutMs`. Containers are
     * stopped, never removed (D-10), so the old stack can be started again
     * exactly as it was.
     */
    stop(target: ComposeProjectTarget, options: {readonly timeoutMs: number}): Promise<void>;

    /**
     * Starts the existing containers of the given services, and nothing when
     * there are none. It never recreates containers (RESEARCH Pitfall 2),
     * which makes it the safe rollback action while the old containers exist.
     */
    start(target: ComposeProjectTarget, services: readonly string[]): Promise<void>;

    /**
     * Recreates exactly the given services from the compose file at
     * `target.composePath`, and nothing when there are none. Only for a project
     * whose containers the rollback's keep-volumes down removed (the new stack
     * shared the old stack's compose project): it brings the original services
     * back from the restored original files. It never builds, never removes
     * orphans, volumes or images, and never touches a service not listed.
     */
    restoreServices(target: ComposeProjectTarget, services: readonly string[]): Promise<void>;
}
