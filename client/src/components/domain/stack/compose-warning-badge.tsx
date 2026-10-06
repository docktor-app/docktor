import {ToneBadge} from "@/components/common/tone-badge";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip";
import {COMPOSE_RULE_EXPLANATIONS, COMPOSE_RULE_LABELS, composeFindingTone} from "@/lib/compose-rules";
import type {ComposeFinding} from "@/lib/stacks-api";

export interface ComposeWarningBadgeProps {
    readonly finding: Pick<ComposeFinding, "ruleId" | "severity">;
}

/** Issue #20/D-11: a thin ToneBadge wrapper for one compose-check finding — red for always-on, yellow for configurable. */
export function ComposeWarningBadge({finding}: Readonly<ComposeWarningBadgeProps>) {
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <ToneBadge tone={composeFindingTone(finding.severity)} className="cursor-help">
                        {COMPOSE_RULE_LABELS[finding.ruleId]}
                    </ToneBadge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                    <p>{COMPOSE_RULE_EXPLANATIONS[finding.ruleId]}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
