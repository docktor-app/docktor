import type {StackDetail} from "@/lib/stacks-api";
import {useStackEvents} from "@/hooks/use-stack-events";
import {useStackTimeline} from "@/hooks/use-stack-timeline";
import {useServiceHealthEvents} from "@/hooks/use-service-health-events";
import {useStackUptime} from "@/hooks/use-stack-uptime";
import {UptimeCard} from "./uptime-card";
import {ServicesSection} from "./services-section";
import {ActivityTimeline} from "./activity-timeline";

export interface OverviewTabProps {
    readonly stack: StackDetail;
    readonly onViewLogs: (serviceName: string) => void;
    readonly onUpgraded: () => void;
}

// D-16: the Overview tab opens with the UptimeCard row, then the Services
// section and the Activity timeline (the IncidentList joins between them).
// D-07/D-03: the old three-Cards log surface (Recent Deployments table, plus
// the two separate status/event log cards) is replaced by ActivityTimeline, a
// pure client-side merge over data already fetched here (useStackEvents) and
// passed down from the page (stack.deployments/statusLogs) — no new endpoint,
// no new SSE type.
// D-12: per-service health history comes from one stack-wide fetch
// (useServiceHealthEvents) handed to ServicesSection, never a request per service.
// Uptime is one request per stack, refetched whenever the SSE-driven
// stack.status changes (useStackUptime).
export function OverviewTab({stack, onViewLogs, onUpgraded}: Readonly<OverviewTabProps>) {
    const {events, loading, error, refetch} = useStackEvents(stack.id);
    const timeline = useStackTimeline(stack.deployments, stack.statusLogs, events);
    const health = useServiceHealthEvents(stack.id);
    const uptime = useStackUptime(stack.id, stack.status);

    return (
        <div className="space-y-8">
            <UptimeCard
                uptime={uptime.uptime}
                loading={uptime.loading}
                error={uptime.error}
                volumeSizeBytes={stack.volumeSizeBytes ?? null}
            />

            <ServicesSection
                services={stack.services}
                stackId={stack.id}
                stackStatus={stack.status}
                onViewLogs={onViewLogs}
                onUpgraded={onUpgraded}
                healthEventsByService={health.eventsByService}
                healthEventsLoading={health.loading}
                healthEventsError={health.error}
                onRetryHealthEvents={health.refetch}
            />

            <ActivityTimeline
                entries={timeline}
                eventsLoading={loading}
                eventsError={events === null ? error : null}
                onRetryEvents={refetch}
            />
        </div>
    );
}
