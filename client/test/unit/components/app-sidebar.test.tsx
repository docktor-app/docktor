import {afterEach, describe, expect, it, vi} from "vitest";
import {render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter, Route, Routes} from "react-router";
import {AppSidebar} from "@/components/app-sidebar";
import {SidebarProvider} from "@/components/ui/sidebar";

vi.mock("@/lib/auth-client", () => ({
    signOut: vi.fn(),
    useSession: () => ({data: {user: {name: "Ada Lovelace", email: "ada@example.com"}}}),
}));

if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}

function renderSidebar(path: string, defaultOpen = true) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <SidebarProvider defaultOpen={defaultOpen}>
                <AppSidebar/>
            </SidebarProvider>
        </MemoryRouter>,
    );
}

function navLinks(container: HTMLElement): HTMLAnchorElement[] {
    return Array.from(container.querySelectorAll<HTMLAnchorElement>('[data-sidebar="group"] a'));
}

describe("AppSidebar sections (UI-06)", () => {
    it("renders labelled Platform and System sections with the nav entries in order", () => {
        const {container} = renderSidebar("/stacks/abc/backups/xyz");

        const labels = Array.from(container.querySelectorAll('[data-sidebar="group-label"]'));
        expect(labels.map((label) => label.textContent)).toEqual(["Platform", "System"]);

        const links = navLinks(container);
        expect(links.map((link) => link.textContent)).toEqual([
            "Dashboard",
            "Stacks",
            "Templates",
            "Storage",
            "Settings",
        ]);
        expect(links.map((link) => link.getAttribute("href"))).toEqual([
            "/",
            "/stacks",
            "/templates",
            "/storage",
            "/settings",
        ]);
    });

    it("keeps only Stacks highlighted on a nested stack route", () => {
        const {container} = renderSidebar("/stacks/abc/backups/xyz");

        const links = navLinks(container);
        for (const link of links) {
            if (link.textContent === "Stacks") {
                expect(link).toHaveAttribute("aria-current", "page");
                expect(link).toHaveAttribute("data-active", "true");
            } else {
                expect(link).not.toHaveAttribute("aria-current");
            }
        }
    });

    it("highlights only Templates on /templates", () => {
        const {container} = renderSidebar("/templates");

        const current = navLinks(container).filter((link) => link.hasAttribute("aria-current"));
        expect(current.map((link) => link.textContent)).toEqual(["Templates"]);
    });

    it("highlights nothing on a route outside the nav", () => {
        const {container} = renderSidebar("/account");

        expect(navLinks(container).some((link) => link.hasAttribute("aria-current"))).toBe(false);
    });
});

describe("AppSidebar icon rail (UI-SPEC D-02)", () => {
    it("collapses to the icon rail when the provider starts closed", () => {
        const {container} = renderSidebar("/", false);

        const sidebar = container.querySelector('[data-slot="sidebar"]');
        expect(sidebar).toHaveAttribute("data-state", "collapsed");
        expect(sidebar).toHaveAttribute("data-collapsible", "icon");
    });

    it("shows the entry label in a tooltip on hover", async () => {
        const user = userEvent.setup();
        renderSidebar("/", false);

        await user.hover(screen.getByRole("link", {name: "Stacks"}));

        const tooltip = await screen.findByRole("tooltip");
        expect(tooltip).toHaveTextContent(/^Stacks$/);
    });

    it("has no collapsible marker while expanded", () => {
        const {container} = renderSidebar("/");

        expect(container.querySelector('[data-slot="sidebar"]')).toHaveAttribute("data-collapsible", "");
    });

    it("swaps the full logo for the mark in the rail", () => {
        renderSidebar("/");

        const images = screen.getAllByRole("img", {name: "Docktor"});
        expect(images).toHaveLength(4);
        expect(images[0].parentElement).toHaveClass("group-data-[collapsible=icon]:hidden");
        expect(images[2].parentElement).toHaveClass("hidden", "group-data-[collapsible=icon]:block");
        expect(images[2]).toHaveClass("size-8");
    });
});

describe("AppSidebar mobile sheet (UI-SPEC D-09)", () => {
    const originalWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");

    afterEach(() => {
        if (originalWidth) {
            Object.defineProperty(window, "innerWidth", originalWidth);
        }
    });

    it("closes the sheet after following an internal nav link", async () => {
        Object.defineProperty(window, "innerWidth", {configurable: true, value: 500});
        const user = userEvent.setup();
        render(
            <MemoryRouter initialEntries={["/"]}>
                <SidebarProvider>
                    <AppSidebar/>
                    <Routes>
                        <Route path="/" element={<p>Home page</p>}/>
                        <Route path="/stacks" element={<p>Stacks page</p>}/>
                    </Routes>
                </SidebarProvider>
            </MemoryRouter>,
        );

        await user.keyboard("{Control>}b{/Control}");
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByText("Platform")).toBeInTheDocument();
        expect(within(dialog).getByText("System")).toBeInTheDocument();
        expect(within(dialog).getByRole("link", {name: "Templates"})).toBeInTheDocument();

        await user.click(within(dialog).getByRole("link", {name: "Stacks"}));

        expect(await screen.findByText("Stacks page")).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });
});
