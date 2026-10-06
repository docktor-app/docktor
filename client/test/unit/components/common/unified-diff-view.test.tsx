import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";
import {UnifiedDiffView, type UnifiedDiffHunk} from "@/components/common/unified-diff-view";

const sampleHunk: UnifiedDiffHunk = {
    oldStart: 1,
    oldLines: 3,
    newStart: 1,
    newLines: 3,
    lines: [
        {kind: "context", text: "a", oldLine: 1, newLine: 1},
        {kind: "removed", text: "b", oldLine: 2, newLine: null},
        {kind: "added", text: "B", oldLine: null, newLine: 2},
        {kind: "context", text: "c", oldLine: 3, newLine: 3},
    ],
};

describe("UnifiedDiffView", () => {
    it("renders the hunk header", () => {
        render(<UnifiedDiffView hunks={[sampleHunk]} />);
        expect(screen.getByText("@@ -1,3 +1,3 @@")).toBeVisible();
    });

    it("renders a data-diff-kind row per line, with the right sign for added/removed", () => {
        const {container} = render(<UnifiedDiffView hunks={[sampleHunk]} />);

        expect(container.querySelectorAll('[data-diff-kind="context"]')).toHaveLength(2);
        expect(container.querySelector('[data-diff-kind="removed"]')).not.toBeNull();
        expect(container.querySelector('[data-diff-kind="added"]')).not.toBeNull();

        expect(container.querySelector('[data-diff-kind="removed"]')?.textContent).toContain("-");
        expect(container.querySelector('[data-diff-kind="added"]')?.textContent).toContain("+");
    });

    it("renders every line's text content", () => {
        render(<UnifiedDiffView hunks={[sampleHunk]} />);
        expect(screen.getByText("a")).toBeVisible();
        expect(screen.getByText("b")).toBeVisible();
        expect(screen.getByText("B")).toBeVisible();
        expect(screen.getByText("c")).toBeVisible();
    });

    it("renders an annotation under the right new-file line and nowhere else", () => {
        const annotations = new Map<number, React.ReactNode>([[2, <span key="a">finding here</span>]]);
        const {container} = render(<UnifiedDiffView hunks={[sampleHunk]} annotations={annotations} />);

        const annotationEl = container.querySelector('[data-diff-annotation-for="2"]');
        expect(annotationEl).not.toBeNull();
        expect(annotationEl?.textContent).toBe("finding here");
        expect(container.querySelectorAll("[data-diff-annotation-for]")).toHaveLength(1);
    });

    it("renders nothing for an empty hunk list", () => {
        const {container} = render(<UnifiedDiffView hunks={[]} />);
        expect(container.querySelector("[data-diff-kind]")).toBeNull();
    });

    it("uses the ariaLabel prop, defaulting to 'Unified diff'", () => {
        render(<UnifiedDiffView hunks={[sampleHunk]} />);
        expect(screen.getByRole("region", {name: "Unified diff"})).toBeVisible();

        render(<UnifiedDiffView hunks={[sampleHunk]} ariaLabel="Custom label" />);
        expect(screen.getByRole("region", {name: "Custom label"})).toBeVisible();
    });
});
