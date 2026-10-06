import {isMap, isScalar, isSeq, LineCounter, parseDocument} from "yaml";
import type {Document} from "yaml";
import type {ComposeRuleId} from "@docktor/shared";
import type {
    ComposeEvaluation,
    ComposeFinding,
    ComposeRuleContext,
    ComposeRuleDescriptor,
    ComposeRuleEnginePort,
} from "../application/ports/compose-rule-engine-port.js";
import type {Rule} from "./compose-rules/rule.js";
import {BUILT_IN_COMPOSE_RULES} from "./compose-rules/registry.js";

// Bounds YAML alias-bomb expansion (T-12-07, DoS via exponential anchor
// nesting) — generous enough for any legitimate compose file's `<<: *base`
// usage, far below what an adversarial anchor chain needs to matter.
const MAX_ALIAS_COUNT = 100;

interface RangedNode {
    readonly range?: readonly number[] | null;
}

/**
 * D-12: evaluates a compose YAML document against the registered rules and
 * attaches each finding's 1-based source line (D-03) so the review dialog
 * can anchor it next to the diff line. Parses with YAML merge-key support
 * enabled so `<<` anchors/merge keys are resolved before rules run
 * (T-12-06) — a value
 * inherited purely through a merge key is still flagged by the rules (which
 * see the resolved plain-JS document), but its finding carries `line: null`
 * since no literal YAML pair exists at that path to point at.
 */
export class ComposeRuleEngine implements ComposeRuleEnginePort {
    constructor(private readonly rules: readonly Rule[] = BUILT_IN_COMPOSE_RULES) {}

    get ruleDescriptors(): ReadonlyArray<ComposeRuleDescriptor> {
        return this.rules.map((rule) => ({
            id: rule.id,
            severity: rule.severity,
            configurable: rule.configurable,
        }));
    }

    evaluate(
        content: string,
        context: ComposeRuleContext,
        enabledConfigurableRuleIds: ReadonlySet<ComposeRuleId>,
    ): ComposeEvaluation {
        const lineCounter = new LineCounter();
        const document = parseDocument(content, {lineCounter, merge: true});

        if (document.errors.length > 0) {
            return {findings: [], parseError: document.errors[0].message};
        }

        let parsed: unknown;
        try {
            parsed = document.toJS({maxAliasCount: MAX_ALIAS_COUNT});
        } catch (err) {
            return {
                findings: [],
                parseError: err instanceof Error ? err.message : String(err),
            };
        }

        const findings: ComposeFinding[] = this.rules
            .filter((rule) => !rule.configurable || enabledConfigurableRuleIds.has(rule.id))
            .flatMap((rule) =>
                rule.check(parsed, context).map(
                    (finding): ComposeFinding => ({
                        ...finding,
                        line: this.locateLine(document, lineCounter, finding.path),
                    }),
                ),
            );

        return {findings, parseError: null};
    }

    /**
     * Walks the Document's map/seq nodes along `path` (for a map step, the
     * Pair whose scalar key equals the segment; for a seq step, the item at
     * that index) and returns the 1-based line of the final segment's own
     * node, or `null` if any step along the way is missing.
     */
    private locateLine(
        document: Document,
        lineCounter: LineCounter,
        path: ReadonlyArray<string | number>,
    ): number | null {
        let node: unknown = document.contents;
        let located: RangedNode | null = null;

        for (let i = 0; i < path.length; i++) {
            const segment = path[i];
            const isLast = i === path.length - 1;

            if (typeof segment === "string") {
                if (!isMap(node)) return null;
                const pair = node.items.find(
                    (item) => isScalar(item.key) && item.key.value === segment,
                );
                if (!pair) return null;
                if (isLast) {
                    located = pair.key as RangedNode;
                    break;
                }
                node = pair.value;
            } else {
                if (!isSeq(node)) return null;
                const item: unknown = node.items[segment];
                if (item === undefined) return null;
                if (isLast) {
                    located = item as RangedNode;
                    break;
                }
                node = item;
            }
        }

        if (!located?.range) return null;
        return lineCounter.linePos(located.range[0]).line;
    }
}

export const composeRuleEngine = new ComposeRuleEngine();
