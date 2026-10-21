import {describe, expect, it} from "vitest";
import {isNavItemActive, NAV_SECTIONS} from "@/lib/sidebar-nav";

const ALL_TARGETS = NAV_SECTIONS.flatMap((section) => section.items.map((item) => item.to));

describe("NAV_SECTIONS (UI-06, D-01)", () => {
    it("labels the sections Platform then System", () => {
        expect(NAV_SECTIONS.map((section) => section.label)).toEqual(["Platform", "System"]);
    });

    it("orders the Platform entries Dashboard, Stacks, Templates", () => {
        expect(NAV_SECTIONS[0].items.map((item) => [item.label, item.to])).toEqual([
            ["Dashboard", "/"],
            ["Stacks", "/stacks"],
            ["Templates", "/templates"],
        ]);
    });

    it("orders the System entries Storage, Settings", () => {
        expect(NAV_SECTIONS[1].items.map((item) => [item.label, item.to])).toEqual([
            ["Storage", "/storage"],
            ["Settings", "/settings"],
        ]);
    });

    it("gives every entry an icon", () => {
        for (const section of NAV_SECTIONS) {
            for (const item of section.items) {
                expect(item.icon).toBeTruthy();
            }
        }
    });
});

describe("isNavItemActive (D-03)", () => {
    it.each<[string, string[]]>([
        ["/", ["/"]],
        ["/stacks", ["/stacks"]],
        ["/stacks/abc", ["/stacks"]],
        ["/stacks/abc/backups", ["/stacks"]],
        ["/stacks/abc/backups/xyz", ["/stacks"]],
        ["/stacks/create", ["/stacks"]],
        ["/stacks/import", ["/stacks"]],
        ["/stacks/create/templates", ["/stacks"]],
        ["/stacks/", ["/stacks"]],
        ["/templates", ["/templates"]],
        ["/storage", ["/storage"]],
        ["/settings", ["/settings"]],
        ["/settings/general", ["/settings"]],
        ["/settings/stacks", ["/settings"]],
        ["/stacks-foo", []],
        ["/account", []],
    ])("highlights %s -> %j", (pathname, expected) => {
        expect(ALL_TARGETS.filter((to) => isNavItemActive(pathname, to))).toEqual(expected);
    });
});
