import {ToneBadge} from "@/components/common/tone-badge";
import {StatusDot} from "@/components/common/status-dot";
import type {Tone} from "@/components/common/tone-badge";

interface BackupStatusBadgeProps {
    readonly status: "IN_PROGRESS" | "COMPLETED" | "FAILED";
}

const STATUS_CONFIG: Record<
    BackupStatusBadgeProps["status"],
    {label: string; tone: Tone; pulse: boolean}
> = {
    IN_PROGRESS: {label: "In Progress", tone: "blue", pulse: true},
    COMPLETED: {label: "Completed", tone: "green", pulse: false},
    FAILED: {label: "Failed", tone: "red", pulse: false},
};

export function BackupStatusBadge({status}: Readonly<BackupStatusBadgeProps>) {
    const {label, tone, pulse} = STATUS_CONFIG[status];

    return (
        <ToneBadge tone={tone}>
            <StatusDot tone={tone} pulse={pulse} />
            {label}
        </ToneBadge>
    );
}
