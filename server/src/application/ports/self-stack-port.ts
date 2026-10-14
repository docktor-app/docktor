/**
 * Port for identifying Docktor's own compose stack (STK-03, D-01). Declared
 * here rather than consumers importing the concrete Docker adapter, so
 * application services stay unit-testable with a plain fake and the
 * dependency arrow keeps pointing inward.
 *
 * Returns the container-visible path(s) of the compose file(s) Docktor's own
 * container was started from. An empty list means "unknown" (not
 * containerized, label missing, lookup failed) and the caller must list every
 * stack (D-02). Implementations never reject.
 */
export interface SelfStackPort {
    composeFilePaths(): Promise<readonly string[]>;
}
