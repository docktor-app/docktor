import {computeUnifiedDiff, type UnifiedDiff} from "../lib/unified-diff.js";
import {BadRequestError} from "../lib/errors.js";
import {slugify} from "../lib/slugify.js";
import type {StackFilesystemPort} from "./ports/stack-filesystem-port.js";
import type {ComposeFinding, ComposeRuleEnginePort} from "./ports/compose-rule-engine-port.js";
import {CONFIGURABLE_COMPOSE_RULE_IDS, type ComposeCheckSettings, type ComposeRuleId} from "@docktor/shared";

/**
 * Narrow read port this service needs from StackRepository — just enough to
 * resolve an id to a stack (and 404 for an unknown one), per CLAUDE.md's
 * "never couple a new service to more of an existing repository's surface
 * than it needs" convention.
 */
export interface ComposeReviewStackReader {
    findByIdOrThrow(id: string): Promise<{id: string; hostPath: string}>;
}

/**
 * Narrow port onto SettingsService (D-04/D-10). Declared here rather than
 * importing the concrete class, for the same reason as
 * ComposeReviewStackReader above.
 */
export interface ComposeReviewSettingsReader {
    getComposeCheckSettings(): Promise<ComposeCheckSettings>;
}

export interface StackChangeInput {
    readonly composeContent?: string;
    readonly envContent?: string;
}

// Issue #20/D-03: a compose-check finding attached to one review, plus
// whether it's newly introduced by this edit (absent from the pre-edit
// evaluation) — see the D-04 reconciliation note on confirmationRequired
// below for why this distinction matters.
export interface ReviewFinding extends ComposeFinding {
    readonly introduced: boolean;
}

export interface StackChangePreview {
    readonly hasChanges: boolean;
    readonly confirmationRequired: boolean;
    readonly compose: UnifiedDiff | null;
    readonly env: UnifiedDiff | null;
    readonly findings: ReviewFinding[];
    readonly composeParseError: string | null;
}

// Issue #20/D-02: the create-flow analog of StackChangePreview — no diff
// (nothing on disk to diff against yet), every finding is "introduced" by
// definition, and the skip-review setting never applies (there is no diff
// step to skip).
export interface NewStackPreview {
    readonly confirmationRequired: boolean;
    readonly findings: ReviewFinding[];
    readonly composeParseError: string | null;
}

export interface NewStackPreviewInput {
    readonly displayName: string;
    readonly composeContent: string;
    readonly envContent?: string;
}

/**
 * Issue #18/D-01/D-03 + Issue #20/D-02/D-03/D-04/D-09/D-10: computes a
 * before/after diff of submitted compose and/or env content against what's
 * currently on disk, runs the compose-check rule engine over both states,
 * and decides whether confirmation is required — without writing anything.
 * Consumers: POST /api/stacks/:id/preview, POST /api/stacks/preview,
 * StackService.updateStack/createStack's pre-write confirmation checks (this
 * service never writes, so calling it before a write is always safe), and
 * plan 12-08's deploy-time re-check (evaluateCurrentStack).
 */
export class ComposeReviewService {
    constructor(
        private readonly stacks: ComposeReviewStackReader,
        private readonly fs: Pick<StackFilesystemPort, "readCompose" | "readEnv" | "getStackDirectory">,
        private readonly engine: ComposeRuleEnginePort,
        private readonly settings: ComposeReviewSettingsReader,
    ) {}

