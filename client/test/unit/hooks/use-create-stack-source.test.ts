import {beforeEach, describe, expect, it, vi} from "vitest";
import {createElement, type ReactNode} from "react";
import {renderHook, waitFor} from "@testing-library/react";
import {MemoryRouter} from "react-router";
import {useCreateStackSource} from "@/hooks/use-create-stack-source";
import {createStack} from "@/lib/stacks-api";
import {createStackFromTemplate, getTemplateVariant} from "@/lib/templates-api";

vi.mock("@/lib/stacks-api", () => ({
    createStack: vi.fn(),
}));
vi.mock("@/lib/templates-api", () => ({
    createStackFromTemplate: vi.fn(),
    getTemplateVariant: vi.fn(),
}));

const mockCreateStack = vi.mocked(createStack);
const mockCreateStackFromTemplate = vi.mocked(createStackFromTemplate);
const mockGetTemplateVariant = vi.mocked(getTemplateVariant);

const VARIANT = {
    id: "v1",
    slug: "default",
    name: "Default",
    description: "The default variant",
    usage: "Run it.",
    composeContent: "services:\n  web:\n    image: nginx",
    envContent: "FOO=bar",
    contentHash: "hash1",
    template: {id: "t1", slug: "whoami", name: "Whoami"},
    repo: {id: "r1", url: "https://example.com/repo.git", headCommitSha: "abc"},
};

function renderWithPath(path: string) {
    return renderHook(() => useCreateStackSource(), {
        wrapper: ({children}: {children: ReactNode}) =>
            createElement(MemoryRouter, {initialEntries: [path]}, children),
    });
}

beforeEach(() => {
    mockCreateStack.mockReset();
    mockCreateStackFromTemplate.mockReset();
    mockGetTemplateVariant.mockReset();
});

describe("useCreateStackSource", () => {
    it("with no variant search param: variantId is null, defaultValues are blank, create delegates to createStack", async () => {
        const {result} = renderWithPath("/stacks/create");

        expect(result.current.variantId).toBeNull();
        expect(result.current.loading).toBe(false);
        expect(result.current.defaultValues).toEqual({
            displayName: "",
            description: "",
            composeContent: "",
            envContent: "",
        });

        mockCreateStack.mockResolvedValue({id: "new-stack"} as never);
        await result.current.create({displayName: "X", composeContent: "services:"});
        expect(mockCreateStack).toHaveBeenCalledWith({displayName: "X", composeContent: "services:"});
        expect(mockCreateStackFromTemplate).not.toHaveBeenCalled();
    });

    it("with ?variant=v1: loads the variant and prefills defaultValues from it", async () => {
        mockGetTemplateVariant.mockResolvedValue(VARIANT);

        const {result} = renderWithPath("/stacks/create?variant=v1");

        expect(result.current.variantId).toBe("v1");
        expect(result.current.loading).toBe(true);

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(mockGetTemplateVariant).toHaveBeenCalledWith("v1");
        expect(result.current.variant).toEqual(VARIANT);
        expect(result.current.defaultValues).toEqual({
            displayName: "Whoami",
            description: "",
            composeContent: "services:\n  web:\n    image: nginx",
            envContent: "FOO=bar",
        });
    });

    it("with ?variant=v1: create delegates to createStackFromTemplate bound to the variant id", async () => {
        mockGetTemplateVariant.mockResolvedValue(VARIANT);
        mockCreateStackFromTemplate.mockResolvedValue({id: "new-stack"});

        const {result} = renderWithPath("/stacks/create?variant=v1");
        await waitFor(() => expect(result.current.loading).toBe(false));

        await result.current.create({displayName: "Whoami", composeContent: "services:"});

        expect(mockCreateStackFromTemplate).toHaveBeenCalledWith("v1", {
            displayName: "Whoami",
            composeContent: "services:",
        });
        expect(mockCreateStack).not.toHaveBeenCalled();
    });

    it("sets an error message when loading the variant fails", async () => {
        mockGetTemplateVariant.mockRejectedValue(new Error("Variant not found"));

        const {result} = renderWithPath("/stacks/create?variant=missing");

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBe("Variant not found");
    });
});
