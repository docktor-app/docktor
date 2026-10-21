import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter, Route, Routes} from "react-router";
import TemplateBrowsePage from "@/routes/app/stacks/templates";
import {AppSidebar} from "@/components/app-sidebar";
import {SidebarProvider} from "@/components/ui/sidebar";
import {useTemplates} from "@/hooks/use-templates";
import type {TemplateCatalog} from "@/lib/templates-api";

vi.mock("@/hooks/use-templates", () => ({
    useTemplates: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
    signOut: vi.fn(),
    useSession: () => ({data: {user: {name: "Ada Lovelace", email: "ada@example.com"}}}),
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

const CATALOG_DESCRIPTION = "Browse the catalog and start a stack from a ready-made template.";

function renderPage(path = "/") {
    return render(
        <SidebarProvider>
            <MemoryRouter initialEntries={[path]}>
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

    describe("per-path header (UI-07, UI-SPEC D-04)", () => {
        it("at /templates shows the catalog title, single breadcrumb and description", () => {
            mockUseTemplates.mockReturnValue(baseResult({catalog: SINGLE_VARIANT_CATALOG}));

            const {container} = renderPage("/templates");

            expect(screen.getByRole("heading", {level: 1, name: "Templates"})).toBeVisible();
            expect(container.querySelector('[data-slot="breadcrumb-page"]')).toHaveTextContent("Templates");
            expect(screen.queryByRole("link", {name: "Create"})).not.toBeInTheDocument();
            expect(screen.queryByRole("link", {name: "Stacks"})).not.toBeInTheDocument();
            expect(screen.getByText(CATALOG_DESCRIPTION)).toBeVisible();
        });

        it("at /stacks/create/templates keeps the create-flow title and breadcrumb", () => {
            mockUseTemplates.mockReturnValue(baseResult({catalog: SINGLE_VARIANT_CATALOG}));

            renderPage("/stacks/create/templates");

            expect(screen.getByRole("heading", {level: 1, name: "Start from a Template"})).toBeVisible();
            expect(screen.getByRole("link", {name: "Stacks"})).toHaveAttribute("href", "/stacks");
            expect(screen.getByRole("link", {name: "Create"})).toHaveAttribute("href", "/stacks/create");
            expect(screen.queryByText(CATALOG_DESCRIPTION)).not.toBeInTheDocument();
        });

        it.each(["/templates", "/stacks/create/templates"])(
            "Use Template at %s navigates to the create flow with the variant",
            async (path) => {
                mockUseTemplates.mockReturnValue(baseResult({catalog: SINGLE_VARIANT_CATALOG}));
                const user = userEvent.setup();

                renderPage(path);
                await user.click(screen.getByRole("button", {name: "Use Template"}));

                expect(mockNavigate).toHaveBeenCalledWith("/stacks/create?variant=v1");
            },
        );
    });

    it("journey: the sidebar Templates entry opens the catalog and Use Template starts the create flow", async () => {
        mockUseTemplates.mockReturnValue(baseResult({catalog: SINGLE_VARIANT_CATALOG}));
        const user = userEvent.setup();

        render(
            <MemoryRouter initialEntries={["/stacks"]}>
                <SidebarProvider>
                    <AppSidebar />
                    <Routes>
                        <Route path="/stacks" element={<p>Stacks page</p>} />
                        <Route path="/templates" element={<TemplateBrowsePage />} />
                    </Routes>
                </SidebarProvider>
            </MemoryRouter>,
        );
        expect(screen.getByText("Stacks page")).toBeVisible();

        await user.click(screen.getByRole("link", {name: "Templates"}));

        expect(await screen.findByRole("heading", {level: 1, name: "Templates"})).toBeVisible();
        expect(screen.getByRole("link", {name: "Templates"})).toHaveAttribute("aria-current", "page");
        expect(screen.getByRole("link", {name: "Stacks"})).not.toHaveAttribute("aria-current");

        await user.click(screen.getByRole("button", {name: "Use Template"}));
        expect(mockNavigate).toHaveBeenCalledWith("/stacks/create?variant=v1");
    });

    describe("catalog states (UI-SPEC empty / loading / error)", () => {
        const FAILED_REPO = {
            id: "r1",
            url: "https://example.com/repo.git",
            isDefault: true,
            headCommitSha: null,
            lastSyncAttemptAt: "2026-01-01T00:00:00Z",
            lastSyncedAt: null,
            lastSyncError: "not found",
            issues: [],
        };

        it.each(["/templates", "/stacks/create/templates"])(
            "an empty catalog at %s shows No templates available with Settings and blank-compose links",
            (path) => {
                mockUseTemplates.mockReturnValue(baseResult({catalog: {repos: [], templates: []}}));

                renderPage(path);

                expect(screen.getByRole("heading", {level: 3, name: "No templates available"})).toBeVisible();
                expect(screen.getByRole("link", {name: "Settings"})).toHaveAttribute("href", "/settings/stacks");
                expect(screen.getByRole("link", {name: "start from a blank compose file"})).toHaveAttribute(
                    "href",
                    "/stacks/create",
                );
                expect(screen.queryByRole("textbox", {name: "Search templates"})).not.toBeInTheDocument();
            },
        );

        it("a healthy repo with zero templates still shows No templates available", () => {
            mockUseTemplates.mockReturnValue(
                baseResult({catalog: {repos: [{...FAILED_REPO, lastSyncError: null}], templates: []}}),
            );

            renderPage("/templates");

            expect(screen.getByText("No templates available")).toBeVisible();
        });

        it("a failed repo with zero templates shows its alert instead of No templates available", () => {
            mockUseTemplates.mockReturnValue(baseResult({catalog: {repos: [FAILED_REPO], templates: []}}));

            renderPage("/templates");

            expect(screen.getByText(/Couldn't load templates from/)).toBeVisible();
            expect(screen.queryByText("No templates available")).not.toBeInTheDocument();
        });

        it("a populated catalog shows the grid and no empty state", () => {
            mockUseTemplates.mockReturnValue(baseResult({catalog: SINGLE_VARIANT_CATALOG}));

            renderPage("/templates");

            expect(screen.queryByText("No templates available")).not.toBeInTheDocument();
            expect(screen.getByText("Whoami")).toBeVisible();
            expect(screen.getByRole("textbox", {name: "Search templates"})).toBeVisible();
        });

        it("shows the first-run loading copy at /templates", () => {
            mockUseTemplates.mockReturnValue(baseResult({loading: true}));

            renderPage("/templates");

            expect(
                screen.getByText("Templates are loading for the first time — this can take a moment."),
            ).toBeVisible();
        });
    });
});
