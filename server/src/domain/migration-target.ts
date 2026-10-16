import path from "node:path";

/**
 * How the directory a migration builds the new stack in relates to the
 * directory of the old stack (G-18-7):
 * - `separate`: unrelated directories; the original is only ever read.
 * - `in-place`: the very same directory (the stack already lives in Docktor's
 *   stacks folder under the same name); the original is renamed aside first.
 * - `nested`: one directory sits inside the other; always refused, because
 *   copying a directory into itself and removing the target on rollback would
 *   endanger the original (RESEARCH Pitfall 4).
 */
export type MigrationTargetKind = "separate" | "in-place" | "nested";

/** Host-native path comparison, like the overlap check this replaces, so the Windows unit job keeps passing. */
function isInside(child: string, parent: string): boolean {
    return child.startsWith(parent + path.sep);
}

export function classifyMigrationTarget(targetDir: string, originalDir: string): MigrationTargetKind {
    const target = path.resolve(targetDir);
    const original = path.resolve(originalDir);
    if (target === original) {
        return "in-place";
    }
    if (isInside(target, original) || isInside(original, target)) {
        return "nested";
    }
    return "separate";
}

/**
 * Directory names to try, in order, when renaming the original of an in-place
 * migration aside: `<id>-pre-migration`, then `<id>-pre-migration-2`, ...
 */
export function asideNameCandidates(stackId: string, limit: number): string[] {
    const base = `${stackId}-pre-migration`;
    return Array.from({length: Math.max(0, limit)}, (_, index) => (index === 0 ? base : `${base}-${index + 1}`));
}
