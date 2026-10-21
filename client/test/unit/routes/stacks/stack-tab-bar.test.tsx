import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";
import {Tabs} from "@/components/ui/tabs";
import {StackTabBar} from "../../../../src/routes/app/stacks/components/stack-tab-bar";

const WRAPPER_TOKENS = [
    "-mx-1",
    "-my-1",
    "overflow-x-auto",
    "overflow-y-hidden",
    "px-1",
    "py-1",
    "[scrollbar-width:none]",
    "[&::-webkit-scrollbar]:hidden",
];

describe("StackTabBar (UI-04, D-10)", () => {
    it("wraps the tablist in a scrollbar-free, swipeable container", () => {
        render(
            <Tabs value="config">
                <StackTabBar activeTab="config" />
            </Tabs>,
        );

        const tablist = screen.getByRole("tablist");
        const wrapper = tablist.parentElement;
        expect(wrapper).not.toBeNull();
        for (const token of WRAPPER_TOKENS) {
            expect(wrapper).toHaveClass(token);
        }
        expect(tablist).toHaveClass("w-max");
    });

    it("renders the five tabs in order with the active one selected", () => {
        render(
            <Tabs value="config">
                <StackTabBar activeTab="config" />
            </Tabs>,
        );

        const tabs = screen.getAllByRole("tab");
        expect(tabs.map((tab) => tab.textContent)).toEqual([
            "Overview",
            "Config",
            "Logs",
            "Backups",
            "Proxy",
        ]);
        expect(screen.getByRole("tab", {name: "Config"})).toHaveAttribute("aria-selected", "true");
    });
});
