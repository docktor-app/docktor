import {ToneBadge} from "@/components/common/tone-badge";
import {StatusDot} from "@/components/common/status-dot";
import type {Tone} from "@/components/common/tone-badge";

export interface ServiceStatusPresentation {
    label: string;
    tone: Tone;
    dotPulse: boolean;
}

/**
 * A running container with no health info reads the same "running" green as
 * a running+healthy container — health status only narrows the label/tone
 * when Docker actually reports it.
 */
export function getServiceStatusPresentation(
    containerState: string | null,
    healthStatus: string | null,
): ServiceStatusPresentation {
    if (!containerState) {
        return {label: "unknown", tone: "neutral", dotPulse: false};
    }

    if (containerState === "running" && healthStatus === "healthy") {
        return {label: "healthy", tone: "green", dotPulse: true};
    }

    if (containerState === "running" && healthStatus === "unhealthy") {
        return {label: "unhealthy", tone: "red", dotPulse: false};
    }

    if (containerState === "running") {
        return {label: "running", tone: "green", dotPulse: true};
    }

    if (containerState === "exited") {
        return {label: "exited", tone: "neutral", dotPulse: false};
    }

    if (containerState === "restarting") {
        return {label: "restarting", tone: "yellow", dotPulse: false};
    }

    return {label: containerState, tone: "neutral", dotPulse: false};
}

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
