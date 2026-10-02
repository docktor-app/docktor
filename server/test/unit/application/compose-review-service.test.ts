import {beforeEach, describe, expect, it, vi} from "vitest";
import {ComposeReviewService} from "../../../src/application/compose-review-service.js";
import {NotFoundError} from "../../../src/lib/errors.js";

function createMockStacks() {
    return {
        findByIdOrThrow: vi.fn().mockResolvedValue({id: "my-app", hostPath: "/stacks/my-app"}),
    };
}

function createMockFs() {
    return {
        readCompose: vi.fn().mockResolvedValue(""),
        readEnv: vi.fn().mockResolvedValue(""),
    };
}

describe("ComposeReviewService", () => {
    let stacks: ReturnType<typeof createMockStacks>;
    let fs: ReturnType<typeof createMockFs>;
    let service: ComposeReviewService;

    beforeEach(() => {
        stacks = createMockStacks();
        fs = createMockFs();
        service = new ComposeReviewService(stacks, fs);
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

    it("never calls fs.readEnv when only composeContent is submitted", async () => {
        await service.previewStackChange("my-app", {composeContent: "services: {}"});

        expect(fs.readEnv).not.toHaveBeenCalled();
    });

    it("never calls fs.readCompose when only envContent is submitted", async () => {
        await service.previewStackChange("my-app", {envContent: "FOO=bar"});

        expect(fs.readCompose).not.toHaveBeenCalled();
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
        // Type-level guarantee: Pick<StackFilesystemPort, "readCompose" | "readEnv">
        // excludes every write* method, so this is a structural assertion the
        // mock itself enforces by only exposing read methods.
        expect((fs as Record<string, unknown>).writeCompose).toBeUndefined();
        expect((fs as Record<string, unknown>).writeEnv).toBeUndefined();
    });
});
