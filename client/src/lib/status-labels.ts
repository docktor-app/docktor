import type {Tone} from "@/components/common/tone-badge";

/**
 * Single owner of status casing for the whole client (UI-02, D-01/D-02).
 *
 * Every status label is derived through `formatStatusLabel` - never hard-coded
 * and never lowercased with CSS - so tests, accessible names and copy-paste all
 * agree on the same lowercase text.
 */

/** Lowercases a raw status and turns underscores into spaces (`BACKING_UP` -> `backing up`). */
export function formatStatusLabel(raw: string): string {
    return raw.replaceAll("_", " ").toLowerCase();
}

export interface StackStatusPresentation {
    label: string;
    tone: Tone;
    dotPulse: boolean;
    badgePulse: boolean;
}

export const KNOWN_STACK_STATUSES = [
    "DRAFT",
    "DEPLOYING",
    "RUNNING",
    "HEALTHY",
    "UNHEALTHY",
    "STOPPED",
    "ERROR",
    "UPDATING",
    "BACKING_UP",
    "RESTORING",
    "MIGRATING",
] as const;

type KnownStackStatus = (typeof KNOWN_STACK_STATUSES)[number];

const STACK_STATUS_STYLES: Record<KnownStackStatus, Omit<StackStatusPresentation, "label">> = {
    DRAFT: {tone: "neutral", dotPulse: false, badgePulse: false},
    DEPLOYING: {tone: "blue", dotPulse: false, badgePulse: true},
    RUNNING: {tone: "green", dotPulse: true, badgePulse: false},
    HEALTHY: {tone: "green", dotPulse: true, badgePulse: false},
    UNHEALTHY: {tone: "red", dotPulse: false, badgePulse: false},
    STOPPED: {tone: "neutral", dotPulse: false, badgePulse: false},
    ERROR: {tone: "red", dotPulse: false, badgePulse: false},
    UPDATING: {tone: "blue", dotPulse: false, badgePulse: true},
    BACKING_UP: {tone: "blue", dotPulse: false, badgePulse: true},
    RESTORING: {tone: "neutral", dotPulse: false, badgePulse: true},
    MIGRATING: {tone: "neutral", dotPulse: false, badgePulse: true},
};

const UNKNOWN_STACK_STATUS_STYLE: Omit<StackStatusPresentation, "label"> = {
    tone: "neutral",
    dotPulse: false,
    badgePulse: false,
};

function isKnownStackStatus(status: string): status is KnownStackStatus {
    return Object.hasOwn(STACK_STATUS_STYLES, status);
}

/** Unknown/unmapped statuses degrade to a static neutral indicator showing the formatted raw value, never throwing. */
export function getStackStatusPresentation(status: string): StackStatusPresentation {
    const style = isKnownStackStatus(status) ? STACK_STATUS_STYLES[status] : UNKNOWN_STACK_STATUS_STYLE;
    return {label: formatStatusLabel(status), ...style};
}
