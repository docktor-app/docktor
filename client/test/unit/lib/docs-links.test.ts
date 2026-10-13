import {describe, expect, it} from "vitest";
import {buildDocsUrl, DOCS_BASE_URL, docsUrl} from "@/lib/docs-links";

describe("buildDocsUrl (#7, D-13)", () => {
    it("joins base, page and anchor for the hosted site style", () => {
        expect(buildDocsUrl("site", "https://docs.example.com", "reference/deployment", "startup-checks")).toBe(
            "https://docs.example.com/reference/deployment#startup-checks",
        );
    });

    it("links the markdown file on GitHub for the github style", () => {
        expect(
            buildDocsUrl("github", "https://github.com/docktor-app/docks/blob/main", "reference/deployment", "startup-checks"),
        ).toBe("https://github.com/docktor-app/docks/blob/main/reference/deployment.md#startup-checks");
    });

    it("appends no # when there is no anchor", () => {
        expect(buildDocsUrl("site", "https://docs.example.com", "security")).toBe("https://docs.example.com/security");
        expect(buildDocsUrl("github", "https://github.com/docktor-app/docks/blob/main", "security")).toBe(
            "https://github.com/docktor-app/docks/blob/main/security.md",
        );
    });
});

describe("docsUrl", () => {
    it("builds on DOCS_BASE_URL and keeps the page and anchor", () => {
        const url = docsUrl("reference/deployment", "startup-checks");

        expect(url.startsWith(DOCS_BASE_URL)).toBe(true);
        expect(url).toContain("reference/deployment");
        expect(url.endsWith("#startup-checks")).toBe(true);
    });

    it("has no fragment without an anchor", () => {
        expect(docsUrl("security")).not.toContain("#");
    });
});
