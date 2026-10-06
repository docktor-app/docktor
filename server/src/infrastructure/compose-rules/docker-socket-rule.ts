import type {Rule, RuleFinding} from "./rule.js";
import type {ComposeRuleContext} from "../../application/ports/compose-rule-engine-port.js";
import {composeAnalyzer} from "../compose-analyzer.js";

// The well-known host paths a compose bind mount uses to reach the Docker
// engine (Linux Unix socket, both common install locations, and the Windows
// named-pipe path). Exported so BindOutsideStackRule can exclude these same
// mounts from its own check — a Docker-socket mount is always reported by
// DockerSocketRule, never double-reported as "outside the stack directory"
// too.
export const DOCKER_SOCKET_PATHS: ReadonlySet<string> = new Set([
    "/var/run/docker.sock",
    "/run/docker.sock",
    "//./pipe/docker_engine",
]);

/**
 * #20/D-11 always-on check: a bind mount of the Docker socket gives a
 * container the same level of control over the host as `privileged: true`
 * (arguably more, since it can spin up arbitrary new privileged containers).
 */
export class DockerSocketRule implements Rule {
    readonly id = "dockerSocket" as const;
    readonly severity = "danger" as const;
    readonly configurable = false;

    check(doc: unknown, _context: ComposeRuleContext): RuleFinding[] {
        const findings: RuleFinding[] = [];

        for (const mount of composeAnalyzer.extractBindMounts(doc)) {
            if (!DOCKER_SOCKET_PATHS.has(mount.path)) continue;

            findings.push({
                ruleId: this.id,
                severity: this.severity,
                message: `Service "${mount.serviceName}" mounts the Docker socket (${mount.path}), giving it control over every container on the host.`,
                serviceName: mount.serviceName,
                path: ["services", mount.serviceName, "volumes", mount.index],
            });
        }

        return findings;
    }
}
