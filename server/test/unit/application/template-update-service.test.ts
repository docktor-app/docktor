import {describe, expect, it, vi} from "vitest";
import {TemplateUpdateService, type PinnedStackRow, type VariantContentHash} from "../../../src/application/template-update-service.js";

function makeStack(overrides: Partial<PinnedStackRow> = {}): PinnedStackRow {
    return {
        id: "stack-1",
        templateRepoUrl: "https://example.com/repo.git",
        templatePath: "nextcloud/default",
        templateContentHash: "hash-1",
        templateUpdateAvailable: false,
        ...overrides,
    };
}

describe("TemplateUpdateService.refreshPinnedStacks (Issue #19/D-08)", () => {
    it("flips the flag to true when the synced index has a different hash for the pinned variant", async () => {
        const stack = makeStack({templateContentHash: "hash-1"});
        const setTemplateUpdateAvailable = vi.fn().mockResolvedValue(undefined);
        const stacks = {
            findTemplatePinnedStacks: vi.fn().mockResolvedValue([stack]),
            setTemplateUpdateAvailable,
        };
        const templates = {
            findVariantContentHashes: vi.fn().mockResolvedValue([
                {repoUrl: stack.templateRepoUrl, path: stack.templatePath, contentHash: "hash-2"} as VariantContentHash,
            ]),
        };

        const service = new TemplateUpdateService(stacks, templates);
        const result = await service.refreshPinnedStacks();

        expect(setTemplateUpdateAvailable).toHaveBeenCalledWith("stack-1", true);
        expect(result).toEqual({changed: 1});
    });

    it("does not write when the stored flag already matches the computed value (already true)", async () => {
        const stack = makeStack({templateContentHash: "hash-1", templateUpdateAvailable: true});
        const setTemplateUpdateAvailable = vi.fn().mockResolvedValue(undefined);
        const stacks = {
            findTemplatePinnedStacks: vi.fn().mockResolvedValue([stack]),
            setTemplateUpdateAvailable,
        };
        const templates = {
            findVariantContentHashes: vi.fn().mockResolvedValue([
                {repoUrl: stack.templateRepoUrl, path: stack.templatePath, contentHash: "hash-2"} as VariantContentHash,
            ]),
        };

        const service = new TemplateUpdateService(stacks, templates);
        const result = await service.refreshPinnedStacks();

        expect(setTemplateUpdateAvailable).not.toHaveBeenCalled();
        expect(result).toEqual({changed: 0});
    });

    it("sets the flag back to false when the index hash matches the pin again, but only if it was true", async () => {
        const stack = makeStack({templateContentHash: "hash-1", templateUpdateAvailable: true});
        const setTemplateUpdateAvailable = vi.fn().mockResolvedValue(undefined);
        const stacks = {
            findTemplatePinnedStacks: vi.fn().mockResolvedValue([stack]),
            setTemplateUpdateAvailable,
        };
        const templates = {
            findVariantContentHashes: vi.fn().mockResolvedValue([
                {repoUrl: stack.templateRepoUrl, path: stack.templatePath, contentHash: "hash-1"} as VariantContentHash,
            ]),
        };

        const service = new TemplateUpdateService(stacks, templates);
        const result = await service.refreshPinnedStacks();

        expect(setTemplateUpdateAvailable).toHaveBeenCalledWith("stack-1", false);
        expect(result).toEqual({changed: 1});
    });

    it("never calls setTemplateUpdateAvailable when the stored flag is already false and the hash matches", async () => {
        const stack = makeStack({templateContentHash: "hash-1", templateUpdateAvailable: false});
        const setTemplateUpdateAvailable = vi.fn().mockResolvedValue(undefined);
        const stacks = {
            findTemplatePinnedStacks: vi.fn().mockResolvedValue([stack]),
            setTemplateUpdateAvailable,
        };
        const templates = {
            findVariantContentHashes: vi.fn().mockResolvedValue([
                {repoUrl: stack.templateRepoUrl, path: stack.templatePath, contentHash: "hash-1"} as VariantContentHash,
            ]),
        };

        const service = new TemplateUpdateService(stacks, templates);
        await service.refreshPinnedStacks();

        expect(setTemplateUpdateAvailable).not.toHaveBeenCalled();
    });

    it("stacks without a pin are never read — findTemplatePinnedStacks is the only source iterated", async () => {
        const findTemplatePinnedStacks = vi.fn().mockResolvedValue([]);
        const stacks = {
            findTemplatePinnedStacks,
            setTemplateUpdateAvailable: vi.fn(),
        };
        const templates = {
            findVariantContentHashes: vi.fn().mockResolvedValue([]),
        };

        const service = new TemplateUpdateService(stacks, templates);
        const result = await service.refreshPinnedStacks();

        expect(findTemplatePinnedStacks).toHaveBeenCalledOnce();
        expect(result).toEqual({changed: 0});
    });

    it("a pinned variant that disappeared from the index keeps the flag false, never true", async () => {
        const stack = makeStack({templateContentHash: "hash-1", templateUpdateAvailable: false});
        const setTemplateUpdateAvailable = vi.fn().mockResolvedValue(undefined);
        const stacks = {
            findTemplatePinnedStacks: vi.fn().mockResolvedValue([stack]),
            setTemplateUpdateAvailable,
        };
        const templates = {
            findVariantContentHashes: vi.fn().mockResolvedValue([]), // removed from the index entirely
        };

        const service = new TemplateUpdateService(stacks, templates);
        await service.refreshPinnedStacks();

        expect(setTemplateUpdateAvailable).not.toHaveBeenCalled();
    });
});
