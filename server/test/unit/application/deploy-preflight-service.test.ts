import {describe, expect, it, vi} from "vitest";
import {DeployPreflightService, EMPTY_DEPLOY_WARNINGS} from "../../../src/application/deploy-preflight-service.js";
import {ComposeReviewService} from "../../../src/application/compose-review-service.js";
import {PortConflictService} from "../../../src/application/port-conflict-service.js";
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

    describe("own published ports (STK-01, #76)", () => {
        const COMPOSE = "services:\n  web:\n    image: nginx\n    ports:\n      - \"8080:80\"\n";
        const PORTS_8080 = JSON.stringify([{host: 8080, container: 80, protocol: "tcp"}]);
        const OWN_STACK = {id: "my-app", displayName: "My App", status: "RUNNING", services: [{ports: PORTS_8080}]};
        const OWN_CONTAINER = {
            Names: ["/my-app-web-1"],
            Labels: {"com.docker.compose.project": "my-app"},
            Ports: [{PrivatePort: 80, PublicPort: 8080, Type: "tcp", IP: "0.0.0.0"}],
        };
        const DOCKER_PROXY = {port: 8080, protocol: "tcp", processName: "docker-proxy", pid: 4321};

        function buildService(overrides: {stacks?: unknown[]; containers?: unknown[]; listeners?: unknown[]}) {
            const portConflicts = new PortConflictService(
                {findAll: vi.fn().mockResolvedValue(overrides.stacks ?? [])} as any,
                {readCompose: vi.fn().mockResolvedValue(COMPOSE), readEnv: vi.fn().mockResolvedValue("")} as any,
                {listContainers: vi.fn().mockResolvedValue(overrides.containers ?? [])} as any,
                {listListeners: vi.fn().mockResolvedValue(overrides.listeners ?? [])} as any,
            );
            return new DeployPreflightService(createMockReview() as any, portConflicts);
        }

        it("records no port warning when the stack's own running container publishes the port and docker-proxy listens on it", async () => {
            const service = buildService({stacks: [OWN_STACK], containers: [OWN_CONTAINER], listeners: [DOCKER_PROXY]});

            const result = await service.run("my-app");

            expect(result.portConflicts).toEqual([]);
        });

        it("still warns naming another Docktor stack that holds the port", async () => {
            const blog = {id: "blog", displayName: "Blog", status: "RUNNING", services: [{ports: PORTS_8080}]};
            const service = buildService({stacks: [OWN_STACK, blog]});

            const result = await service.run("my-app");

            expect(result.portConflicts).toEqual([
                {port: 8080, protocol: "tcp", serviceName: "web", holder: {kind: "stack", stackId: "blog", stackDisplayName: "Blog"}},
            ]);
        });

        it("still warns naming an external process when the stack is not running", async () => {
            const service = buildService({
                stacks: [OWN_STACK],
                listeners: [{port: 8080, protocol: "tcp", processName: "caddy", pid: 99}],
            });

            const result = await service.run("my-app");

            expect(result.portConflicts).toEqual([
                {port: 8080, protocol: "tcp", serviceName: "web", holder: {kind: "process", processName: "caddy", pid: 99}},
            ]);
        });
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
