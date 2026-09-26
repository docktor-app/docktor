import {useMemo, useState} from "react";
import {Section, SectionActions, SectionHeader, SectionTitle} from "@/components/common/layout/section";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {ScrollArea} from "@/components/ui/scroll-area";
import {Skeleton} from "@/components/ui/skeleton";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {Button} from "@/components/ui/button";
import {ToneBadge} from "@/components/common/tone-badge";
import {StackStatusBadge} from "@/components/domain/stack/stack-status-badge";
import {describeStackEvent} from "@/lib/stack-event-description";
import {filterTimeline, type TimelineEntry, type TimelineFilter} from "@/hooks/use-stack-timeline";

export interface ActivityTimelineProps {
    readonly entries: TimelineEntry[];
    readonly eventsLoading: boolean;
    readonly eventsError: string | null;
    readonly onRetryEvents: () => void;
}

const FILTER_OPTIONS: {value: TimelineFilter; label: string}[] = [
    {value: "all", label: "All activity"},
    {value: "deployment", label: "Deployments"},
    {value: "status", label: "Status changes"},
    {value: "event", label: "Events"},
];

// D-07: replaces the old Recent Deployments table plus the two separate
// status/event log cards with one merged, type-filterable list. `entries` is already the
// merged/sorted timeline (useStackTimeline, computed by the caller) — this
// component owns only the type filter and the loading/error/empty rendering.
export function ActivityTimeline({
    entries,
    eventsLoading,
    eventsError,
    onRetryEvents,
}: Readonly<ActivityTimelineProps>) {
    const [filter, setFilter] = useState<TimelineFilter>("all");
    const filtered = useMemo(() => filterTimeline(entries, filter), [entries, filter]);

    return (
        <Section>
            <SectionHeader>
                <SectionTitle>Activity</SectionTitle>
                <SectionActions>
                    <Select value={filter} onValueChange={(value) => setFilter(value as TimelineFilter)}>
                        <SelectTrigger aria-label="Filter activity by type" className="w-44">
                            <SelectValue/>
                        </SelectTrigger>
                        <SelectContent>
                            {FILTER_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </SectionActions>
            </SectionHeader>

            {eventsError && (
                <Alert variant="destructive">
                    <AlertDescription>
                        <span>{eventsError}</span>
                        <Button variant="outline" size="sm" onClick={onRetryEvents}>
                            Retry
                        </Button>
                    </AlertDescription>
                </Alert>
            )}

            {eventsLoading ? (
                <div className="space-y-2" role="status" aria-label="Loading activity">
                    <Skeleton className="h-4 w-2/3"/>
                    <Skeleton className="h-4 w-1/2"/>
                    <Skeleton className="h-4 w-1/3"/>
                </div>
            ) : entries.length === 0 ? (
                <div className="space-y-1 py-8 text-center">
                    <p className="text-sm font-medium">No activity yet</p>
                    <p className="text-sm text-muted-foreground">
                        Deploys, status changes, and events for this stack will appear here.
                    </p>
                </div>
            ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground">No matching activity.</p>
            ) : (
                <ScrollArea className="h-96">
                    <div className="space-y-2">
                        {filtered.map((entry) => (
                            <TimelineRow key={entry.key} entry={entry}/>
                        ))}
                    </div>
                </ScrollArea>
            )}
        </Section>
    );
}

function TimelineRow({entry}: Readonly<{entry: TimelineEntry}>) {
    return (
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(entry.timestamp).toLocaleString()}
            </span>
            <TimelineEntryBody entry={entry}/>
        </div>
    );
}

function TimelineEntryBody({entry}: Readonly<{entry: TimelineEntry}>) {
    if (entry.type === "deployment") {
        return (
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                <ToneBadge tone={entry.success ? "green" : "red"}>
                    {entry.success ? "Deploy succeeded" : "Deploy failed"}
                </ToneBadge>
                {entry.errorMessage && (
                    <span className="min-w-0 break-words text-sm text-muted-foreground">
                        {entry.errorMessage}
                    </span>
                )}
            </span>
        );
    }

    if (entry.type === "status") {
        return (
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="min-w-0 break-words text-sm">
                    {entry.fromStatus ? `${entry.fromStatus} → ${entry.toStatus}` : entry.toStatus}
                </span>
                <StackStatusBadge status={entry.toStatus} display="compact"/>
                {entry.message && (
                    <span className="min-w-0 break-words text-sm text-muted-foreground">
                        {entry.message}
                    </span>
                )}
            </span>
        );
    }

    const {label, description, tone} = describeStackEvent(entry.event);
    return (
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <ToneBadge tone={tone}>{label}</ToneBadge>
            <span className="min-w-0 break-words text-sm">{description}</span>
        </span>
    );
}
