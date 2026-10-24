import {describe, expect, it} from "vitest";

import {
    displaySecretLine,
    displaySecretText,
    hunksHaveSecret,
    maskDiffHunks,
    SECRET_MASK,
} from "@/lib/secret-mask";
import type {UnifiedDiffHunk, UnifiedDiffLine} from "@/components/common/unified-diff-view";

function line(kind: UnifiedDiffLine["kind"], text: string, n: number): UnifiedDiffLine {
    return {
        kind,
        text,
        oldLine: kind === "added" ? null : n,
        newLine: kind === "removed" ? null : n,
    };
}

function hunk(lines: UnifiedDiffLine[]): UnifiedDiffHunk {
    return {oldStart: 1, oldLines: lines.length, newStart: 1, newLines: lines.length, lines};
}

describe("secret-mask", () => {
    it("exposes the eight-bullet mask", () => {
        expect(SECRET_MASK).toBe("••••••••");
    });

    describe("displaySecretLine", () => {
        it("masks the value of a secret-looking key", () => {
            expect(displaySecretLine("DB_PASSWORD=hunter2", false)).toBe("DB_PASSWORD=••••••••");
        });

        it("keeps an export prefix when masking", () => {
            expect(displaySecretLine("export API_TOKEN=abc", false)).toBe("export API_TOKEN=••••••••");
        });

        it("leaves a non-secret key untouched", () => {
            expect(displaySecretLine("PORT=8080", false)).toBe("PORT=8080");
        });

        it("leaves a comment untouched even if it mentions a secret key", () => {
            expect(displaySecretLine("# SECRET=x comment", false)).toBe("# SECRET=x comment");
        });

        it("returns the line unchanged when secrets are revealed", () => {
            expect(displaySecretLine("DB_PASSWORD=hunter2", true)).toBe("DB_PASSWORD=hunter2");
        });
    });

    describe("displaySecretText", () => {
        it("masks line by line and preserves blank lines", () => {
            expect(displaySecretText("DB_PASSWORD=hunter2\nPORT=8080\n\nAPI_KEY=k", false)).toBe(
                "DB_PASSWORD=••••••••\nPORT=8080\n\nAPI_KEY=••••••••",
            );
        });

        it("returns the content unchanged when secrets are revealed", () => {
            const content = "DB_PASSWORD=hunter2\nPORT=8080";
            expect(displaySecretText(content, true)).toBe(content);
        });
    });

    describe("maskDiffHunks", () => {
        const removed = line("removed", "      POSTGRES_PASSWORD: hunter2", 3);
        const added = line("added", "      - DATABASE_URL=postgres://app:s3cret@db/app", 3);
        const context = line("context", "    image: postgres", 2);
        const hunks = [hunk([context, removed, added])];

        it("masks removed and added secret lines and keeps the other line objects identical", () => {
            const masked = maskDiffHunks(hunks, false);

            expect(masked[0]!.lines[0]).toBe(context);
            expect(masked[0]!.lines[1]).toEqual({...removed, text: "      POSTGRES_PASSWORD: ••••••••"});
            expect(masked[0]!.lines[2]).toEqual({
                ...added,
                text: "      - DATABASE_URL=postgres://app:••••••••@db/app",
            });
        });

        it("returns the hunks unchanged when secrets are revealed", () => {
            expect(maskDiffHunks(hunks, true)).toBe(hunks);
        });
    });

    describe("hunksHaveSecret", () => {
        it("is true when any line carries a secret", () => {
            expect(hunksHaveSecret([hunk([line("added", "      - API_KEY=x", 1)])])).toBe(true);
        });

        it("is false when no line carries a secret", () => {
            expect(hunksHaveSecret([hunk([line("added", "      - PORT=1", 1)])])).toBe(false);
            expect(hunksHaveSecret([])).toBe(false);
        });
    });
});
