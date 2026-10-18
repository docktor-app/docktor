import {describe, expect, it} from "vitest";
import {render, screen, within} from "@testing-library/react";
import {SidebarVersionBlock} from "@/components/sidebar-version-block";
import {SidebarProvider} from "@/components/ui/sidebar";

const LINKS = {github: "https://example.com/gh", docs: "https://example.com/docs"};

function renderBlock(version: string) {
    return render(
        <SidebarProvider>
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
        expect(text).toHaveClass("min-w-0", "truncate");
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
