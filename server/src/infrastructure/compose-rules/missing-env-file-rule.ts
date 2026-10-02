import type {Rule, RuleFinding} from "./rule.js";
import type {ComposeRuleContext} from "../../application/ports/compose-rule-engine-port.js";
import {serviceEntries} from "./compose-document.js";

/**
 * #20/D-10 configurable check: when the stack has a .env file, a service
 * with no `env_file` entry never receives those variables — a common
 * mistake after adding an .env file to an existing stack. Never fires when
 * the stack has no .env file at all (nothing would be missed).
 */
export class MissingEnvFileRule implements Rule {
    readonly id = "missingEnvFile" as const;
    readonly severity = "warning" as const;
    readonly configurable = true;

    check(doc: unknown, context: ComposeRuleContext): RuleFinding[] {
        if (!context.hasEnvFile) return [];

        const findings: RuleFinding[] = [];
        for (const [serviceName, service] of serviceEntries(doc)) {
            if ("env_file" in service) continue;

            findings.push({
                ruleId: this.id,
                severity: this.severity,
                message: `Service "${serviceName}" has no env_file entry, so variables in the stack's .env file are not passed into its container.`,
                serviceName,
                path: ["services", serviceName],
            });
        }

        return findings;
    }
}
