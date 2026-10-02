import {useEffect, useState} from "react";
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
import {Button} from "@/components/ui/button";
import {ScrollArea} from "@/components/ui/scroll-area";
import {UnifiedDiffView, type UnifiedDiffHunk, type UnifiedDiffLine} from "@/components/common/unified-diff-view";
import {isSecretKey} from "@/lib/env-file";
import type {UnifiedDiff} from "@/lib/stacks-api";

// Issue #18/D-01/D-03: the review gate between an edit and the PUT that
// applies it. `kind: "edit"` is explicit (not the only variant today)
// because 12-05 adds a `"create"` subject to this same dialog for the
// create-flow findings review — keeping the discriminant from day one means
// that extension doesn't need to touch every existing call site's shape.
export interface ReviewSubject {
    readonly kind: "edit";
    readonly file: "compose" | "env";
    readonly diff: UnifiedDiff;
}

export interface DiffConfirmDialogProps {
    readonly open: boolean;
    readonly stackName: string;
    readonly subject: ReviewSubject | null;
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

/**
 * Issue #18/D-01/D-03: the review-before-apply dialog — a GitHub-style
 * unified diff of the pending edit, with explicit cancel/apply actions per
 * the UI-SPEC copy contract. This is a review gate, not a destructive
 * action, so no destructive styling (AlertDialogAction keeps its default
 * primary variant).
 */
export function DiffConfirmDialog({
    open,
    stackName,
    subject,
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

    const isEnv = subject?.file === "env";
    const title = isEnv ? `Review changes to ${stackName}'s environment` : `Review changes to ${stackName}`;
    const added = subject?.diff.added ?? 0;
    const removed = subject?.diff.removed ?? 0;
    const hunks = subject?.diff.hunks ?? [];
    // T-12-02/D-22: compose diffs are never masked — only env diffs can
    // contain KEY=value lines whose key matches the secret heuristic.
    const hasSecret = isEnv && hunksHaveSecret(hunks);
    const displayedHunks = isEnv ? maskSecretHunks(hunks, revealSecrets) : hunks;

    return (
        <AlertDialog open={open} onOpenChange={handleOpenChange}>
            <AlertDialogContent className="sm:max-w-3xl">
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {added} line(s) added, {removed} line(s) removed.
                    </AlertDialogDescription>
                </AlertDialogHeader>

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

                <ScrollArea className="max-h-[60vh]">
                    <UnifiedDiffView hunks={displayedHunks} ariaLabel="Review diff" />
                </ScrollArea>

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
