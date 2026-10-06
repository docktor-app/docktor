import {beforeEach, describe, expect, it, vi} from "vitest";
import {apiFetch} from "@/lib/api";
import {
    createStackFromTemplate,
    getTemplateVariant,
    listTemplates,
    syncTemplateRepo,
} from "@/lib/templates-api";

vi.mock("@/lib/api", () => ({
    apiFetch: vi.fn(),
    ApiError: class extends Error {
        constructor(message: string, public status: number) {
            super(message);
        }
    },
}));

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
    mockApiFetch.mockReset();
});

describe("templates-api", () => {
    it("listTemplates calls GET /api/templates", async () => {
        mockApiFetch.mockResolvedValue({repos: [], templates: []});

        const result = await listTemplates();

        expect(result).toEqual({repos: [], templates: []});
        expect(mockApiFetch).toHaveBeenCalledWith("/api/templates");
    });

    it("getTemplateVariant calls GET /api/templates/variants/:variantId", async () => {
        mockApiFetch.mockResolvedValue({id: "v1"});

        const result = await getTemplateVariant("v1");

        expect(result).toEqual({id: "v1"});
        expect(mockApiFetch).toHaveBeenCalledWith("/api/templates/variants/v1");
    });

    it("createStackFromTemplate calls POST /api/templates/variants/:variantId/stacks with the input body", async () => {
        mockApiFetch.mockResolvedValue({id: "new-stack"});

        const input = {displayName: "Whoami", composeContent: "services:\n  web:\n    image: nginx"};
        const result = await createStackFromTemplate("v1", input);

        expect(result).toEqual({id: "new-stack"});
        expect(mockApiFetch).toHaveBeenCalledWith("/api/templates/variants/v1/stacks", {
            method: "POST",
            body: JSON.stringify(input),
        });
    });

    it("syncTemplateRepo calls POST /api/template-repos/:repoId/sync", async () => {
        mockApiFetch.mockResolvedValue({id: "repo-1", lastSyncError: null});

        const result = await syncTemplateRepo("repo-1");

        expect(result).toEqual({id: "repo-1", lastSyncError: null});
        expect(mockApiFetch).toHaveBeenCalledWith("/api/template-repos/repo-1/sync", {method: "POST"});
    });
});
