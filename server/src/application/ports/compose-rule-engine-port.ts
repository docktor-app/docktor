import type {ComposeRuleId} from "@docktor/shared";

/**
 * Port for the compose-check rule engine dependency (D-12). Declared here
 * rather than consumers importing the concrete ComposeRuleEngine class, so
 * application services stay unit-testable with a plain fake and the
 * dependency arrow keeps pointing inward (application depends on a port,
 * not on infrastructure/).
 */

// "danger" (red ToneBadge) is the always-on tier; "warning" (yellow
// ToneBadge) is the configurable tier (D-11). Nothing in this phase blocks —
// every finding is advisory only (#20).
export type ComposeRuleSeverity = "danger" | "warning";

export interface ComposeRuleContext {
    readonly stackDirectory: string;
    readonly hasEnvFile: boolean;
}

export interface ComposeFinding {
    readonly ruleId: ComposeRuleId;
    readonly severity: ComposeRuleSeverity;
    readonly message: string;
    readonly serviceName: string | null;
    readonly path: ReadonlyArray<string | number>;
    // 1-based line of the offending YAML key/item in the evaluated content,
    // or null when the finding's node can't be located (e.g. a value
    // inherited purely through a `<<: *anchor` merge key).
    readonly line: number | null;
}

export interface ComposeEvaluation {
    readonly findings: ComposeFinding[];
    readonly parseError: string | null;
}

export interface ComposeRuleDescriptor {
    readonly id: ComposeRuleId;
    readonly severity: ComposeRuleSeverity;
    readonly configurable: boolean;
}

export interface ComposeRuleEnginePort {
    readonly ruleDescriptors: ReadonlyArray<ComposeRuleDescriptor>;

    evaluate(
        content: string,
        context: ComposeRuleContext,
        enabledConfigurableRuleIds: ReadonlySet<ComposeRuleId>,
    ): ComposeEvaluation;
}
