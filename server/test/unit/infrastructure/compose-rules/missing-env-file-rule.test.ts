import {describe, expect, it} from "vitest";
import {MissingEnvFileRule} from "../../../../src/infrastructure/compose-rules/missing-env-file-rule.js";
import type {ComposeRuleContext} from "../../../../src/application/ports/compose-rule-engine-port.js";

const withEnvFile: ComposeRuleContext = {stackDirectory: "/opt/docktor/stacks/app", hasEnvFile: true};
const withoutEnvFile: ComposeRuleContext = {stackDirectory: "/opt/docktor/stacks/app", hasEnvFile: false};

describe("MissingEnvFileRule", () => {
    const rule = new MissingEnvFileRule();

    it("declares its D-12/D-10 shape", () => {
        expect(rule.id).toBe("missingEnvFile");
        expect(rule.severity).toBe("warning");
        expect(rule.configurable).toBe(true);
    });

    it("flags a service with no env_file entry when the stack has a .env file", () => {
        const doc = {services: {app: {image: "nginx"}}};
        expect(rule.check(doc, withEnvFile)).toEqual([
            {
                ruleId: "missingEnvFile",
                severity: "warning",
                message: expect.stringContaining("app"),
                serviceName: "app",
                path: ["services", "app"],
            },
        ]);
    });

    it("never fires when the stack has no .env file", () => {
        const doc = {services: {app: {image: "nginx"}}};
        expect(rule.check(doc, withoutEnvFile)).toEqual([]);
    });

    it("does not flag a service with env_file: .env", () => {
        const doc = {services: {app: {env_file: ".env"}}};
        expect(rule.check(doc, withEnvFile)).toEqual([]);
    });

    it("does not flag a service with env_file: [.env]", () => {
        const doc = {services: {app: {env_file: [".env"]}}};
        expect(rule.check(doc, withEnvFile)).toEqual([]);
    });
});
