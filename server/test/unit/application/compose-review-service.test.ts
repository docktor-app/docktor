import {beforeEach, describe, expect, it, vi} from "vitest";
import {ComposeReviewService} from "../../../src/application/compose-review-service.js";
import {ComposeRuleEngine} from "../../../src/infrastructure/compose-rule-engine.js";
import {BadRequestError, NotFoundError} from "../../../src/lib/errors.js";
import type {ComposeFinding, ComposeRuleEnginePort} from "../../../src/application/ports/compose-rule-engine-port.js";

function createMockStacks() {
    return {
        findByIdOrThrow: vi.fn().mockResolvedValue({id: "my-app", hostPath: "/stacks/my-app"}),
    };
}

function createMockFs() {
    return {
        readCompose: vi.fn().mockResolvedValue(""),
        readEnv: vi.fn().mockResolvedValue(""),
        getStackDirectory: vi.fn((id: string) => `/stacks/${id}`),
    };
}

function createMockSettings(overrides: {skipReview?: boolean; checks?: Partial<Record<string, boolean>>} = {}) {
    return {
        getComposeCheckSettings: vi.fn().mockResolvedValue({
            skipReview: overrides.skipReview ?? false,
            checks: {
                namedVolume: overrides.checks?.namedVolume ?? true,
                inlineEnv: overrides.checks?.inlineEnv ?? true,
                missingEnvFile: overrides.checks?.missingEnvFile ?? true,
            },
        }),
    };
}

// A stub engine that always returns the given findings for any content —
// lets tests assert the service's own logic (introduced/confirmationRequired)
// without depending on the real rule parsing.
function createStubEngine(findingsByContent: Record<string, ComposeFinding[]> = {}): ComposeRuleEnginePort {
    return {
        ruleDescriptors: [],
        evaluate: vi.fn((content: string) => ({
            findings: findingsByContent[content] ?? [],
            parseError: null,
        })),
    };
}

