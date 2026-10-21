import {describe, expect, it} from "vitest";
import {render, screen, within} from "@testing-library/react";
import {MemoryRouter} from "react-router";

import {StackBreadcrumb, type StackBreadcrumbProps} from "@/components/domain/stack/stack-breadcrumb";

function renderBreadcrumb(overrides: Partial<StackBreadcrumbProps> = {}) {
    return render(
        <MemoryRouter>
            <StackBreadcrumb stackId="my-app" stackName="My App" current="Config" {...overrides} />
        </MemoryRouter>,
    );
}

describe("StackBreadcrumb", () => {
    it("links the stack name to the overview and marks the tab as the current page (UI-09, D-12)", () => {
        renderBreadcrumb();
        const nav = within(screen.getByLabelText("breadcrumb"));

        expect(nav.getByRole("link", {name: "Stacks"})).toHaveAttribute("href", "/stacks");
        expect(nav.getByRole("link", {name: "My App"})).toHaveAttribute("href", "/stacks/my-app");
        expect(nav.getByText("Config")).toHaveAttribute("aria-current", "page");
        expect(nav.queryByRole("link", {name: "Config"})).not.toBeInTheDocument();
        for (const link of nav.getAllByRole("link")) {
            expect(link).not.toHaveAttribute("href", "/stacks/my-app/config");
        }
    });

    it("keeps the stack link pointing at the overview when the overview is current", () => {
        renderBreadcrumb({current: "Overview"});
        const nav = within(screen.getByLabelText("breadcrumb"));

        expect(nav.getByRole("link", {name: "My App"})).toHaveAttribute("href", "/stacks/my-app");
        expect(nav.getByText("Overview")).toHaveAttribute("aria-current", "page");
    });

    it("renders trail crumbs between the stack name and the current page", () => {
        renderBreadcrumb({
            trail: [{label: "Backups", to: "/stacks/my-app/backups"}],
            current: "Backup 1a2b3c4d",
        });
        const nav = within(screen.getByLabelText("breadcrumb"));

        expect(nav.getAllByRole("link").map((link) => link.textContent)).toEqual(["Stacks", "My App", "Backups"]);
        expect(nav.getByRole("link", {name: "Backups"})).toHaveAttribute("href", "/stacks/my-app/backups");
        expect(nav.getByText("Backup 1a2b3c4d")).toHaveAttribute("aria-current", "page");
    });

    it("truncates a long stack name with the full name in its title, never the current page", () => {
        const longName = "x".repeat(70);
        renderBreadcrumb({stackName: longName});
        const nav = within(screen.getByLabelText("breadcrumb"));

        const stackLink = nav.getByRole("link", {name: longName});
        expect(stackLink).toHaveAttribute("title", longName);
        expect(stackLink.classList.contains("truncate")).toBe(true);
        expect(nav.getByText("Config").classList.contains("truncate")).toBe(false);
    });
});
