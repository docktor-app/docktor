import {describe, expect, it} from "vitest";
import {DockerSocketRule} from "../../../../src/infrastructure/compose-rules/docker-socket-rule.js";
import type {ComposeRuleContext} from "../../../../src/application/ports/compose-rule-engine-port.js";

const context: ComposeRuleContext = {stackDirectory: "/opt/docktor/stacks/app", hasEnvFile: false};

describe("DockerSocketRule", () => {
    const rule = new DockerSocketRule();

    it("declares its D-12/D-11 shape", () => {
        expect(rule.id).toBe("dockerSocket");
        expect(rule.severity).toBe("danger");
        expect(rule.configurable).toBe(false);
    });

    it("flags a short-form Docker-socket mount", () => {
        const doc = {
            services: {app: {volumes: ["/var/run/docker.sock:/var/run/docker.sock"]}},
        };
        const findings = rule.check(doc, context);
        expect(findings).toEqual([
            {
                ruleId: "dockerSocket",
                severity: "danger",
                message: expect.stringContaining("/var/run/docker.sock"),
                serviceName: "app",
                path: ["services", "app", "volumes", 0],
            },
        ]);
    });

    it("flags a long-form Docker-socket mount", () => {
        const doc = {
            services: {
                app: {volumes: [{type: "bind", source: "/run/docker.sock", target: "/run/docker.sock"}]},
            },
        };
        expect(rule.check(doc, context)).toHaveLength(1);
    });

    it("flags the Windows named-pipe Docker-socket mount", () => {
        const doc = {
            services: {app: {volumes: ["//./pipe/docker_engine://./pipe/docker_engine"]}},
        };
        expect(rule.check(doc, context)).toHaveLength(1);
    });

    it("does not flag an ordinary bind mount", () => {
        const doc = {services: {app: {volumes: ["./data:/app/data"]}}};
        expect(rule.check(doc, context)).toEqual([]);
    });

    it("preserves the mount's index within the service's volumes list", () => {
        const doc = {
            services: {app: {volumes: ["./data:/app/data", "/var/run/docker.sock:/var/run/docker.sock"]}},
        };
        const findings = rule.check(doc, context);
        expect(findings[0].path).toEqual(["services", "app", "volumes", 1]);
    });
});