    async previewStackChange(stackId: string, change: StackChangeInput): Promise<StackChangePreview> {
        const stack = await this.stacks.findByIdOrThrow(stackId);

        const beforeCompose = await this.readComposeSafely(stackId);
        const beforeEnv = await this.readEnvSafely(stackId);
        const afterCompose = change.composeContent ?? beforeCompose;
        const afterEnv = change.envContent ?? beforeEnv;

        const compose = change.composeContent !== undefined
            ? computeUnifiedDiff(beforeCompose, change.composeContent)
            : null;
        const env = change.envContent !== undefined
            ? computeUnifiedDiff(beforeEnv, change.envContent)
            : null;

        const hasChanges = (compose?.hunks.length ?? 0) > 0 || (env?.hunks.length ?? 0) > 0;

        const settings = await this.settings.getComposeCheckSettings();
        const enabled = this.enabledRuleIds(settings);
        // Context must be evaluated separately for before/after: hasEnvFile can flip (e.g. a
        // stack's first .env file is added), and reusing one context for both evaluations made
        // MissingEnvFileRule fire identically on both sides, masking a newly-introduced finding
        // as pre-existing (introduced: false) — defeating the skip-review guarantee below.
        const beforeContext = {stackDirectory: stack.hostPath, hasEnvFile: beforeEnv.trim() !== ""};
        const afterContext = {stackDirectory: stack.hostPath, hasEnvFile: afterEnv.trim() !== ""};

        const beforeEvaluation = this.engine.evaluate(beforeCompose, beforeContext, enabled);
        const afterEvaluation = this.engine.evaluate(afterCompose, afterContext, enabled);
        const findings = this.markIntroduced(afterEvaluation.findings, beforeEvaluation.findings);

        // Issue #20/D-04 x #18's "skip diff confirmation" reconciliation
        // (flagged in 12-05's planning notes): D-04 says the diff preview
        // can be skipped entirely via Settings, but #20 AC1/ROADMAP SC3
        // require a confirmation dialog before a dangerous configuration is
        // applied. The skip toggle only ever suppresses confirmation for an
        // edit that introduces NO finding — a finding newly introduced by
        // this specific edit still requires confirmation even with skip on.
        // A stack that already had e.g. privileged: true is not re-prompted
        // on every unrelated edit once skip is on, since that finding
        // already existed before this edit (introduced: false).
        const confirmationRequired = hasChanges && (!settings.skipReview || findings.some((f) => f.introduced));

        return {
            hasChanges,
            confirmationRequired,
            compose,
            env,
            findings,
            composeParseError: afterEvaluation.parseError,
        };
    }

    /**
     * Issue #20/D-02: the create-flow preview — every finding is introduced
     * by definition (there is no "before" state for a stack that doesn't
     * exist yet), and confirmation is required purely by finding presence;
     * the skip-review setting never applies here (D-02: creating a stack
     * never shows a diff step, so there is no diff step to skip).
     */
    async previewNewStack(input: NewStackPreviewInput): Promise<NewStackPreview> {
        const slug = slugify(input.displayName);
        if (!slug) {
            throw new BadRequestError("Display name produces an empty slug");
        }

        const settings = await this.settings.getComposeCheckSettings();
        const enabled = this.enabledRuleIds(settings);
        const envContent = input.envContent ?? "";
        const context = {
            stackDirectory: this.fs.getStackDirectory(slug),
            hasEnvFile: envContent.trim() !== "",
        };

        const evaluation = this.engine.evaluate(input.composeContent, context, enabled);
        const findings: ReviewFinding[] = evaluation.findings.map((finding) => ({...finding, introduced: true}));

        return {
            confirmationRequired: findings.length > 0,
            findings,
            composeParseError: evaluation.parseError,
        };
    }

    /**
     * Plan 12-08's D-09 deploy-time re-check entry point: evaluates the
     * current on-disk compose/env content against the current Compose
     * Checks settings, with no "introduced" distinction (there is no edit
     * to compare against — this just reports what's there right now). A
     * compose parse error yields an empty finding list rather than
     * throwing, matching ComposeRuleEngine.evaluate's own contract.
     */
    async evaluateCurrentStack(stackId: string): Promise<ComposeFinding[]> {
        const stack = await this.stacks.findByIdOrThrow(stackId);
        const compose = await this.readComposeSafely(stackId);
        const env = await this.readEnvSafely(stackId);

        const settings = await this.settings.getComposeCheckSettings();
        const enabled = this.enabledRuleIds(settings);
        const context = {stackDirectory: stack.hostPath, hasEnvFile: env.trim() !== ""};

        return this.engine.evaluate(compose, context, enabled).findings;
    }

    private enabledRuleIds(settings: ComposeCheckSettings): ReadonlySet<ComposeRuleId> {
        return new Set(CONFIGURABLE_COMPOSE_RULE_IDS.filter((id) => settings.checks[id]));
    }

    /**
     * A finding is "introduced" when its identity (ruleId + serviceName +
     * message) is absent from the pre-edit evaluation's findings — see the
     * D-04 reconciliation note on previewStackChange above.
     */
    private markIntroduced(
        afterFindings: readonly ComposeFinding[],
        beforeFindings: readonly ComposeFinding[],
    ): ReviewFinding[] {
        const beforeKeys = new Set(beforeFindings.map((finding) => this.findingKey(finding)));
        return afterFindings.map((finding) => ({
            ...finding,
            introduced: !beforeKeys.has(this.findingKey(finding)),
        }));
    }

    private findingKey(finding: ComposeFinding): string {
        return `${finding.ruleId}::${finding.serviceName ?? ""}::${finding.message}`;
    }

    /**
     * A read failure (missing file, permission error) is treated as "" —
     * diffed/evaluated against the submitted content as if the file were
     * empty — rather than propagating, since a failed read here must never
     * block the preview/confirm flow from telling the user what they're
     * about to write.
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
