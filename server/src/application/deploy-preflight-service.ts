import type {ComposeFinding} from "./ports/compose-rule-engine-port.js";
import type {PortConflict} from "../domain/port-conflicts.js";
import type {ComposeReviewService} from "./compose-review-service.js";
import type {PortConflictService} from "./port-conflict-service.js";

export interface DeployWarnings {
    readonly checkedAt: string;
    readonly composeFindings: ComposeFinding[];
    readonly portConflicts: PortConflict[];
}

// The never-checked / check-failed sentinel — StackService.runPreflight
// returns this when the preflight itself rejects, so a deploy is never
// blocked waiting on a check that can't complete.
export const EMPTY_DEPLOY_WARNINGS: DeployWarnings = {
    checkedAt: "",
    composeFindings: [],
    portConflicts: [],
};

/**
 * Issue #21/D-09/D-13/D-14: the single pre-deploy check StackService runs
 * before every deploy/restart/update/upgrade (D-14) — re-evaluates
 * compose-check findings against whatever is on disk right now (D-09: this
 * is what catches an externally edited compose file FileWatcher picked up
 * but that never went through the review dialog) and D-15 port conflicts,
 * together, in parallel. Never throws: either dependency rejecting degrades
 * that half of the result to an empty list rather than failing the whole
 * preflight — this check is advisory only, per #21/#20 "warn, never block".
 */
export class DeployPreflightService {
    constructor(
        private readonly review: Pick<ComposeReviewService, "evaluateCurrentStack">,
        private readonly ports: Pick<PortConflictService, "check">,
    ) {}

    async run(stackId: string): Promise<DeployWarnings> {
        const [composeResult, portResult] = await Promise.allSettled([
            this.review.evaluateCurrentStack(stackId),
            this.ports.check(stackId),
        ]);

        if (composeResult.status === "rejected") {
            console.warn(
                `[DeployPreflightService] compose-check evaluation failed for stack "${stackId}":`,
                composeResult.reason,
            );
        }
        if (portResult.status === "rejected") {
            console.warn(
                `[DeployPreflightService] port-conflict check failed for stack "${stackId}":`,
                portResult.reason,
            );
        }

        return {
            checkedAt: new Date().toISOString(),
            composeFindings: composeResult.status === "fulfilled" ? composeResult.value : [],
            portConflicts: portResult.status === "fulfilled" ? portResult.value : [],
        };
    }
}
