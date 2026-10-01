import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";
import {ThemeProvider} from "@/components/common/theme-provider";
import {Page, PageHeader, PageTitle} from "@/components/common/layout/page";
import {SidebarProvider} from "@/components/ui/sidebar";

// jsdom has no ResizeObserver — Radix's DropdownMenu.Content (rendered by
// ThemeToggle, itself rendered by PageHeader) positioning internals require
// one (same pattern as stack-actions.test.tsx / theme-toggle.test.tsx).
if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}

function renderPage() {
    return render(
        <ThemeProvider>
            <SidebarProvider>
                <Page>
                    <PageHeader breadcrumbs={<span>Home</span>}>
                        <PageTitle>Stacks</PageTitle>
                    </PageHeader>
                </Page>
            </SidebarProvider>
        </ThemeProvider>,
    );
}

describe("PageHeader (D-16)", () => {
    it("renders the 'Toggle theme' button in its top row alongside the breadcrumbs", () => {
        renderPage();

        expect(screen.getByText("Home")).toBeInTheDocument();
        expect(screen.getByText("Stacks", {selector: "h1"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Toggle theme"})).toBeInTheDocument();
    });
});

describe("PageTitle typography", () => {
    it("uses font-semibold, not font-bold", () => {
        renderPage();

        expect(screen.getByText("Stacks", {selector: "h1"})).toHaveClass("font-semibold");
        expect(screen.getByText("Stacks", {selector: "h1"})).not.toHaveClass("font-bold");
    });
});
