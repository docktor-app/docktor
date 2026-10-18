import {describe, expect, it, vi} from "vitest";
import {render} from "@testing-library/react";
import {MemoryRouter} from "react-router";
import {AppSidebar} from "@/components/app-sidebar";
import {SidebarProvider} from "@/components/ui/sidebar";

vi.mock("@/lib/auth-client", () => ({
    signOut: vi.fn(),
    useSession: () => ({data: {user: {name: "Ada Lovelace", email: "ada@example.com"}}}),
}));

function renderSidebar(path: string) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <SidebarProvider>
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
