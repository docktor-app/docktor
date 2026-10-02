import type {Rule, RuleFinding} from "./rule.js";
import type {ComposeRuleContext} from "../../application/ports/compose-rule-engine-port.js";
import {composeAnalyzer} from "../compose-analyzer.js";
import {isWithinDirectory, resolveHostPath} from "./compose-document.js";
import {DOCKER_SOCKET_PATHS} from "./docker-socket-rule.js";

/**
 * #20/D-11 always-on check: a host bind mount outside the stack's own
 * directory can read/write arbitrary filesystem locations the stack has no
 * business touching. Docker-socket mounts are excluded here (DockerSocketRule
 * already reports those) so a single mount never produces two findings.
 * Containment is lexical, segment-boundary-aware (probe #20 adjacency —
 * compose-document.ts's isWithinDirectory never does string-prefix
 * matching); `${VAR}`-only host paths are a documented limitation — they
 * never appear here at all, since ComposeAnalyzer.extractBindMounts() only
 * recognises entries whose host part starts with `.`, `/` or `~`.
 */
export class BindOutsideStackRule implements Rule {
    readonly id = "bindOutsideStack" as const;
    readonly severity = "danger" as const;
    readonly configurable = false;

    check(doc: unknown, context: ComposeRuleContext): RuleFinding[] {
        const findings: RuleFinding[] = [];

        for (const mount of composeAnalyzer.extractBindMounts(doc)) {
            if (DOCKER_SOCKET_PATHS.has(mount.path)) continue;

            const resolved = resolveHostPath(context.stackDirectory, mount.path);
            if (isWithinDirectory(context.stackDirectory, resolved)) continue;

            findings.push({
                ruleId: this.id,
                severity: this.severity,
                message: `Service "${mount.serviceName}" bind-mounts ${mount.path}, which is outside this stack's directory.`,
                serviceName: mount.serviceName,
                path: ["services", mount.serviceName, "volumes", mount.index],
            });
        }

        return findings;
    }
}
