import type {Rule, RuleFinding} from "./rule.js";
import type {ComposeRuleContext} from "../../application/ports/compose-rule-engine-port.js";
import {composeAnalyzer} from "../compose-analyzer.js";
import {serviceEntries} from "./compose-document.js";

// Array.prototype.findLastIndex is ES2023; this project targets ES2022, so a
// manual reverse scan keeps the same "last match" semantics without widening lib.
function lastIndexMatching<T>(items: T[], predicate: (item: T) => boolean): number {
    for (let i = items.length - 1; i >= 0; i--) {
        if (predicate(items[i] as T)) return i;
    }
    return -1;
}

/**
 * #20/D-10 configurable check: a hardcoded literal environment value (object
 * form `KEY: literal` or list form `KEY=literal`) belongs in the stack's
 * .env file instead. A value that's itself a variable reference
 * (`${VAR}`/`$VAR`) is a pass-through, not a literal, and is never flagged —
 * ComposeAnalyzer.extractInlineEnvVars() already excludes those.
 */
export class InlineEnvRule implements Rule {
    readonly id = "inlineEnv" as const;
    readonly severity = "warning" as const;
    readonly configurable = true;

    check(doc: unknown, _context: ComposeRuleContext): RuleFinding[] {
        const findings: RuleFinding[] = [];
        const serviceDefinitions = new Map(serviceEntries(doc));

        for (const {serviceName, vars} of composeAnalyzer.extractInlineEnvVars(doc)) {
            const environment = serviceDefinitions.get(serviceName)?.environment;
            const isListForm = Array.isArray(environment);

            for (const key of Object.keys(vars)) {
                // extractInlineEnvVars records the LAST occurrence of a duplicate key (object
                // assignment semantics), so the line lookup must match the last entry too —
                // not the first, which findIndex would return for a malformed compose file
                // with the same key listed twice.
                const path: Array<string | number> = isListForm
                    ? [
                          "services",
                          serviceName,
                          "environment",
                          lastIndexMatching(
                              environment as unknown[],
                              (entry) => typeof entry === "string" && entry.startsWith(`${key}=`),
                          ),
                      ]
                    : ["services", serviceName, "environment", key];

                findings.push({
                    ruleId: this.id,
                    severity: this.severity,
                    message: `Service "${serviceName}" sets ${key} inline — move it to the stack's .env file.`,
                    serviceName,
                    path,
                });
            }
        }

        return findings;
    }
}
