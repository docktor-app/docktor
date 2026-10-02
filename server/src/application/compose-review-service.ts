import {computeUnifiedDiff, type UnifiedDiff} from "../lib/unified-diff.js";
import type {StackFilesystemPort} from "./ports/stack-filesystem-port.js";

/**
 * Narrow read port this service needs from StackRepository — just enough to
 * resolve an id to a stack (and 404 for an unknown one), per CLAUDE.md's
 * "never couple a new service to more of an existing repository's surface
 * than it needs" convention.
 */
export interface ComposeReviewStackReader {
    findByIdOrThrow(id: string): Promise<{id: string; hostPath: string}>;
}

export interface StackChangeInput {
    readonly composeContent?: string;
    readonly envContent?: string;
}

export interface StackChangePreview {
    readonly hasChanges: boolean;
    readonly confirmationRequired: boolean;
    readonly compose: UnifiedDiff | null;
    readonly env: UnifiedDiff | null;
}

/**
 * Issue #18/D-01/D-03: computes a before/after diff of submitted compose
 * and/or env content against what's currently on disk, without writing
 * anything. The sole consumer is POST /api/stacks/:id/preview and
 * StackService.updateStack's pre-write confirmation check (Pitfall 2 — this
 * service never writes, so calling it before a write is always safe).
 */
export class ComposeReviewService {
    constructor(
        private readonly stacks: ComposeReviewStackReader,
        private readonly fs: Pick<StackFilesystemPort, "readCompose" | "readEnv">,
    ) {}

    async previewStackChange(stackId: string, change: StackChangeInput): Promise<StackChangePreview> {
        await this.stacks.findByIdOrThrow(stackId);

        const compose = change.composeContent !== undefined
            ? computeUnifiedDiff(await this.readComposeSafely(stackId), change.composeContent)
            : null;
        const env = change.envContent !== undefined
            ? computeUnifiedDiff(await this.readEnvSafely(stackId), change.envContent)
            : null;

        const hasChanges = (compose?.hunks.length ?? 0) > 0 || (env?.hunks.length ?? 0) > 0;

        // In this plan confirmationRequired is simply hasChanges; 12-05
        // refines it with the D-04 "skip diff confirmation" setting and
        // introduced rule findings.
        return {hasChanges, confirmationRequired: hasChanges, compose, env};
    }

    /**
     * A read failure (missing file, permission error) is treated as "" —
     * diffed against the submitted content as if the file were empty —
     * rather than propagating, since a failed read here must never block
     * the preview/confirm flow from telling the user what they're about to
     * write.
     */
    private async readComposeSafely(stackId: string): Promise<string> {
        try {
            return await this.fs.readCompose(stackId);
        } catch (err) {
            console.warn(
                `[ComposeReviewService] failed to read compose file for stack "${stackId}", diffing against empty content:`,
                err instanceof Error ? err.message : err,
            );
            return "";
        }
    }

    private async readEnvSafely(stackId: string): Promise<string> {
        try {
            return await this.fs.readEnv(stackId);
        } catch (err) {
            console.warn(
                `[ComposeReviewService] failed to read env file for stack "${stackId}", diffing against empty content:`,
                err instanceof Error ? err.message : err,
            );
            return "";
        }
    }
}
