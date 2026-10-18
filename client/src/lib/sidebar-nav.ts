// Single source of the sidebar's section labels, order and items (UI-SPEC D-01, #93).
// Pure module: no React, so the active-state rules can be tested as a table.
import {HardDrive, Layers, LayoutDashboard, LayoutTemplate, Settings, type LucideIcon} from "lucide-react";

export interface NavItem {
    readonly to: string;
    readonly label: string;
    readonly icon: LucideIcon;
}

export interface NavSection {
    readonly label: string;
    readonly items: ReadonlyArray<NavItem>;
}

export const NAV_SECTIONS: ReadonlyArray<NavSection> = [
    {
        label: "Platform",
        items: [
            {to: "/", label: "Dashboard", icon: LayoutDashboard},
            {to: "/stacks", label: "Stacks", icon: Layers},
            {to: "/templates", label: "Templates", icon: LayoutTemplate},
        ],
    },
    {
        label: "System",
        items: [
            {to: "/storage", label: "Storage", icon: HardDrive},
            {to: "/settings", label: "Settings", icon: Settings},
        ],
    },
];

function stripTrailingSlashes(pathname: string): string {
    let end = pathname.length;
    while (end > 0 && pathname[end - 1] === "/") {
        end -= 1;
    }
    return end === 0 ? "/" : pathname.slice(0, end);
}

/**
 * Whether the nav entry targeting `to` is the highlighted one for `pathname`.
 *
 * Trailing slashes are stripped from the pathname (an empty result becomes "/").
 * "/" is active only for exactly "/". Any other entry is active when the
 * normalised pathname equals `to` or begins with `to` followed by "/", so a
 * sibling such as /stacks-foo never matches and /templates never lights Stacks.
 * The query string never reaches this function (`useLocation().pathname`
 * excludes it).
 */
export function isNavItemActive(pathname: string, to: string): boolean {
    const normalised = stripTrailingSlashes(pathname);
    if (to === "/") {
        return normalised === "/";
    }
    return normalised === to || normalised.startsWith(`${to}/`);
}
