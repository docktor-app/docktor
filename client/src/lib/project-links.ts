/**
 * Sidebar project links (UI-01). The documentation link targets the hosted docs
 * site (CONTEXT D-03, superseding UI-SPEC D-07); in-app contextual docs links
 * stay in docs-links.ts (D-04).
 */
export const GITHUB_URL = "https://github.com/docktor-app/docktor";
export const DOCS_HOME_URL = "https://getdocktor.dev";

export interface ProjectLinks {
    readonly github: string;
    readonly docs: string;
}

export const PROJECT_LINKS: ProjectLinks = {github: GITHUB_URL, docs: DOCS_HOME_URL};
