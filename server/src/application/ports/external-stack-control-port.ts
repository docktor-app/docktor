import type {ComposeProjectTarget} from "../../domain/compose-project.js";

/**
 * Port for controlling a compose project Docktor does not manage (D-10).
 * Declared here rather than consumers importing the concrete adapter, so
 * application services stay unit-testable with a plain fake and the dependency
 * arrow keeps pointing inward.
 *
 * Every command addresses the project Docker actually runs (`-p <project>`
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
     * which makes it the only safe rollback action.
     */
    start(target: ComposeProjectTarget, services: readonly string[]): Promise<void>;
}
