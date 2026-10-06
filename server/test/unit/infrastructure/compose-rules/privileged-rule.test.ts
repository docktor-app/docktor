import {describe, expect, it} from "vitest";
import {PrivilegedRule} from "../../../../src/infrastructure/compose-rules/privileged-rule.js";
import type {ComposeRuleContext} from "../../../../src/application/ports/compose-rule-engine-port.js";

const context: ComposeRuleContext = {stackDirectory: "/opt/docktor/stacks/app", hasEnvFile: false};

describe("PrivilegedRule", () => {
    const rule = new PrivilegedRule();

    it("declares its D-12/D-11 shape", () => {
        expect(rule.id).toBe("privileged");
        expect(rule.severity).toBe("danger");
        expect(rule.configurable).toBe(false);
    });

    it("flags a service with privileged: true (boolean)", () => {
        const doc = {services: {web: {image: "nginx", privileged: true}}};
        const findings = rule.check(doc, context);
        expect(findings).toEqual([
            {
                ruleId: "privileged",
                severity: "danger",
                message: 'Service "web" runs with privileged: true, granting it full access to the host.',
                serviceName: "web",
                path: ["services", "web", "privileged"],
            },
        ]);
    });

    it("flags a service with privileged: \"true\" (string)", () => {
        const doc = {services: {web: {privileged: "true"}}};
        expect(rule.check(doc, context)).toHaveLength(1);
    });

    it("does not flag privileged: false", () => {
        const doc = {services: {web: {privileged: false}}};
        expect(rule.check(doc, context)).toEqual([]);
    });

    it("does not flag a service with no privileged key", () => {
        const doc = {services: {web: {image: "nginx"}}};
        expect(rule.check(doc, context)).toEqual([]);
    });

    it("flags multiple services independently, in declaration order", () => {
        const doc = {
            services: {
                web: {privileged: true},
                worker: {privileged: false},
                db: {privileged: "true"},
            },
        };
        const findings = rule.check(doc, context);
        expect(findings.map((f) => f.serviceName)).toEqual(["web", "db"]);
    });

    it("returns [] for an empty services object", () => {
        expect(rule.check({services: {}}, context)).toEqual([]);
    });
});
