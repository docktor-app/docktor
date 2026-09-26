// D-01/D-02: the stack detail page's tab set — Compose and Environment are
// merged into a single Config tab (see routes/app/stacks/components/config-tab.tsx).
export const STACK_TABS = ["overview", "config", "logs", "backups", "proxy"] as const;

export type StackTab = (typeof STACK_TABS)[number];

export const STACK_TAB_LABELS: Record<StackTab, string> = {
    overview: "Overview",
    config: "Config",
    logs: "Logs",
    backups: "Backups",
    proxy: "Proxy",
};

// Bookmarks/links to the old /compose and /environment tabs must keep
// working — they redirect (history replace) to /config rather than 404ing
// or silently falling back to Overview.
export const LEGACY_STACK_TAB_ALIASES = {
    compose: "config",
    environment: "config",
} as const;

export type StackTabResolution =
    | {readonly kind: "tab"; readonly tab: StackTab}
    | {readonly kind: "redirect"; readonly tab: StackTab};

function isStackTab(value: string): value is StackTab {
    return (STACK_TABS as readonly string[]).includes(value);
}

function isLegacyStackTabAlias(value: string): value is keyof typeof LEGACY_STACK_TAB_ALIASES {
    return Object.prototype.hasOwnProperty.call(LEGACY_STACK_TAB_ALIASES, value);
}

// Resolves the `:tab` route param into either the tab to render, or a
// redirect target when the param is a legacy alias. An undefined or unknown
// tab falls back to "overview" — matching the page's pre-existing behaviour.
export function resolveStackTab(tab: string | undefined): StackTabResolution {
    if (tab !== undefined && isLegacyStackTabAlias(tab)) {
        return {kind: "redirect", tab: LEGACY_STACK_TAB_ALIASES[tab]};
    }
    if (tab !== undefined && isStackTab(tab)) {
        return {kind: "tab", tab};
    }
    return {kind: "tab", tab: "overview"};
}
