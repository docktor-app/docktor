import type {Rule, RuleFinding} from "./rule.js";
import {serviceEntries} from "./compose-document.js";
import type {ComposeRuleContext} from "../../application/ports/compose-rule-engine-port.js";

/**
 * #20/D-11 always-on check: `privileged: true` grants a container full
 * access to the host. YAML allows the value to come through as either the
 * boolean `true` or the string `"true"` depending on how it was authored —
 * both are flagged; `false`/absent are not.
 */
export class PrivilegedRule implements Rule {
    readonly id = "privileged" as const;
    readonly severity = "danger" as const;
    readonly configurable = false;

    check(doc: unknown, _context: ComposeRuleContext): RuleFinding[] {
        const findings: RuleFinding[] = [];

        for (const [serviceName, service] of serviceEntries(doc)) {
            const privileged = service.privileged;
            if (privileged === true || privileged === "true") {
                findings.push({
                    ruleId: this.id,
                    severity: this.severity,
                    message: `Service "${serviceName}" runs with privileged: true, granting it full access to the host.`,
                    serviceName,
                    path: ["services", serviceName, "privileged"],
                });
            }
        }

        return findings;
    }
}
