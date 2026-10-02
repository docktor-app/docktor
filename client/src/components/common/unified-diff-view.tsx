import {cn} from "@/lib/utils";

// Issue #18/D-01: a generic, domain-free GitHub-style unified-diff renderer
// — structural line/hunk types local to this file rather than imported from
// a domain module, so this component has no domain knowledge of stacks,
// compose files, or .env content (CLAUDE.md common-component checklist).
export type UnifiedDiffLineKind = "context" | "added" | "removed";

export interface UnifiedDiffLine {
    readonly kind: UnifiedDiffLineKind;
    readonly text: string;
    readonly oldLine: number | null;
    readonly newLine: number | null;
}

export interface UnifiedDiffHunk {
    readonly oldStart: number;
    readonly oldLines: number;
    readonly newStart: number;
    readonly newLines: number;
    readonly lines: readonly UnifiedDiffLine[];
}

export interface UnifiedDiffViewProps {
    readonly hunks: ReadonlyArray<UnifiedDiffHunk>;
    // Consumed by 12-05: a node rendered directly under a given new-file line
    // number (e.g. a rule finding attached to the line it concerns). Keyed
    // by newLine, never rendered under a removed line (which has no
    // newLine).
    readonly annotations?: ReadonlyMap<number, React.ReactNode>;
    readonly ariaLabel?: string;
    readonly className?: string;
}

const LINE_KIND_CLASSES: Record<UnifiedDiffLineKind, string> = {
    context: "",
    added: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100",
    removed: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100",
};

const SIGN_BY_KIND: Record<UnifiedDiffLineKind, string> = {
    context: " ",
    added: "+",
    removed: "-",
};

/** Generic hunk renderer for a unified diff — no domain imports, no hooks, no fetching. */
export function UnifiedDiffView({
    hunks,
    annotations,
    ariaLabel = "Unified diff",
    className,
}: Readonly<UnifiedDiffViewProps>): React.JSX.Element {
    return (
        <div role="region" aria-label={ariaLabel} className={cn("font-mono text-xs", className)}>
            {hunks.map((hunk, hunkIndex) => (
                // eslint-disable-next-line react/no-array-index-key -- hunks have no stable id of their own
                <div key={hunkIndex}>
                    <div className="bg-muted text-muted-foreground px-2 py-1">
                        {`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`}
                    </div>
                    {hunk.lines.map((line, lineIndex) => {
                        const annotation =
                            line.kind !== "removed" && line.newLine !== null
                                ? annotations?.get(line.newLine)
                                : undefined;
                        return (
                            // eslint-disable-next-line react/no-array-index-key -- lines have no stable id of their own
                            <div key={lineIndex}>
                                <div
                                    data-diff-kind={line.kind}
                                    className={cn(
                                        "grid grid-cols-[3rem_3rem_1rem_1fr] items-start",
                                        LINE_KIND_CLASSES[line.kind],
                                    )}
                                >
                                    <span className="text-right pr-2 text-muted-foreground select-none">
                                        {line.oldLine ?? ""}
                                    </span>
                                    <span className="text-right pr-2 text-muted-foreground select-none">
                                        {line.newLine ?? ""}
                                    </span>
                                    <span className="select-none">{SIGN_BY_KIND[line.kind]}</span>
                                    <span className="whitespace-pre-wrap break-all">{line.text}</span>
                                </div>
                                {annotation !== undefined && (
                                    <div data-diff-annotation-for={line.newLine}>{annotation}</div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
