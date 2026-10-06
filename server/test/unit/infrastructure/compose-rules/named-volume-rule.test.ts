import {describe, expect, it} from "vitest";
import {NamedVolumeRule} from "../../../../src/infrastructure/compose-rules/named-volume-rule.js";
import type {ComposeRuleContext} from "../../../../src/application/ports/compose-rule-engine-port.js";

const context: ComposeRuleContext = {stackDirectory: "/opt/docktor/stacks/app", hasEnvFile: false};

describe("NamedVolumeRule", () => {
    const rule = new NamedVolumeRule();

    it("declares its D-12/D-10 shape", () => {
        expect(rule.id).toBe("namedVolume");
        expect(rule.severity).toBe("warning");
        expect(rule.configurable).toBe(true);
    });

    it("flags each top-level named volume", () => {
        const doc = {services: {db: {image: "postgres"}}, volumes: {db: {}}};
        expect(rule.check(doc, context)).toEqual([
            {
                ruleId: "namedVolume",
                severity: "warning",
                message: expect.stringContaining('"db"'),
                serviceName: null,
                path: ["volumes", "db"],
            },
        ]);
    });

    it("returns [] when there is no top-level volumes section", () => {
        const doc = {services: {db: {image: "postgres"}}};
        expect(rule.check(doc, context)).toEqual([]);
    });
});
