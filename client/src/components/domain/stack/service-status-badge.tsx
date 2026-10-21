import {ToneBadge} from "@/components/common/tone-badge";
import {StatusDot} from "@/components/common/status-dot";
import {getServiceStatusPresentation, type ServiceStatusPresentation} from "@/lib/status-labels";

export {getServiceStatusPresentation, type ServiceStatusPresentation};

export interface ServiceStatusBadgeProps {
    readonly containerState: string | null;
    readonly healthStatus: string | null;
    readonly display?: "badge" | "compact";
}

export function ServiceStatusBadge({
    containerState,
    healthStatus,
    display = "badge",
}: Readonly<ServiceStatusBadgeProps>) {
    const {label, tone, dotPulse} = getServiceStatusPresentation(containerState, healthStatus);

    if (display === "compact") {
        return (
            <span className="inline-flex items-center gap-1.5 text-xs">
                <StatusDot tone={tone} pulse={dotPulse} />
                {label}
            </span>
        );
    }

    return (
        <ToneBadge tone={tone}>
            <StatusDot tone={tone} pulse={dotPulse} />
            {label}
        </ToneBadge>
    );
}
