import {structuredPatch} from "diff";

/**
 * Issue #18/D-01: the three kinds of line a GitHub-style unified diff can
 * render — unchanged context, an added (new-content-only) line, and a
 * removed (old-content-only) line.
 */
export type DiffLineKind = "context" | "added" | "removed";

export interface DiffLine {
    readonly kind: DiffLineKind;
    readonly text: string;
    readonly oldLine: number | null;
    readonly newLine: number | null;
}

export interface DiffHunk {
    readonly oldStart: number;
    readonly oldLines: number;
    readonly newStart: number;
    readonly newLines: number;
    readonly lines: readonly DiffLine[];
}

export interface UnifiedDiff {
    readonly hunks: readonly DiffHunk[];
    readonly added: number;
    readonly removed: number;
}

// GitHub's own unified-diff convention: 3 lines of context around each
// change.
export const DEFAULT_DIFF_CONTEXT_LINES = 3;

const EMPTY_DIFF: UnifiedDiff = {hunks: [], added: 0, removed: 0};

/**
 * Computes a GitHub-style unified diff between two full-file strings, pure
 * (no I/O). Short-circuits identical content to the empty diff for any
 * input, including "" (jsdiff's structuredPatch would otherwise produce
 * spurious trailing-newline hunks for some identical-content edge cases).
 */
export function computeUnifiedDiff(
    before: string,
    after: string,
    contextLines: number = DEFAULT_DIFF_CONTEXT_LINES,
): UnifiedDiff {
    if (before === after) {
        return EMPTY_DIFF;
    }

    const patch = structuredPatch("before", "after", before, after, "", "", {context: contextLines});

    let added = 0;
    let removed = 0;
    const hunks: DiffHunk[] = patch.hunks.map((hunk) => {
        let oldLine = hunk.oldStart;
        let newLine = hunk.newStart;
        const lines: DiffLine[] = [];

        for (const rawLine of hunk.lines) {
            // jsdiff emits a literal "\ No newline at end of file" marker
            // line (prefixed with a backslash) rather than a real content
            // line — it must never surface as a DiffLine.
            if (rawLine.startsWith("\\")) {
                continue;
            }

            const prefix = rawLine[0];
            const text = rawLine.slice(1);

            if (prefix === "+") {
                lines.push({kind: "added", text, oldLine: null, newLine});
                newLine += 1;
                added += 1;
            } else if (prefix === "-") {
                lines.push({kind: "removed", text, oldLine, newLine: null});
                oldLine += 1;
                removed += 1;
            } else {
                lines.push({kind: "context", text, oldLine, newLine});
                oldLine += 1;
                newLine += 1;
            }
        }

        return {
            oldStart: hunk.oldStart,
            oldLines: hunk.oldLines,
            newStart: hunk.newStart,
            newLines: hunk.newLines,
            lines,
        };
    });

    return {hunks, added, removed};
}
