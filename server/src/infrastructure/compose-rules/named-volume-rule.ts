import type {Rule, RuleFinding} from "./rule.js";
import type {ComposeRuleContext} from "../../application/ports/compose-rule-engine-port.js";
import {composeAnalyzer} from "../compose-analyzer.js";

/**
 * #20/D-10 configurable check: Docktor's convention is bind mounts under
 * `./volumes/` (PROJECT.md "Bind mounts only"), so a named Docker volume is
 * flagged as a style deviation — warn-only, never blocking.
 */
export class NamedVolumeRule implements Rule {
    readonly id = "namedVolume" as const;
    readonly severity = "warning" as const;
    readonly configurable = true;

    check(doc: unknown, _context: ComposeRuleContext): RuleFinding[] {
        return composeAnalyzer.extractNamedVolumes(doc).map(
            (name): RuleFinding => ({
                ruleId: this.id,
                severity: this.severity,
                message: `Named volume "${name}" is declared — Docktor's convention is bind mounts under ./volumes/.`,
                serviceName: null,
                path: ["volumes", name],
            }),
        );
    }
}
