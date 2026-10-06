import {describe, expect, it} from "vitest";
import {InlineEnvRule} from "../../../../src/infrastructure/compose-rules/inline-env-rule.js";
import type {ComposeRuleContext} from "../../../../src/application/ports/compose-rule-engine-port.js";

const context: ComposeRuleContext = {stackDirectory: "/opt/docktor/stacks/app", hasEnvFile: false};

describe("InlineEnvRule", () => {
    const rule = new InlineEnvRule();

    it("declares its D-12/D-10 shape", () => {
        expect(rule.id).toBe("inlineEnv");
        expect(rule.severity).toBe("warning");
        expect(rule.configurable).toBe(true);
    });

    it("flags an object-form literal env var at its key path", () => {
        const doc = {services: {app: {environment: {DB_PASS: "secret", TZ: "${TZ}"}}}};
        const findings = rule.check(doc, context);
        expect(findings).toEqual([
            {
                ruleId: "inlineEnv",
                severity: "warning",
                message: expect.stringContaining("DB_PASS"),
                serviceName: "app",
                path: ["services", "app", "environment", "DB_PASS"],
            },
        ]);
    });

    it("flags a list-form literal env var at its list index", () => {
        const doc = {services: {app: {environment: ["DB_PASS=secret"]}}};
        const findings = rule.check(doc, context);
        expect(findings).toEqual([
            {
                ruleId: "inlineEnv",
                severity: "warning",
                message: expect.stringContaining("DB_PASS"),
                serviceName: "app",
                path: ["services", "app", "environment", 0],
            },
        ]);
    });

    it("does not flag a list-form variable-reference entry", () => {
        const doc = {services: {app: {environment: ["TZ=${TZ}"]}}};
        expect(rule.check(doc, context)).toEqual([]);
    });

    it("does not flag a bare list-form entry with no '='", () => {
        const doc = {services: {app: {environment: ["TZ"]}}};
        expect(rule.check(doc, context)).toEqual([]);
    });

    it("returns [] when there is no environment key", () => {
        const doc = {services: {app: {image: "nginx"}}};
        expect(rule.check(doc, context)).toEqual([]);
    });
});
