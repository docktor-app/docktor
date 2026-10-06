import {describe, expect, it} from "vitest";
import {hasDeployWarnings, parseDeployWarnings} from "@/lib/deploy-warnings";
import type {DeployWarnings} from "@/lib/stacks-api";

describe("parseDeployWarnings", () => {
    it("parses valid JSON into a DeployWarnings object", () => {
        const warnings: DeployWarnings = {
            checkedAt: "2026-01-01T00:00:00.000Z",
            composeFindings: [],
            portConflicts: [{port: 8080, protocol: "tcp", serviceName: "web", holder: {kind: "unknown"}}],
        };

        expect(parseDeployWarnings(JSON.stringify(warnings))).toEqual(warnings);
    });

    it("returns null for null/undefined", () => {
        expect(parseDeployWarnings(null)).toBeNull();
        expect(parseDeployWarnings(undefined)).toBeNull();
    });

    it("returns null for an empty string", () => {
        expect(parseDeployWarnings("")).toBeNull();
    });

    it("returns null for malformed JSON", () => {
        expect(parseDeployWarnings("{not json")).toBeNull();
    });

    it("returns null for valid JSON missing one of the required arrays", () => {
        expect(parseDeployWarnings(JSON.stringify({checkedAt: "x", composeFindings: []}))).toBeNull();
        expect(parseDeployWarnings(JSON.stringify({checkedAt: "x", portConflicts: []}))).toBeNull();
    });

    it("returns null for a non-object JSON value", () => {
        expect(parseDeployWarnings(JSON.stringify("just a string"))).toBeNull();
        expect(parseDeployWarnings(JSON.stringify(null))).toBeNull();
    });
});

describe("hasDeployWarnings", () => {
    it("is false for null", () => {
        expect(hasDeployWarnings(null)).toBe(false);
    });

    it("is false when both lists are empty", () => {
        expect(hasDeployWarnings({checkedAt: "x", composeFindings: [], portConflicts: []})).toBe(false);
    });

    it("is true when there's at least one port conflict", () => {
        expect(hasDeployWarnings({
            checkedAt: "x",
            composeFindings: [],
            portConflicts: [{port: 8080, protocol: "tcp", serviceName: "web", holder: {kind: "unknown"}}],
        })).toBe(true);
    });

    it("is true when there's at least one compose finding", () => {
        expect(hasDeployWarnings({
            checkedAt: "x",
            composeFindings: [{ruleId: "privileged", severity: "danger", message: "x", serviceName: "web", path: [], line: 1}],
            portConflicts: [],
        })).toBe(true);
    });
});
