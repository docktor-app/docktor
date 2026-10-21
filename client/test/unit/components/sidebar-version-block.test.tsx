import {describe, expect, it} from "vitest";
import {render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {SidebarVersionBlock} from "@/components/sidebar-version-block";
import {SidebarProvider} from "@/components/ui/sidebar";

if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}

const LINKS = {github: "https://example.com/gh", docs: "https://example.com/docs"};

function renderBlock(version: string, defaultOpen = true) {
    return render(
        <SidebarProvider defaultOpen={defaultOpen}>
            <SidebarVersionBlock version={version} links={LINKS}/>
        </SidebarProvider>,
    );
}

function aboutGroup(): HTMLElement {
    return screen.getByRole("group", {name: "About Docktor"});
}

function expectExternal(link: HTMLElement, href: string): void {
    expect(link).toHaveAttribute("href", href);
    expect(link).toHaveAttribute("target", "_blank");
    const rel = (link.getAttribute("rel") ?? "").split(/\s+/);
    expect(rel).toContain("noopener");
    expect(rel).toContain("noreferrer");
}

describe("SidebarVersionBlock expanded row (UI-01)", () => {
    it("shows the version, its full label as title and 32px/44px link buttons", () => {
        renderBlock("1.2.3");

        const group = aboutGroup();
        const text = within(group).getByText("v1.2.3");
        expect(text).toHaveAttribute("title", "Docktor v1.2.3");
        expect(text).toHaveClass("min-w-0", "truncate", "font-mono", "tabular-nums");
        expect(group).toHaveClass("group-data-[collapsible=icon]:hidden");

        const github = within(group).getByRole("link", {name: "Docktor on GitHub (opens in a new tab)"});
        const docs = within(group).getByRole("link", {name: "Docktor documentation (opens in a new tab)"});
        expectExternal(github, LINKS.github);
        expectExternal(docs, LINKS.docs);
        expect(github).toHaveClass("size-8", "max-md:size-11");
        expect(docs).toHaveClass("size-8", "max-md:size-11");
    });

    it("falls back to the bare product name when the version is empty", () => {
        renderBlock("");

        const group = aboutGroup();
        const text = within(group).getByText("Docktor");
        expect(text).toHaveAttribute("title", "Docktor");
        const startsWithV = Array.from(group.querySelectorAll("*")).filter((el) => el.textContent?.startsWith("v"));
        expect(startsWithV).toHaveLength(0);
    });

    it("keeps a long prerelease version inside the truncating span", () => {
        renderBlock("0.1.1-rc.1+build.20261018");

        const text = within(aboutGroup()).getByText("v0.1.1-rc.1+build.20261018");
        expect(text.parentElement).toBe(aboutGroup());
        expect(text).toHaveClass("truncate");
    });
});

describe("SidebarVersionBlock collapsed rail menu (UI-SPEC D-08)", () => {
    it("renders one Info menu button that is only displayed in the desktop rail", () => {
        renderBlock("1.2.3", false);

        const trigger = screen.getByRole("button", {name: "Docktor v1.2.3 links"});
        const menu = trigger.closest('[data-sidebar="menu"]');
        expect(menu).toHaveClass("hidden", "group-data-[collapsible=icon]:flex");
    });

    it("shows the product label in a tooltip on hover", async () => {
        const user = userEvent.setup();
        renderBlock("1.2.3", false);

        await user.hover(screen.getByRole("button", {name: "Docktor v1.2.3 links"}));

        expect(await screen.findByRole("tooltip")).toHaveTextContent(/^Docktor v1\.2\.3$/);
    });

    it("opens the version and both links on click", async () => {
        const user = userEvent.setup();
        renderBlock("1.2.3", false);

        await user.click(screen.getByRole("button", {name: "Docktor v1.2.3 links"}));

        const items = await screen.findAllByRole("menuitem");
        expect(items.map((item) => item.getAttribute("aria-label"))).toEqual([
            "Docktor on GitHub (opens in a new tab)",
            "Docktor documentation (opens in a new tab)",
        ]);
        expectExternal(items[0], LINKS.github);
        expectExternal(items[1], LINKS.docs);
        expect(items[0]).toHaveTextContent("GitHub");
        expect(items[1]).toHaveTextContent("Documentation");
        expect(screen.getByRole("menu")).toHaveTextContent("Docktor v1.2.3");
        expect(within(screen.getByRole("menu")).getByText("Docktor v1.2.3")).toHaveClass("font-mono");
    });

    it("opens by keyboard and closes with Escape", async () => {
        const user = userEvent.setup();
        renderBlock("1.2.3", false);
        const trigger = screen.getByRole("button", {name: "Docktor v1.2.3 links"});

        await user.click(trigger);
        expect(await screen.findAllByRole("menuitem")).toHaveLength(2);

        await user.keyboard("{Escape}");
        await waitFor(() => expect(screen.queryAllByRole("menuitem")).toHaveLength(0));

        trigger.focus();
        await user.keyboard("{Enter}");
        expect(await screen.findAllByRole("menuitem")).toHaveLength(2);
    });

    it("drops the version from the trigger name and menu label when it is empty", async () => {
        const user = userEvent.setup();
        renderBlock("", false);

        await user.click(screen.getByRole("button", {name: "Docktor links"}));

        const menu = await screen.findByRole("menu");
        expect(within(menu).getByText("Docktor")).toBeInTheDocument();
    });
});
