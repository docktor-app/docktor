import {describe, expect, it} from "vitest";
import {DOCS_HOME_URL, GITHUB_URL, PROJECT_LINKS} from "@/lib/project-links";

describe("project links (UI-01, D-03)", () => {
    it("points GitHub at the docktor repository", () => {
        expect(GITHUB_URL).toBe("https://github.com/docktor-app/docktor");
    });

    it("points documentation at the hosted docs site", () => {
        expect(DOCS_HOME_URL).toBe("https://getdocktor.dev");
    });

    it("bundles both links for the sidebar", () => {
        expect(PROJECT_LINKS).toEqual({github: GITHUB_URL, docs: DOCS_HOME_URL});
    });
});
