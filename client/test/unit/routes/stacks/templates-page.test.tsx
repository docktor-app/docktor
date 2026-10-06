import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter} from "react-router";
import TemplateBrowsePage from "@/routes/app/stacks/templates";
import {SidebarProvider} from "@/components/ui/sidebar";
import {useTemplates} from "@/hooks/use-templates";
import type {TemplateCatalog} from "@/lib/templates-api";

vi.mock("@/hooks/use-templates", () => ({
    useTemplates: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
    const actual = await vi.importActual<typeof import("react-router")>("react-router");
    return {...actual, useNavigate: () => mockNavigate};
});

if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}

const mockUseTemplates = vi.mocked(useTemplates);

const SINGLE_VARIANT_CATALOG: TemplateCatalog = {
    repos: [],
    templates: [
        {
            id: "t1",
            repoId: "r1",
            slug: "whoami",
            name: "Whoami",
            description: "A minimal whoami service",
            category: "utility",
            iconDataUri: null,
            variants: [{id: "v1", slug: "default", name: "Default", description: ""}],
        },
    ],
};

const MULTI_VARIANT_CATALOG: TemplateCatalog = {
    repos: [],
    templates: [
        {
            id: "t2",
            repoId: "r1",
            slug: "nextcloud",
            name: "Nextcloud",
            description: "A file sync platform",
            category: "productivity",
            iconDataUri: null,
            variants: [
                {id: "v1", slug: "sqlite", name: "SQLite", description: "Single container"},
                {id: "v2", slug: "postgres", name: "PostgreSQL", description: "With Postgres"},
            ],
        },
    ],
};

function baseResult(overrides: Partial<ReturnType<typeof useTemplates>> = {}): ReturnType<typeof useTemplates> {
    return {
        catalog: null,
        loading: false,
        error: null,
        refetch: vi.fn(),
        retryRepo: vi.fn(),
        ...overrides,
    };
}

function renderPage() {
    return render(
        <SidebarProvider>
            <MemoryRouter>
                <TemplateBrowsePage />
            </MemoryRouter>
        </SidebarProvider>,
    );
}

describe("TemplateBrowsePage", () => {
    beforeEach(() => {
        mockUseTemplates.mockReset();
        mockNavigate.mockReset();
        if (typeof window.matchMedia !== "function") {
            window.matchMedia = vi.fn().mockImplementation((query: string) => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            }));
        }
    });

    it("shows the first-run loading copy and skeletons while loading", () => {
        mockUseTemplates.mockReturnValue(baseResult({loading: true}));

        renderPage();

        expect(
            screen.getByText("Templates are loading for the first time — this can take a moment."),
        ).toBeVisible();
    });

    it("shows a repo sync-error alert with a working Retry", async () => {
        const retryRepo = vi.fn().mockResolvedValue(undefined);
        mockUseTemplates.mockReturnValue(
            baseResult({
                catalog: {
                    repos: [
                        {
                            id: "r1",
                            url: "https://example.com/repo.git",
                            isDefault: true,
                            headCommitSha: null,
                            lastSyncAttemptAt: "2026-01-01T00:00:00Z",
                            lastSyncedAt: null,
                            lastSyncError: "not found",
                            issues: [],
                        },
                    ],
                    templates: [],
                },
                retryRepo,
            }),
        );
        const user = userEvent.setup();

        renderPage();

        expect(screen.getByText(/Couldn't load templates from https:\/\/example.com\/repo.git/)).toBeVisible();
        await user.click(screen.getByRole("button", {name: "Retry"}));
        expect(retryRepo).toHaveBeenCalledWith("r1");
    });

    it("a single-variant template's Use Template navigates straight to that variant", async () => {
        mockUseTemplates.mockReturnValue(baseResult({catalog: SINGLE_VARIANT_CATALOG}));
        const user = userEvent.setup();

        renderPage();
        await user.click(screen.getByRole("button", {name: "Use Template"}));

        expect(mockNavigate).toHaveBeenCalledWith("/stacks/create?variant=v1");
    });

    it("a multi-variant template's Use Template opens the dialog, and choosing navigates to the chosen variant", async () => {
        mockUseTemplates.mockReturnValue(baseResult({catalog: MULTI_VARIANT_CATALOG}));
        const user = userEvent.setup();

        renderPage();
        await user.click(screen.getByRole("button", {name: "Use Template"}));

        expect(screen.getByText("Choose a configuration for Nextcloud")).toBeVisible();
        await user.click(screen.getByRole("radio", {name: "PostgreSQL"}));
        await user.click(screen.getByRole("button", {name: "Use this variant"}));

        expect(mockNavigate).toHaveBeenCalledWith("/stacks/create?variant=v2");
    });
});
