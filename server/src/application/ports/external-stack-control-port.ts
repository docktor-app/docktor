/**
 * Port for controlling a compose project Docktor does not manage, addressed
 * by its compose file path (D-10). Declared here rather than consumers
 * importing the concrete adapter, so application services stay unit-testable
 * with a plain fake and the dependency arrow keeps pointing inward.
 */
export interface ExternalStackControlPort {
    /**
     * Stops the project's containers. Containers are stopped, never removed
     * (D-10), so the old stack can be started again exactly as it was.
     */
    stop(composePath: string): Promise<void>;

    /**
     * Starts the project's existing containers. It never recreates them
     * (RESEARCH Pitfall 2), which makes it the only safe rollback action.
     */
    start(composePath: string): Promise<void>;
}
