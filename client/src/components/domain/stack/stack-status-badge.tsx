import {ToneBadge} from "@/components/common/tone-badge";
import {StatusDot} from "@/components/common/status-dot";
import type {Tone} from "@/components/common/tone-badge";

export interface StackStatusPresentation {
    label: string;
    tone: Tone;
    dotPulse: boolean;
    badgePulse: boolean;
}

const STACK_STATUS_PRESENTATION: Record<string, StackStatusPresentation> = {
    DRAFT: {label: "Draft", tone: "neutral", dotPulse: false, badgePulse: false},
    DEPLOYING: {label: "Deploying", tone: "blue", dotPulse: false, badgePulse: true},
    RUNNING: {label: "Running", tone: "green", dotPulse: true, badgePulse: false},
    HEALTHY: {label: "Healthy", tone: "green", dotPulse: true, badgePulse: false},
    UNHEALTHY: {label: "Unhealthy", tone: "red", dotPulse: false, badgePulse: false},
    STOPPED: {label: "Stopped", tone: "neutral", dotPulse: false, badgePulse: false},
    ERROR: {label: "Error", tone: "red", dotPulse: false, badgePulse: false},
    UPDATING: {label: "Updating", tone: "blue", dotPulse: false, badgePulse: true},
    BACKING_UP: {label: "Backing Up", tone: "blue", dotPulse: false, badgePulse: true},
    RESTORING: {label: "Restoring", tone: "neutral", dotPulse: false, badgePulse: true},
    MIGRATING: {label: "Migrating", tone: "neutral", dotPulse: false, badgePulse: true},
};

/** Unknown/unmapped statuses degrade to a static neutral indicator showing the raw value, never throwing. */
export function getStackStatusPresentation(status: string): StackStatusPresentation {
    return (
        STACK_STATUS_PRESENTATION[status] ?? {
            label: status,
            tone: "neutral",
            dotPulse: false,
            badgePulse: false,
        }
    );
}

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
