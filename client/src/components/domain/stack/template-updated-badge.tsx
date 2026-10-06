import {ToneBadge} from "@/components/common/tone-badge";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip";
import type {Stack} from "@/lib/stacks-api";

export interface TemplateUpdatedBadgeProps {
    readonly stack: Pick<Stack, "templateUpdateAvailable" | "templatePath">;
}

/**
 * Issue #19/D-08: a purely passive, informational badge — Docktor never
 * applies a template update to an existing stack automatically. Mirrors
 * StackUpdateBadge's thin ToneBadge-wrapper shape (same blue tone, same
 * guard-clause-returns-null-when-empty convention).
 */
export function TemplateUpdatedBadge({stack}: Readonly<TemplateUpdatedBadgeProps>) {
    if (!stack.templateUpdateAvailable) return null;

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <ToneBadge tone="blue" className="cursor-help">
                        template updated
                    </ToneBadge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                    <p>
                        A newer version of the template this stack was created from
                        {stack.templatePath ? ` (${stack.templatePath})` : ""} is available.
                        Your stack is unchanged — Docktor never applies template updates automatically.
                    </p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
