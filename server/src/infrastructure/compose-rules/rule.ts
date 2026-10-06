import type {
    ComposeFinding,
    ComposeRuleContext,
    ComposeRuleSeverity,
} from "../../application/ports/compose-rule-engine-port.js";
import type {ComposeRuleId} from "@docktor/shared";

// A rule's own check() never knows its finding's line number — that's
// located centrally by ComposeRuleEngine after every rule has run (a single
// Document walk per evaluation, not one per rule).
export type RuleFinding = Omit<ComposeFinding, "line">;

/**
 * D-12: the Strategy-pattern interface every built-in compose check
 * implements. Each rule is its own class, registered by exactly one line in
 * registry.ts's BUILT_IN_COMPOSE_RULES — adding a new built-in rule is a
 * one-file change plus one registration line. No rule ever loads code from
 * outside this directory (no plugin/dynamic-loading mechanism — PROJECT.md
 * "Plugin system" stays out of scope).
 */
export interface Rule {
    readonly id: ComposeRuleId;
    readonly severity: ComposeRuleSeverity;
    // D-10 / assumption-delta Signal 2: declared explicitly on every rule —
    // the three always-on rules set this to false. The engine applies one
    // filter (`!rule.configurable || enabled.has(rule.id)`) to every rule,
    // never a special-cased subset.
    readonly configurable: boolean;

    check(doc: unknown, context: ComposeRuleContext): RuleFinding[];
}
