import {useEffect, useRef} from "react";
import type {JSX} from "react";
import {STACK_TAB_LABELS, STACK_TABS} from "@/lib/stack-tabs";
import type {StackTab} from "@/lib/stack-tabs";
import {TabsList, TabsTrigger} from "@/components/ui/tabs";

// D-10: overflow-y-hidden plus 4px of padding contains the trigger focus ring
// and the trigger's absolutely positioned underline, so no vertical scrollbar
// appears. The horizontal scrollbar is hidden while swipe scrolling stays for
// narrow screens. The negative margins cancel the padding's layout shift.
export const STACK_TAB_BAR_WRAPPER_CLASS =
    "-mx-1 -my-1 overflow-x-auto overflow-y-hidden px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export interface StackTabBarProps {
    readonly activeTab: StackTab;
}

// Must render inside a Radix <Tabs> (TabsList/TabsTrigger need its context).
export function StackTabBar({activeTab}: Readonly<StackTabBarProps>): JSX.Element {
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // block "nearest" prevents a page-level vertical jump; scrollIntoView is
        // optional-called because jsdom does not implement it.
        wrapperRef.current
            ?.querySelector('[role="tab"][data-state="active"]')
            ?.scrollIntoView?.({inline: "nearest", block: "nearest"});
    }, [activeTab]);

    return (
        <div ref={wrapperRef} className={STACK_TAB_BAR_WRAPPER_CLASS}>
            <TabsList className="w-max">
                {STACK_TABS.map((tab) => (
                    <TabsTrigger key={tab} value={tab}>{STACK_TAB_LABELS[tab]}</TabsTrigger>
                ))}
            </TabsList>
        </div>
    );
}
