import type {StackDetail} from "@/lib/stacks-api";
import {useStackEvents} from "@/hooks/use-stack-events";
import {useStackTimeline} from "@/hooks/use-stack-timeline";
import {useServiceHealthEvents} from "@/hooks/use-service-health-events";
import {ServicesSection} from "./services-section";
import {ActivityTimeline} from "./activity-timeline";

export interface OverviewTabProps {
    readonly stack: StackDetail;
    readonly onViewLogs: (serviceName: string) => void;
    readonly onUpgraded: () => void;
}

// D-07/D-03: the Overview tab is two flat sections — Services and Activity.
// The old three-Cards log surface (Recent Deployments table, plus the two
// separate status/event log cards) is replaced by ActivityTimeline, a pure client-side merge
// over data already fetched here (useStackEvents) and passed down from the
// page (stack.deployments/statusLogs) — no new endpoint, no new SSE type.
// D-12: per-service health history comes from one stack-wide fetch
// (useServiceHealthEvents) handed to ServicesSection, never a request per service.
export function OverviewTab({stack, onViewLogs, onUpgraded}: Readonly<OverviewTabProps>) {
    const {events, loading, error, refetch} = useStackEvents(stack.id);
    const timeline = useStackTimeline(stack.deployments, stack.statusLogs, events);
    const health = useServiceHealthEvents(stack.id);

    return (
        <div className="space-y-8">
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
