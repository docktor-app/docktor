import {ToneBadge} from "@/components/common/tone-badge";
import {ComposeWarningBadge} from "@/components/domain/stack/compose-warning-badge";
import type {ReviewFinding} from "@/lib/stacks-api";

interface ComposeFindingRowProps {
    finding: ReviewFinding;
    /** Show the "line N" reference — off when the row is already anchored under its diff line. */
    showLine?: boolean;
}

/**
 * One compose-check finding as a self-contained card: the rule badge (plus
 * optional line / "new" markers) on the first row and the message on its own
 * line below, so stacked findings never read as one run-on block.
 */
export function ComposeFindingRow({finding, showLine = false}: Readonly<ComposeFindingRowProps>) {
    return (
        <div className="space-y-1.5 rounded-md border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
                <ComposeWarningBadge finding={finding} />
                {showLine && finding.line !== null && (
                    <span className="text-xs text-muted-foreground">line {finding.line}</span>
                )}
                {finding.introduced && <ToneBadge tone="neutral">new</ToneBadge>}
            </div>
            <p className="text-muted-foreground">{finding.message}</p>
        </div>
    );
}
