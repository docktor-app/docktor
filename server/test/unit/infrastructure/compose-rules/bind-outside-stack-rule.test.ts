import {describe, expect, it} from "vitest";
import {BindOutsideStackRule} from "../../../../src/infrastructure/compose-rules/bind-outside-stack-rule.js";
import type {ComposeRuleContext} from "../../../../src/application/ports/compose-rule-engine-port.js";

const context: ComposeRuleContext = {stackDirectory: "/opt/docktor/stacks/app", hasEnvFile: false};

function doc(volumeEntry: string) {
    return {services: {app: {volumes: [volumeEntry]}}};
}

describe("BindOutsideStackRule", () => {
    const rule = new BindOutsideStackRule();

    it("declares its D-12/D-11 shape", () => {
        expect(rule.id).toBe("bindOutsideStack");
        expect(rule.severity).toBe("danger");
        expect(rule.configurable).toBe(false);
    });

    it("does not flag a relative mount inside ./volumes/", () => {
        expect(rule.check(doc("./volumes/data:/data"), context)).toEqual([]);
    });

    it("does not flag the stack directory itself ('.')", () => {
        expect(rule.check(doc(".:/app"), context)).toEqual([]);
    });

    it("flags a parent-relative mount that escapes the stack directory", () => {
        const findings = rule.check(doc("../other:/x"), context);
        expect(findings).toHaveLength(1);
        expect(findings[0].serviceName).toBe("app");
    });

    it("flags a sibling-directory adjacency mount (probe #20 adjacency)", () => {
        const findings = rule.check(doc("/opt/docktor/stacks/app-evil/x:/x"), context);
        expect(findings).toHaveLength(1);
    });

    it("does not flag an absolute mount inside the stack directory", () => {
        expect(rule.check(doc("/opt/docktor/stacks/app/data:/d"), context)).toEqual([]);
    });

    it("flags a ~-prefixed (home-relative) mount as outside", () => {
        const findings = rule.check(doc("~/data:/data"), context);
        expect(findings).toHaveLength(1);
    });

    it("does not flag an unresolvable ${VAR}-only host path (documented limitation)", () => {
        expect(rule.check(doc("${DATA}:/data"), context)).toEqual([]);
    });

    it("never double-reports a Docker-socket mount (DockerSocketRule's concern instead)", () => {
        expect(rule.check(doc("/var/run/docker.sock:/var/run/docker.sock"), context)).toEqual([]);
    });
});
