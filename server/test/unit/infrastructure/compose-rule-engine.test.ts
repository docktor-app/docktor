import {describe, expect, it} from "vitest";
import {ComposeRuleEngine} from "../../../src/infrastructure/compose-rule-engine.js";
import {BUILT_IN_COMPOSE_RULES} from "../../../src/infrastructure/compose-rules/registry.js";
import type {Rule, RuleFinding} from "../../../src/infrastructure/compose-rules/rule.js";
import type {ComposeRuleContext} from "../../../src/application/ports/compose-rule-engine-port.js";
import {COMPOSE_RULE_IDS, CONFIGURABLE_COMPOSE_RULE_IDS} from "@docktor/shared";

const context: ComposeRuleContext = {stackDirectory: "/opt/docktor/stacks/app", hasEnvFile: false};

describe("ComposeRuleEngine", () => {
    it("attaches the 1-based line of the offending YAML key to a located finding", () => {
        const engine = new ComposeRuleEngine();
        const content = "services:\n  web:\n    image: nginx\n    privileged: true\n";
        const {findings, parseError} = engine.evaluate(content, context, new Set());

        expect(parseError).toBeNull();
        expect(findings).toEqual([
            {
                ruleId: "privileged",
                severity: "danger",
                message: expect.stringContaining("web"),
                serviceName: "web",
                path: ["services", "web", "privileged"],
                line: 4,
            },
        ]);
    });

    it("carries line: null for a finding whose value is only present through a merge key", () => {
        const engine = new ComposeRuleEngine();
        const content = "x-base: &base\n  privileged: true\nservices:\n  web:\n    <<: *base\n    image: nginx\n";
        const {findings, parseError} = engine.evaluate(content, context, new Set());

        expect(parseError).toBeNull();
        expect(findings).toHaveLength(1);
        expect(findings[0].line).toBeNull();
    });

    it("returns [] without throwing for an empty services object", () => {
        const engine = new ComposeRuleEngine();
        expect(engine.evaluate("services: {}\n", context, new Set())).toEqual({
            findings: [],
            parseError: null,
        });
    });

    it("returns [] without throwing for an empty document", () => {
        const engine = new ComposeRuleEngine();
        expect(engine.evaluate("", context, new Set())).toEqual({findings: [], parseError: null});
    });

    it("returns [] without throwing for a bare YAML scalar", () => {
        const engine = new ComposeRuleEngine();
        expect(engine.evaluate("just a string", context, new Set())).toEqual({
            findings: [],
            parseError: null,
        });
    });

    it("never throws on invalid YAML and reports a non-empty parseError", () => {
        const engine = new ComposeRuleEngine();
        const {findings, parseError} = engine.evaluate(
            "services:\n  web: [unclosed\n",
            context,
            new Set(),
        );
        expect(findings).toEqual([]);
        expect(typeof parseError).toBe("string");
        expect(parseError).not.toHaveLength(0);
    });

    it("is deterministic across repeated evaluations of the same content", () => {
        const engine = new ComposeRuleEngine();
        const content = "services:\n  web:\n    privileged: true\n  db:\n    privileged: true\n";
        const first = engine.evaluate(content, context, new Set());
        const second = engine.evaluate(content, context, new Set());
        expect(first).toEqual(second);
    });

    it("filters configurable rules by the enabled set while always-on rules keep running", () => {
        const alwaysOnFinding: RuleFinding = {
            ruleId: "privileged",
            severity: "danger",
            message: "always-on",
            serviceName: null,
            path: [],
        };
        const configurableFinding: RuleFinding = {
            ruleId: "namedVolume",
            severity: "warning",
            message: "configurable",
            serviceName: null,
            path: [],
        };
        const alwaysOnRule: Rule = {
            id: "privileged",
            severity: "danger",
            configurable: false,
            check: () => [alwaysOnFinding],
        };
        const configurableRule: Rule = {
            id: "namedVolume",
            severity: "warning",
            configurable: true,
            check: () => [configurableFinding],
        };
        const engine = new ComposeRuleEngine([alwaysOnRule, configurableRule]);

        const disabled = engine.evaluate("services: {}\n", context, new Set());
        expect(disabled.findings.map((f) => f.ruleId)).toEqual(["privileged"]);

        const enabled = engine.evaluate("services: {}\n", context, new Set(["namedVolume"]));
        expect(enabled.findings.map((f) => f.ruleId)).toEqual(["privileged", "namedVolume"]);
    });

    it("exposes ruleDescriptors derived from the injected rules, in order", () => {
        const engine = new ComposeRuleEngine([
            {id: "privileged", severity: "danger", configurable: false, check: () => []},
            {id: "namedVolume", severity: "warning", configurable: true, check: () => []},
        ]);
        expect(engine.ruleDescriptors).toEqual([
            {id: "privileged", severity: "danger", configurable: false},
            {id: "namedVolume", severity: "warning", configurable: true},
        ]);
    });

    it("the default engine's ruleDescriptors ids match BUILT_IN_COMPOSE_RULES in order", () => {
        const engine = new ComposeRuleEngine();
        expect(engine.ruleDescriptors.map((d) => d.id)).toEqual(
            BUILT_IN_COMPOSE_RULES.map((r) => r.id),
        );
    });

    it("COMPOSE_RULE_IDS/CONFIGURABLE_COMPOSE_RULE_IDS are consistent with D-11's severity split", () => {
        expect(COMPOSE_RULE_IDS).toEqual([
            "privileged",
            "dockerSocket",
            "bindOutsideStack",
            "namedVolume",
            "inlineEnv",
            "missingEnvFile",
        ]);
        expect(CONFIGURABLE_COMPOSE_RULE_IDS).toEqual(["namedVolume", "inlineEnv", "missingEnvFile"]);
    });
});
