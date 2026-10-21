import {ToneBadge} from "@/components/common/tone-badge";
import {StatusDot} from "@/components/common/status-dot";
import {getStackStatusPresentation, type StackStatusPresentation} from "@/lib/status-labels";

export {getStackStatusPresentation, type StackStatusPresentation};

export interface StackStatusBadgeProps {
    readonly status: string;
    readonly display?: "badge" | "compact";
}

export function StackStatusBadge({status, display = "badge"}: Readonly<StackStatusBadgeProps>) {
    const {label, tone, dotPulse, badgePulse} = getStackStatusPresentation(status);

    if (display === "compact") {
        return (
            <span className="inline-flex items-center gap-1.5 text-xs">
                <StatusDot tone={tone} pulse={dotPulse} />
                {label}
            </span>
        );
    }

    return (
        <ToneBadge tone={tone} pulse={badgePulse}>
            <StatusDot tone={tone} pulse={dotPulse} />
            {label}
        </ToneBadge>
    );
}
