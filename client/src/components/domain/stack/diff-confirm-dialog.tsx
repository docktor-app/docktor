import {useEffect, useState} from "react";
import {AlertTriangle} from "lucide-react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {Button} from "@/components/ui/button";
import {ScrollArea} from "@/components/ui/scroll-area";
import {ToneBadge} from "@/components/common/tone-badge";
import {UnifiedDiffView, type UnifiedDiffHunk, type UnifiedDiffLine} from "@/components/common/unified-diff-view";
import {ComposeWarningBadge} from "@/components/domain/stack/compose-warning-badge";
import {isSecretKey} from "@/lib/env-file";
import type {ReviewFinding, UnifiedDiff} from "@/lib/stacks-api";

// Issue #18/D-01/D-03 + Issue #20/D-02: the review gate between an edit (or
// a stack creation) and the write that applies it. `kind: "create"` has no
// diff (D-02: nothing on disk to diff against yet) — only the findings list.
export type ReviewSubject =
    | {readonly kind: "edit"; readonly file: "compose" | "env"; readonly diff: UnifiedDiff}
    | {readonly kind: "create"};

export interface DiffConfirmDialogProps {
    readonly open: boolean;
    readonly stackName: string;
    readonly subject: ReviewSubject | null;
    // Issue #20/D-03/D-11: optional so a caller/test written before plan
    // 12-05 (findings) keeps type-checking without passing these.
    readonly findings?: ReadonlyArray<ReviewFinding>;
    readonly composeParseError?: string | null;
    readonly onConfirm: () => void;
    readonly onCancel: () => void;
}

