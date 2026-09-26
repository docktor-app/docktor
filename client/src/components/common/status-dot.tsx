import {cn} from "@/lib/utils";
import type {Tone} from "@/components/common/tone-badge";

const DOT_TONE_CLASSES: Record<Tone, string> = {
    neutral: "bg-gray-400 dark:bg-gray-500",
    green: "bg-green-500",
    red: "bg-red-500",
    yellow: "bg-yellow-500",
    blue: "bg-blue-500",
    orange: "bg-orange-500",
};

export interface StatusDotProps {
    readonly tone: Tone;
    readonly pulse?: boolean;
    readonly className?: string;
}

/**
 * Compact 8px status indicator for dense rows (stack list, timeline, service
 * rows). Pulsing renders a solid core plus an animate-ping ripple layer,
 * matching the running-family treatment; every other state is a static dot.
 */
export function StatusDot({tone, pulse = false, className}: Readonly<StatusDotProps>) {
    const toneClass = DOT_TONE_CLASSES[tone];

    return (
        <span
            aria-hidden="true"
            data-slot="status-dot"
            data-tone={tone}
            data-pulse={pulse ? "true" : "false"}
            className={cn("relative inline-flex size-2 shrink-0", className)}
        >
            {pulse && (
                <span
                    className={cn(
                        "absolute inline-flex size-full rounded-full opacity-75 animate-ping motion-reduce:animate-none",
                        toneClass,
                    )}
                />
            )}
            <span className={cn("relative inline-flex size-2 rounded-full", toneClass)} />
        </span>
    );
}
