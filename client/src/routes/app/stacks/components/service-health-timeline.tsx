import {ScrollArea} from "@/components/ui/scroll-area";
import {StatusDot} from "@/components/common/status-dot";
import {ToneBadge} from "@/components/common/tone-badge";
import type {ServiceHealthEvent} from "@/lib/health-api";
import {HEALTH_SOURCE_LABELS, formatHealthStatus, getHealthTone} from "@/lib/health-format";

export interface ServiceHealthTimelineProps {
    readonly serviceName: string;
    readonly events: readonly ServiceHealthEvent[];
    readonly loading: boolean;
    readonly error: string | null;
    readonly onRetry: () => void;
}

// D-12 (amended): the expanded panel under a service row. `events` is already
// that service's slice of the stack-wide fetch (newest first, capped by the
// server), so this component owns only rendering.
export function ServiceHealthTimeline({serviceName, events}: Readonly<ServiceHealthTimelineProps>) {
    return (
        <div id={`health-history-${serviceName}`} className="space-y-2 py-2">
            <h4 className="text-sm font-medium">Health history</h4>
            <ScrollArea className="h-48">
                <div className="space-y-2 pr-3">
                    {events.map((event) => (
                        <HealthEventRow key={event.id} event={event}/>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}

// Mirrors activity-timeline's TimelineRow: stacked on phone, one line from sm.
// The message is rendered as React text only (T-14-10).
function HealthEventRow({event}: Readonly<{event: ServiceHealthEvent}>) {
    return (
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <StatusDot tone={getHealthTone(event.toStatus)}/>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(event.createdAt).toLocaleString()}
            </span>
            <span className="text-sm">
                {formatHealthStatus(event.fromStatus, "from")} → {formatHealthStatus(event.toStatus, "to")}
            </span>
            <ToneBadge tone="neutral">{HEALTH_SOURCE_LABELS[event.source]}</ToneBadge>
            {event.message !== null && (
                <span className="min-w-0 break-words text-xs text-muted-foreground">{event.message}</span>
            )}
        </div>
    );
}
