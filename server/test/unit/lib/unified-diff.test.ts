import {describe, expect, it} from "vitest";
import {computeUnifiedDiff} from "../../../src/lib/unified-diff.js";

describe("computeUnifiedDiff", () => {
    it("produces one hunk with context/removed/added lines and correct old/new line numbers", () => {
        const result = computeUnifiedDiff("a\nb\nc\n", "a\nB\nc\n");

        expect(result.hunks).toHaveLength(1);
        expect(result.added).toBe(1);
        expect(result.removed).toBe(1);

        const lines = result.hunks[0]!.lines;
        expect(lines).toContainEqual({kind: "context", text: "a", oldLine: 1, newLine: 1});
        expect(lines).toContainEqual({kind: "removed", text: "b", oldLine: 2, newLine: null});
        expect(lines).toContainEqual({kind: "added", text: "B", oldLine: null, newLine: 2});
        expect(lines).toContainEqual({kind: "context", text: "c", oldLine: 3, newLine: 3});
    });

    it("returns the empty diff for identical content", () => {
        expect(computeUnifiedDiff("same\n", "same\n")).toEqual({hunks: [], added: 0, removed: 0});
    });

    it("returns the empty diff for identical empty strings", () => {
        expect(computeUnifiedDiff("", "")).toEqual({hunks: [], added: 0, removed: 0});
    });

    it("produces a single all-added hunk when going from empty to non-empty, with no no-newline marker line", () => {
        const result = computeUnifiedDiff("", "services:\n");

        expect(result.hunks).toHaveLength(1);
        const lines = result.hunks[0]!.lines;
        expect(lines.length).toBeGreaterThan(0);
        for (const line of lines) {
            expect(line.kind).toBe("added");
            expect(line.text.startsWith("\\")).toBe(false);
            expect(line.text).not.toContain("No newline at end of file");
        }
    });

    it("never includes a '\\\\ No newline at end of file' marker as a rendered line", () => {
        const result = computeUnifiedDiff("a", "a\nb");

        for (const hunk of result.hunks) {
            for (const line of hunk.lines) {
                expect(line.text.startsWith("\\")).toBe(false);
            }
        }
    });

    it("respects a custom contextLines value", () => {
        const before = Array.from({length: 10}, (_, i) => `line${i}`).join("\n") + "\n";
        const afterLines = Array.from({length: 10}, (_, i) => `line${i}`);
        afterLines[5] = "CHANGED";
        const after = afterLines.join("\n") + "\n";

        const withZeroContext = computeUnifiedDiff(before, after, 0);
        const withDefaultContext = computeUnifiedDiff(before, after);

        const zeroContextLineCount = withZeroContext.hunks[0]!.lines.filter((l) => l.kind === "context").length;
        const defaultContextLineCount = withDefaultContext.hunks[0]!.lines.filter((l) => l.kind === "context").length;

        expect(zeroContextLineCount).toBe(0);
        expect(defaultContextLineCount).toBeGreaterThan(0);
    });
});
