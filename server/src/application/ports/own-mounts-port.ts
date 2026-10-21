import type {OwnMountsView} from "../../domain/bind-mount-sources.js";

/**
 * Port for what Docktor can see of the host through its own bind mounts
 * (CR-03). Declared here rather than consumers importing the concrete Docker
 * adapter, so application services stay unit-testable with a plain fake and
 * the dependency arrow keeps pointing inward.
 *
 * Resolves `host` when Docktor is not in a container, `container` with its
 * mounts, and `unknown` when it is containerized but the lookup failed.
 * Implementations never reject.
 */
export interface OwnMountsPort {
    ownMounts(): Promise<OwnMountsView>;
}

export type {OwnMountsView};
