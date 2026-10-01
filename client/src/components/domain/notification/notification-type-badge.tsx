import {ToneBadge, type Tone} from "@/components/common/tone-badge";

export interface DescribedNotificationType {
    label: string;
    tone: Tone;
}

/** D-08: maps a notification type to its display label and ToneBadge tone. */
export function describeNotificationType(type: string): DescribedNotificationType {
    switch (type) {
        case "stack_error":
            return {label: "Error", tone: "red"};
        case "stack_unhealthy":
            return {label: "Unhealthy", tone: "yellow"};
        case "disk_warning":
            return {label: "Disk", tone: "orange"};
        default:
            return {label: type, tone: "neutral"};
    }
}

export interface NotificationTypeBadgeProps {
    readonly type: string;
}

export function NotificationTypeBadge({type}: Readonly<NotificationTypeBadgeProps>) {
    const {label, tone} = describeNotificationType(type);
    return <ToneBadge tone={tone}>{label}</ToneBadge>;
}
