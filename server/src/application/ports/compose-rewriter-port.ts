import type {RewriteResult, VolumeSelection} from "../../infrastructure/compose-rewriter.js";

/**
 * Port for the brownfield-migration compose-rewriting dependency (D-07).
 * Declared here rather than consumers importing the concrete
 * ComposeRewriter class, so application services stay unit-testable with a
 * plain fake and the dependency arrow keeps pointing inward (application
 * depends on a port, not on infrastructure/). `VolumeSelection` keeps its
 * declaration site in infrastructure/compose-rewriter.ts and is imported
 * here, not restated — `application/migration-service.ts` already imports
 * it from there.
 */
export interface ComposeRewriterPort {
    rewrite(
        originalCompose: string,
        volumeSelections: VolumeSelection[],
        namedVolumeSelections: Map<string, boolean>,
        /**
         * The old stack's `.env` text. Extracted names never collide with it or with anything
         * else that would change how a variable resolves.
         */
        existingEnv?: string,
    ): RewriteResult;
}

export type {RewriteResult, VolumeSelection};
