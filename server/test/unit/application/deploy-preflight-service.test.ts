import {describe, expect, it, vi} from "vitest";
import {DeployPreflightService, EMPTY_DEPLOY_WARNINGS} from "../../../src/application/deploy-preflight-service.js";
import {ComposeReviewService} from "../../../src/application/compose-review-service.js";
import {ComposeRuleEngine} from "../../../src/infrastructure/compose-rule-engine.js";

function createMockReview() {
    return {evaluateCurrentStack: vi.fn().mockResolvedValue([])};
}

function createMockPorts() {
    return {check: vi.fn().mockResolvedValue([])};
}

describe("DeployPreflightService", () => {
    it("EMPTY_DEPLOY_WARNINGS is the documented never-checked/check-failed sentinel", () => {
        expect(EMPTY_DEPLOY_WARNINGS).toEqual({checkedAt: "", composeFindings: [], portConflicts: []});
    });

    it("resolves checkedAt plus both results when both dependencies succeed", async () => {
        const review = createMockReview();
        const ports = createMockPorts();
        review.evaluateCurrentStack.mockResolvedValue([
            {ruleId: "privileged", severity: "danger", message: "x", serviceName: "web", path: [], line: 1},
        ]);
        ports.check.mockResolvedValue([
            {port: 8080, protocol: "tcp", serviceName: "web", holder: {kind: "unknown"}},
        ]);
        const service = new DeployPreflightService(review as any, ports as any);

        const result = await service.run("my-app");

        expect(result.composeFindings).toHaveLength(1);
        expect(result.portConflicts).toHaveLength(1);
        expect(result.checkedAt).not.toBe("");
        expect(() => new Date(result.checkedAt).toISOString()).not.toThrow();
    });

    it("degrades composeFindings to [] when evaluateCurrentStack rejects, still returning portConflicts", async () => {
        const review = createMockReview();
        const ports = createMockPorts();
        review.evaluateCurrentStack.mockRejectedValue(new Error("boom"));
        ports.check.mockResolvedValue([
            {port: 8080, protocol: "tcp", serviceName: "web", holder: {kind: "unknown"}},
        ]);
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const service = new DeployPreflightService(review as any, ports as any);

        const result = await service.run("my-app");

        expect(result.composeFindings).toEqual([]);
        expect(result.portConflicts).toHaveLength(1);
        warnSpy.mockRestore();
    });

    it("degrades portConflicts to [] when check rejects, still returning composeFindings", async () => {
        const review = createMockReview();
        const ports = createMockPorts();
        review.evaluateCurrentStack.mockResolvedValue([
            {ruleId: "privileged", severity: "danger", message: "x", serviceName: "web", path: [], line: 1},
        ]);
        ports.check.mockRejectedValue(new Error("docker down"));
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const service = new DeployPreflightService(review as any, ports as any);

        const result = await service.run("my-app");

        expect(result.composeFindings).toHaveLength(1);
        expect(result.portConflicts).toEqual([]);
        warnSpy.mockRestore();
    });

    describe("D-09: deploy-time re-check of an externally edited compose file", () => {
        it("surfaces a privileged finding from content written directly to disk, never reviewed via updateStack", async () => {
            const stacks = {findByIdOrThrow: vi.fn().mockResolvedValue({id: "my-app", hostPath: "/stacks/my-app"})};
            const fs = {
                readCompose: vi.fn().mockResolvedValue("services:\n  web:\n    image: nginx\n    privileged: true\n"),
                readEnv: vi.fn().mockResolvedValue(""),
                getStackDirectory: vi.fn((id: string) => `/stacks/${id}`),
            };
            const settings = {
                getComposeCheckSettings: vi.fn().mockResolvedValue({
                    skipReview: false,
                    checks: {namedVolume: true, inlineEnv: true, missingEnvFile: true},
                }),
            };
            const review = new ComposeReviewService(stacks, fs, new ComposeRuleEngine(), settings);
            const ports = createMockPorts();
            const service = new DeployPreflightService(review, ports as any);

            const result = await service.run("my-app");

            expect(result.composeFindings.some((f) => f.ruleId === "privileged")).toBe(true);
        });
    });
});