describe("ComposeReviewService", () => {
    let stacks: ReturnType<typeof createMockStacks>;
    let fs: ReturnType<typeof createMockFs>;

    beforeEach(() => {
        stacks = createMockStacks();
        fs = createMockFs();
    });

    describe("previewStackChange — diff behavior (Issue #18, unchanged)", () => {
        let service: ComposeReviewService;

        beforeEach(() => {
            service = new ComposeReviewService(stacks, fs, createStubEngine(), createMockSettings());
        });

        it("resolves the stack first, raising for an unknown id", async () => {
            stacks.findByIdOrThrow.mockRejectedValue(new NotFoundError("Stack not found"));

            await expect(
                service.previewStackChange("unknown", {composeContent: "services: {}"}),
            ).rejects.toThrow(NotFoundError);
        });

        it("returns hasChanges/confirmationRequired true with a non-empty compose diff when content differs from disk", async () => {
            fs.readCompose.mockResolvedValue("services:\n  web:\n    image: nginx\n");

            const result = await service.previewStackChange("my-app", {
                composeContent: "services:\n  web:\n    image: nginx:1.27\n",
            });

            expect(result.hasChanges).toBe(true);
            expect(result.confirmationRequired).toBe(true);
            expect(result.compose).not.toBeNull();
            expect(result.compose!.hunks.length).toBeGreaterThan(0);
            expect(result.env).toBeNull();
        });

        it("returns hasChanges/confirmationRequired false when compose content is byte-identical to disk", async () => {
            const content = "services:\n  web:\n    image: nginx\n";
            fs.readCompose.mockResolvedValue(content);

            const result = await service.previewStackChange("my-app", {composeContent: content});

            expect(result.hasChanges).toBe(false);
            expect(result.confirmationRequired).toBe(false);
            expect(result.compose).toEqual({hunks: [], added: 0, removed: 0});
        });

        // Plan 12-05/Issue #20: the rule engine's hasEnvFile context needs
        // the current .env content regardless of which field is being
        // edited, so both files are now read on every preview — this is a
        // deliberate behavior change from 12-01's "diff-only" preview,
        // which only ever read the file(s) actually being compared.
        it("still reads fs.readEnv when only composeContent is submitted, to compute hasEnvFile for the rule engine", async () => {
            await service.previewStackChange("my-app", {composeContent: "services: {}"});

            expect(fs.readEnv).toHaveBeenCalledWith("my-app");
        });

        it("still reads fs.readCompose when only envContent is submitted, to evaluate the rule engine against the current compose file", async () => {
            await service.previewStackChange("my-app", {envContent: "FOO=bar"});

            expect(fs.readCompose).toHaveBeenCalledWith("my-app");
        });

        it("computes an env-only diff, leaving compose null, when only envContent is submitted and it differs", async () => {
            fs.readEnv.mockResolvedValue("FOO=bar");

            const result = await service.previewStackChange("my-app", {envContent: "FOO=baz"});

            expect(result.compose).toBeNull();
            expect(result.env).not.toBeNull();
            expect(result.env!.hunks.length).toBeGreaterThan(0);
            expect(result.hasChanges).toBe(true);
        });

        it("reports hasChanges false for byte-identical env content", async () => {
            fs.readEnv.mockResolvedValue("FOO=bar");

            const result = await service.previewStackChange("my-app", {envContent: "FOO=bar"});

            expect(result.hasChanges).toBe(false);
            expect(result.confirmationRequired).toBe(false);
        });

        it("computes a removed-lines env diff when envContent is submitted empty but disk has content", async () => {
            fs.readEnv.mockResolvedValue("FOO=bar\n");

            const result = await service.previewStackChange("my-app", {envContent: ""});

            expect(result.hasChanges).toBe(true);
            expect(result.env!.removed).toBeGreaterThan(0);
        });

        it("computes both compose and env diffs in one call", async () => {
            fs.readCompose.mockResolvedValue("services:\n  web:\n    image: nginx\n");
            fs.readEnv.mockResolvedValue("FOO=bar\n");

            const result = await service.previewStackChange("my-app", {
                composeContent: "services:\n  web:\n    image: redis\n",
                envContent: "FOO=baz\n",
            });

            expect(result.compose!.hunks.length).toBeGreaterThan(0);
            expect(result.env!.hunks.length).toBeGreaterThan(0);
            expect(result.hasChanges).toBe(true);
        });

        it("diffs against empty content instead of throwing when fs.readCompose rejects", async () => {
            fs.readCompose.mockRejectedValue(new Error("EACCES"));

            const result = await service.previewStackChange("my-app", {composeContent: "services: {}"});

            expect(result.compose).not.toBeNull();
            expect(result.hasChanges).toBe(true);
        });

        it("never writes anything — no write method exists on the injected fs port", async () => {
            // Type-level guarantee: Pick<StackFilesystemPort, "readCompose" | "readEnv" | "getStackDirectory">
            // excludes every write* method, so this is a structural assertion the
            // mock itself enforces by only exposing read/getStackDirectory methods.
            expect((fs as Record<string, unknown>).writeCompose).toBeUndefined();
            expect((fs as Record<string, unknown>).writeEnv).toBeUndefined();
        });
    });

    describe("previewStackChange — findings (Issue #20/D-03/D-04, plan 12-05)", () => {
        it("flags privileged: true on the new content, line 4, with introduced: true", async () => {
            const after = "services:\n  web:\n    image: nginx\n    privileged: true\n";
            fs.readCompose.mockResolvedValue("services:\n  web:\n    image: nginx\n");
            const service = new ComposeReviewService(stacks, fs, new ComposeRuleEngine(), createMockSettings());

            const result = await service.previewStackChange("my-app", {composeContent: after});

            expect(result.findings).toHaveLength(1);
            expect(result.findings[0]).toMatchObject({
                ruleId: "privileged",
                severity: "danger",
                serviceName: "web",
                line: 4,
                introduced: true,
            });
        });

        it("marks a finding introduced: false when the disk compose already had it", async () => {
            const content = "services:\n  web:\n    image: nginx\n    privileged: true\n";
            fs.readCompose.mockResolvedValue(content);
            const service = new ComposeReviewService(stacks, fs, new ComposeRuleEngine(), createMockSettings());

            // A no-op content change (still has privileged: true) that still
            // produces a diff by changing something else too.
            const after = "services:\n  web:\n    image: nginx:1.27\n    privileged: true\n";
            const result = await service.previewStackChange("my-app", {composeContent: after});

            const privilegedFinding = result.findings.find((f) => f.ruleId === "privileged");
            expect(privilegedFinding?.introduced).toBe(false);
        });

        it("passes stackDirectory = the stack's hostPath and hasEnvFile = the post-edit .env content is non-blank to the engine", async () => {
            const engine = createStubEngine();
            fs.readCompose.mockResolvedValue("services: {}");
            const service = new ComposeReviewService(stacks, fs, engine, createMockSettings());

            await service.previewStackChange("my-app", {composeContent: "services: {}", envContent: "FOO=bar"});

            expect(engine.evaluate).toHaveBeenCalledWith(
                expect.any(String),
                {stackDirectory: "/stacks/my-app", hasEnvFile: true},
                expect.anything(),
            );
        });

        it("builds the enabled set from settings — a disabled configurable check produces no findings", async () => {
            const after = "services:\n  web:\n    image: nginx\n    volumes:\n      - data:/data\nvolumes:\n  data: {}\n";
            fs.readCompose.mockResolvedValue("services: {}\n");
            const settings = createMockSettings({checks: {namedVolume: false}});
            const service = new ComposeReviewService(stacks, fs, new ComposeRuleEngine(), settings);

            const result = await service.previewStackChange("my-app", {composeContent: after});

            expect(result.findings.some((f) => f.ruleId === "namedVolume")).toBe(false);
        });

        it("composeParseError carries the after evaluation's parse error", async () => {
            fs.readCompose.mockResolvedValue("services: {}\n");
            const service = new ComposeReviewService(stacks, fs, new ComposeRuleEngine(), createMockSettings());

            const result = await service.previewStackChange("my-app", {composeContent: "services:\n  web: [unterminated"});

            expect(result.composeParseError).not.toBeNull();
            expect(result.findings).toEqual([]);
        });

        describe("D-04 x #20 reconciliation: skip never hides an introduced finding", () => {
            it("skip on + introduced privileged still requires confirmation", async () => {
                fs.readCompose.mockResolvedValue("services:\n  web:\n    image: nginx\n");
                const settings = createMockSettings({skipReview: true});
                const service = new ComposeReviewService(stacks, fs, new ComposeRuleEngine(), settings);

                const result = await service.previewStackChange("my-app", {
                    composeContent: "services:\n  web:\n    image: nginx\n    privileged: true\n",
                });

                expect(result.confirmationRequired).toBe(true);
            });

            it("skip on + a benign change with no findings never requires confirmation", async () => {
                fs.readCompose.mockResolvedValue("services:\n  web:\n    image: nginx\n");
                const settings = createMockSettings({skipReview: true});
                const service = new ComposeReviewService(stacks, fs, new ComposeRuleEngine(), settings);

                const result = await service.previewStackChange("my-app", {
                    composeContent: "services:\n  web:\n    image: nginx:1.27\n",
                });

                expect(result.confirmationRequired).toBe(false);
            });

            it("skip on + an existing (not newly introduced) finding never requires confirmation", async () => {
                const content = "services:\n  web:\n    image: nginx\n    privileged: true\n";
                fs.readCompose.mockResolvedValue(content);
                const settings = createMockSettings({skipReview: true});
                const service = new ComposeReviewService(stacks, fs, new ComposeRuleEngine(), settings);

                const result = await service.previewStackChange("my-app", {
                    composeContent: "services:\n  web:\n    image: nginx:1.27\n    privileged: true\n",
                });

                expect(result.confirmationRequired).toBe(false);
            });

            it("skip off always requires confirmation when there are changes, regardless of findings", async () => {
                fs.readCompose.mockResolvedValue("services:\n  web:\n    image: nginx\n");
                const settings = createMockSettings({skipReview: false});
                const service = new ComposeReviewService(stacks, fs, new ComposeRuleEngine(), settings);

                const result = await service.previewStackChange("my-app", {
                    composeContent: "services:\n  web:\n    image: nginx:1.27\n",
                });

                expect(result.confirmationRequired).toBe(true);
            });

            it("skip on + a yellow (configurable) finding introduced by this edit still requires confirmation while enabled", async () => {
                fs.readCompose.mockResolvedValue("services:\n  web:\n    image: nginx\n    environment:\n      FOO: bar\n");
                const settings = createMockSettings({skipReview: true, checks: {inlineEnv: true}});
                const service = new ComposeReviewService(stacks, fs, new ComposeRuleEngine(), settings);

                const result = await service.previewStackChange("my-app", {
                    composeContent:
                        "services:\n  web:\n    image: nginx\n    environment:\n      FOO: bar\n      BAZ: qux\n",
                });

                expect(result.confirmationRequired).toBe(true);
            });

            it("skip on + the same yellow finding with inlineEnv disabled never requires confirmation", async () => {
                fs.readCompose.mockResolvedValue("services:\n  web:\n    image: nginx\n    environment:\n      FOO: bar\n");
                const settings = createMockSettings({skipReview: true, checks: {inlineEnv: false}});
                const service = new ComposeReviewService(stacks, fs, new ComposeRuleEngine(), settings);

                const result = await service.previewStackChange("my-app", {
                    composeContent:
                        "services:\n  web:\n    image: nginx\n    environment:\n      FOO: bar\n      BAZ: qux\n",
                });

                expect(result.confirmationRequired).toBe(false);
            });

            it("skip on + adding a stack's first .env file newly introduces missingEnvFile and still requires confirmation (CR-01 regression)", async () => {
                // Before this edit the stack has no .env file at all, so MissingEnvFileRule
                // must not fire on the "before" evaluation even though it fires "after" —
                // a shared before/after context previously made this finding look pre-existing.
                const composeContent = "services:\n  web:\n    image: nginx\n";
                fs.readCompose.mockResolvedValue(composeContent);
                fs.readEnv.mockResolvedValue("");
                const settings = createMockSettings({skipReview: true, checks: {missingEnvFile: true}});
                const service = new ComposeReviewService(stacks, fs, new ComposeRuleEngine(), settings);

                const result = await service.previewStackChange("my-app", {envContent: "FOO=bar"});

                const missingEnvFinding = result.findings.find((f) => f.ruleId === "missingEnvFile");
                expect(missingEnvFinding?.introduced).toBe(true);
                expect(result.confirmationRequired).toBe(true);
            });
        });
    });

    describe("previewNewStack (Issue #20/D-02, plan 12-05 Task 3)", () => {
        it("evaluates with stackDirectory = fs.getStackDirectory(slug) and returns confirmationRequired true with findings all introduced", async () => {
            const service = new ComposeReviewService(stacks, fs, new ComposeRuleEngine(), createMockSettings());

            const result = await service.previewNewStack({
                displayName: "My App",
                composeContent: "services:\n  web:\n    image: nginx\n    privileged: true\n",
            });

            expect(fs.getStackDirectory).toHaveBeenCalledWith("my-app");
            expect(result.confirmationRequired).toBe(true);
            expect(result.findings).toHaveLength(1);
            expect(result.findings[0]).toMatchObject({ruleId: "privileged", introduced: true});
        });

        it("a clean compose returns confirmationRequired false and an empty findings list", async () => {
            const service = new ComposeReviewService(stacks, fs, new ComposeRuleEngine(), createMockSettings());

            const result = await service.previewNewStack({
                displayName: "My App",
                composeContent: "services:\n  web:\n    image: nginx\n",
            });

            expect(result.confirmationRequired).toBe(false);
            expect(result.findings).toEqual([]);
        });

        it("throws BadRequestError for a display name that produces an empty slug", async () => {
            const service = new ComposeReviewService(stacks, fs, new ComposeRuleEngine(), createMockSettings());

            await expect(
                service.previewNewStack({displayName: "!!!", composeContent: "services: {}"}),
            ).rejects.toThrow(BadRequestError);
        });

        it("never consults the skip-review setting — only finding presence decides confirmationRequired", async () => {
            const settings = createMockSettings({skipReview: true});
            const service = new ComposeReviewService(stacks, fs, new ComposeRuleEngine(), settings);

            const result = await service.previewNewStack({
                displayName: "My App",
                composeContent: "services:\n  web:\n    image: nginx\n    privileged: true\n",
            });

            expect(result.confirmationRequired).toBe(true);
        });
    });

    describe("evaluateCurrentStack (plan 12-08's D-09 deploy-time re-check entry point)", () => {
        it("reads disk compose + .env and returns the engine findings for the current settings, with no introduced field", async () => {
            fs.readCompose.mockResolvedValue("services:\n  web:\n    image: nginx\n    privileged: true\n");
            const service = new ComposeReviewService(stacks, fs, new ComposeRuleEngine(), createMockSettings());

            const findings = await service.evaluateCurrentStack("my-app");

            expect(findings).toHaveLength(1);
            expect(findings[0]).toMatchObject({ruleId: "privileged"});
            expect(findings[0]).not.toHaveProperty("introduced");
        });

        it("returns [] for a compose file that fails to parse, rather than throwing", async () => {
            fs.readCompose.mockResolvedValue("services:\n  web: [unterminated");
            const service = new ComposeReviewService(stacks, fs, new ComposeRuleEngine(), createMockSettings());

            await expect(service.evaluateCurrentStack("my-app")).resolves.toEqual([]);
        });

        it("raises for an unknown stack id", async () => {
            stacks.findByIdOrThrow.mockRejectedValue(new NotFoundError("Stack not found"));
            const service = new ComposeReviewService(stacks, fs, new ComposeRuleEngine(), createMockSettings());

            await expect(service.evaluateCurrentStack("unknown")).rejects.toThrow(NotFoundError);
        });
    });
});
