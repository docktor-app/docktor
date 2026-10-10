import {Alert, AlertDescription} from "@/components/ui/alert";
import {Button} from "@/components/ui/button";
import {ScrollArea} from "@/components/ui/scroll-area";
import {Skeleton} from "@/components/ui/skeleton";
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
// server), so this component owns only rendering. Branches are checked in
// the order loading, error, empty, populated.
export function ServiceHealthTimeline({
    serviceName,
    events,
    loading,
    error,
    onRetry,
}: Readonly<ServiceHealthTimelineProps>) {
    return (
        // whitespace-normal: the table cell this renders in is whitespace-nowrap,
        // which children inherit and which would stop break-words from wrapping.
        <div id={`health-history-${serviceName}`} className="space-y-2 whitespace-normal py-2">
            <h4 className="text-sm font-medium">Health history</h4>
            {loading ? (
                <div className="space-y-2" role="status" aria-label="Loading health history">
                    <Skeleton className="h-4 w-full"/>
                    <Skeleton className="h-4 w-full"/>
                </div>
            ) : error ? (
                <Alert variant="destructive">
                    <AlertDescription>
                        <span>{`Couldn't load health history — ${error}. Try again.`}</span>
                        <Button variant="outline" size="sm" onClick={onRetry}>
                            Retry
                        </Button>
                    </AlertDescription>
                </Alert>
            ) : events.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No health changes recorded for this service yet.
                </p>
            ) : (
                <ScrollArea className="h-48">
                    <div className="divide-y pr-3">
                        {events.map((event) => (
                            <HealthEventRow key={event.id} event={event}/>
                        ))}
                    </div>
                </ScrollArea>
            )}
        </div>
    );
}

// A wrapping header line (dot, timestamp, transition, source) with the message
// on its own full-width line beneath it. The transition never wraps (G-14-2: a
// long message sharing its line used to squeeze it to 2-3 lines), and rows are
// divided with larger vertical padding on phones. The message is rendered as
// React text only (T-14-10).
function HealthEventRow({event}: Readonly<{event: ServiceHealthEvent}>) {
    return (
        <div data-slot="health-event-row" className="py-3 sm:py-2">
            <div data-slot="health-event-header" className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <StatusDot tone={getHealthTone(event.toStatus)}/>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(event.createdAt).toLocaleString()}
                </span>
                <span className="text-sm whitespace-nowrap">
                    {formatHealthStatus(event.fromStatus, "from")} → {formatHealthStatus(event.toStatus, "to")}
                </span>
                <ToneBadge tone="neutral">{HEALTH_SOURCE_LABELS[event.source]}</ToneBadge>
            </div>
            {event.message !== null && (
                <p className="mt-1 min-w-0 break-words wrap-anywhere text-xs text-muted-foreground">
                    {event.message}
                </p>
            )}
        </div>
    );
}
