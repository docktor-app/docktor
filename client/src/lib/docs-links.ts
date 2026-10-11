// Single place the docs URL scheme lives in the client (#7, D-13; Phase 16).
// The scheme is decided in 16-02-SUMMARY.md "Release inputs": until a docs site
// is hosted, links point at the markdown files in docktor-app/docks on GitHub
// ("github"). Once a site exists, set DOCS_LINK_STYLE to "site" and
// DOCS_BASE_URL to the site origin; every in-app docs link follows.

export type DocsLinkStyle = "site" | "github";

export type DocsPage =
    | "guide/get-started"
    | "reference/deployment"
    | "reference/templates"
    | "security"
    | "features/stacks"
    | "features/templates"
    | "features/backups"
    | "features/proxy"
    | "features/import"
    | "features/updates"
    | "features/health"
    | "features/account-security";

const DOCS_LINK_STYLE: DocsLinkStyle = "github";

export const DOCS_BASE_URL = "https://github.com/docktor-app/docks/blob/main";

/**
 * Pure URL builder, separated from the module-level constants so both styles
 * stay testable while only one is active.
 */
export function buildDocsUrl(style: DocsLinkStyle, base: string, page: DocsPage, anchor?: string): string {
    const path = style === "github" ? `${page}.md` : page;
    const fragment = anchor ? `#${anchor}` : "";
    return `${base}/${path}${fragment}`;
}

export function docsUrl(page: DocsPage, anchor?: string): string {
    return buildDocsUrl(DOCS_LINK_STYLE, DOCS_BASE_URL, page, anchor);
}