const SECRET_MASK = "••••••••";
// Mirrors client/src/lib/env-file.ts's variable-line pattern (an optional
// `export ` prefix, per the env key rule) — this dialog only needs to
// recognize the key to decide whether to mask the value, not to round-trip
// the line losslessly the way env-file.ts does.
const ENV_KEY_VALUE_PATTERN = /^(export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

function maskSecretLine(line: UnifiedDiffLine, revealSecrets: boolean): UnifiedDiffLine {
    if (revealSecrets) {
        return line;
    }
    const match = ENV_KEY_VALUE_PATTERN.exec(line.text);
    if (!match || !isSecretKey(match[2]!)) {
        return line;
    }
    const prefix = match[1] ?? "";
    return {...line, text: `${prefix}${match[2]}=${SECRET_MASK}`};
}

function maskSecretHunks(
    hunks: ReadonlyArray<UnifiedDiffHunk>,
    revealSecrets: boolean,
): ReadonlyArray<UnifiedDiffHunk> {
    return hunks.map((hunk) => ({
        ...hunk,
        lines: hunk.lines.map((line) => maskSecretLine(line, revealSecrets)),
    }));
}

function hunksHaveSecret(hunks: ReadonlyArray<UnifiedDiffHunk>): boolean {
    return hunks.some((hunk) =>
        hunk.lines.some((line) => {
            const match = ENV_KEY_VALUE_PATTERN.exec(line.text);
            return !!match && isSecretKey(match[2]!);
        }),
    );
}

// Issue #20/D-03: the set of new-file line numbers actually rendered by the
// diff (every non-removed line that carries a newLine) — a finding whose
// line isn't in this set (removed-only line, or outside every hunk's
// context window) can't be anchored and must be listed instead.
function visibleNewLines(hunks: ReadonlyArray<UnifiedDiffHunk>): ReadonlySet<number> {
    const lines = new Set<number>();
    for (const hunk of hunks) {
        for (const line of hunk.lines) {
            if (line.kind !== "removed" && line.newLine !== null) {
                lines.add(line.newLine);
            }
        }
    }
    return lines;
}

function findingKey(finding: ReviewFinding, index: number): string {
    return `${finding.ruleId}-${finding.serviceName ?? ""}-${index}`;
}

/**
 * Issue #18/D-01/D-03 + Issue #20/D-02/D-03/D-11: the review-before-apply
 * dialog — a GitHub-style unified diff (edit) or a findings-only summary
 * (create) of the pending change, with explicit cancel/apply actions per
 * the UI-SPEC copy contract. This is a review gate, not a destructive
 * action, so no destructive styling (AlertDialogAction keeps its default
 * primary variant) — #20: all checks warn, none block.
 */
export function DiffConfirmDialog({
    open,
    stackName,
    subject,
    findings = [],
    composeParseError = null,
    onConfirm,
    onCancel,
}: Readonly<DiffConfirmDialogProps>): React.JSX.Element {
    const [revealSecrets, setRevealSecrets] = useState(false);

    // T-12-02: reset the reveal state whenever the dialog closes — a
    // previously revealed secret must never still be shown the next time a
    // (possibly different) review opens.
    useEffect(() => {
        if (!open) {
            setRevealSecrets(false);
        }
    }, [open]);

    function handleOpenChange(nextOpen: boolean) {
        if (!nextOpen) {
            onCancel();
        }
    }

    const isCreate = subject?.kind === "create";
    const isEnv = subject?.kind === "edit" && subject.file === "env";
    const isComposeEdit = subject?.kind === "edit" && subject.file === "compose";

    const title = isCreate
        ? `Review ${stackName} before creating`
        : isEnv
          ? `Review changes to ${stackName}'s environment`
          : `Review changes to ${stackName}`;

    const hunks = subject?.kind === "edit" ? subject.diff.hunks : [];
    const added = subject?.kind === "edit" ? subject.diff.added : 0;
    const removed = subject?.kind === "edit" ? subject.diff.removed : 0;
    // T-12-02/D-22: compose diffs are never masked — only env diffs can
    // contain KEY=value lines whose key matches the secret heuristic.
    const hasSecret = isEnv && hunksHaveSecret(hunks);
    const displayedHunks = isEnv ? maskSecretHunks(hunks, revealSecrets) : hunks;

    // Issue #20/D-03: a finding anchors next to its diff line only for a
    // compose edit whose line is actually visible in the diff; every other
    // finding (including every finding when the subject is an env edit or a
    // create review, which has no diff at all) is listed above instead.
    const visibleLines = isComposeEdit ? visibleNewLines(hunks) : new Set<number>();
    const isAnchored = (finding: ReviewFinding): boolean =>
        isComposeEdit && finding.line !== null && visibleLines.has(finding.line);
    const anchoredFindings = findings.filter(isAnchored);
    const listedFindings = findings.filter((finding) => !isAnchored(finding));

    const annotations = new Map<number, React.ReactNode>();
    if (isComposeEdit) {
        const byLine = new Map<number, ReviewFinding[]>();
        for (const finding of anchoredFindings) {
            const line = finding.line as number;
            const existing = byLine.get(line) ?? [];
            existing.push(finding);
            byLine.set(line, existing);
        }
        for (const [line, lineFindings] of byLine) {
            annotations.set(
                line,
                <div className="space-y-1 py-1">
                    {lineFindings.map((finding, index) => (
                        <div key={findingKey(finding, index)} className="flex items-center gap-2">
                            <ComposeWarningBadge finding={finding} />
                            <span className="text-xs">{finding.message}</span>
                        </div>
                    ))}
                </div>,
            );
        }
    }

    return (
        <AlertDialog open={open} onOpenChange={handleOpenChange}>
            <AlertDialogContent className="sm:max-w-3xl">
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {isCreate ? (
                            "Docktor found compose-check warnings in this stack. Nothing is blocked — confirm to create it."
                        ) : (
                            `${added} line(s) added, ${removed} line(s) removed.`
                        )}
                    </AlertDialogDescription>
                </AlertDialogHeader>

                {composeParseError && (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                            This compose file has a YAML error: {composeParseError}. It will still be saved, but the
                            stack can&apos;t be deployed until it&apos;s fixed.
                        </AlertDescription>
                    </Alert>
                )}

                {listedFindings.length > 0 && (
                    <div className="space-y-2">
                        <p className="text-sm font-semibold">Compose check warnings</p>
                        {listedFindings.map((finding, index) => (
                            <div key={findingKey(finding, index)} className="flex items-center gap-2 text-sm">
                                <ComposeWarningBadge finding={finding} />
                                <span>{finding.message}</span>
                                {finding.line !== null && (
                                    <span className="text-muted-foreground">line {finding.line}</span>
                                )}
                                {finding.introduced && <ToneBadge tone="neutral">new</ToneBadge>}
                            </div>
                        ))}
                    </div>
                )}

                {hasSecret && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-fit"
                        onClick={() => setRevealSecrets((prev) => !prev)}
                    >
                        {revealSecrets ? "Hide secret values" : "Show secret values"}
                    </Button>
                )}

                {!isCreate && (
                    <ScrollArea className="max-h-[60vh]">
                        <UnifiedDiffView hunks={displayedHunks} annotations={annotations} ariaLabel="Review diff" />
                    </ScrollArea>
                )}

                <AlertDialogFooter>
                    {/* No onClick here: clicking Cancel closes the dialog via
                        Radix, which fires handleOpenChange(false) above — that
                        is the single source of the onCancel call. Adding an
                        explicit onClick here as well would call onCancel twice. */}
                    <AlertDialogCancel>Keep Editing</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => {
                            // Confirming must never also fire onCancel via the
                            // onOpenChange(false) Radix emits when Action
                            // closes the dialog — stop that propagation path
                            // by calling onConfirm synchronously and letting
                            // Radix's own close happen without re-entering
                            // handleOpenChange's onCancel branch.
                            e.preventDefault();
                            onConfirm();
                        }}
                    >
                        Confirm & Apply
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
