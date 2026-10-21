import {afterEach, describe, expect, it, vi} from "vitest";
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

    describe("scroll active tab into view", () => {
        const original = Element.prototype.scrollIntoView;

        afterEach(() => {
            Element.prototype.scrollIntoView = original;
        });

        it("scrolls the active trigger into view when the active tab changes", () => {
            const scrollIntoView = vi.fn();
            Element.prototype.scrollIntoView = scrollIntoView;

            const {rerender} = render(
                <Tabs value="overview">
                    <StackTabBar activeTab="overview" />
                </Tabs>,
            );
            expect(scrollIntoView).toHaveBeenCalledTimes(1);
            expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByRole("tab", {name: "Overview"}));
            expect(scrollIntoView).toHaveBeenLastCalledWith({inline: "nearest", block: "nearest"});

            rerender(
                <Tabs value="proxy">
                    <StackTabBar activeTab="proxy" />
                </Tabs>,
            );
            expect(scrollIntoView).toHaveBeenCalledTimes(2);
            expect(scrollIntoView.mock.contexts[1]).toBe(screen.getByRole("tab", {name: "Proxy"}));

            rerender(
                <Tabs value="proxy">
                    <StackTabBar activeTab="proxy" />
                </Tabs>,
            );
            expect(scrollIntoView).toHaveBeenCalledTimes(2);
        });

        it("does not throw when scrollIntoView is unavailable", () => {
            // @ts-expect-error jsdom may or may not implement it; simulate absence
            delete Element.prototype.scrollIntoView;

            const {rerender} = render(
                <Tabs value="overview">
                    <StackTabBar activeTab="overview" />
                </Tabs>,
            );
            expect(() =>
                rerender(
                    <Tabs value="logs">
                        <StackTabBar activeTab="logs" />
                    </Tabs>,
                ),
            ).not.toThrow();
            expect(screen.getByRole("tab", {name: "Logs"})).toHaveAttribute("aria-selected", "true");
        });
    });
});
