import {DataTable, type TableColumn} from "@/components/common/data/table";
import {Section, SectionDescription, SectionHeader, SectionTitle} from "@/components/common/layout/section";
import {ToneBadge} from "@/components/common/tone-badge";
import {StackStatusBadge} from "@/components/domain/stack/stack-status-badge";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {Button} from "@/components/ui/button";
import {Skeleton} from "@/components/ui/skeleton";
import {useNow} from "@/hooks/use-now";
import {formatIncidentDuration} from "@/lib/format-incident-duration";
import type {Incident} from "@/lib/uptime-api";

export interface IncidentListProps {
    readonly incidents: Incident[];
    readonly windowDays: number | null;
    readonly loading: boolean;
    readonly error: string | null;
    readonly onRetry: () => void;
}

const ELAPSED_TICK_MS = 60_000;

// D-11/D-16: every period the stack was unhealthy or in error inside the
// retention window, newest first. Only the elapsed time of an ongoing
// incident moves, on a 60-second tick that exists only while one is open.
export function IncidentList({incidents, windowDays, loading, error, onRetry}: Readonly<IncidentListProps>) {
    const hasOngoing = incidents.some((incident) => incident.endedAt === null);
    const now = useNow(ELAPSED_TICK_MS, hasOngoing);
    const windowText = windowDays === null ? "this window" : `the last ${windowDays} days`;

    return (
        <Section>
            <SectionHeader>
                <SectionTitle>Incidents</SectionTitle>
                {windowDays !== null && (
                    <SectionDescription>
                        Periods when this stack was unhealthy or in error during the last {windowDays} days.
                    </SectionDescription>
                )}
            </SectionHeader>

            {error ? (
                <Alert variant="destructive">
                    <AlertDescription>
                        <span>{`Couldn't load uptime — ${error}. Try again.`}</span>
                        <Button variant="outline" size="sm" onClick={onRetry}>
                            Retry
                        </Button>
                    </AlertDescription>
                </Alert>
            ) : loading ? (
                <div className="space-y-2" role="status" aria-label="Loading incidents">
                    <Skeleton className="h-4 w-full"/>
                    <Skeleton className="h-4 w-full"/>
                    <Skeleton className="h-4 w-full"/>
                </div>
            ) : (
                <IncidentTable incidents={incidents} now={now} windowText={windowText}/>
            )}
        </Section>
    );
}

interface IncidentTableProps {
    readonly incidents: readonly Incident[];
    readonly now: number;
    readonly windowText: string;
}

function incidentDurationMs(incident: Incident, now: number): number {
    return incident.endedAt === null
        ? now - new Date(incident.startedAt).getTime()
        : (incident.durationMs ?? 0);
}

function buildColumns(now: number): TableColumn<Incident>[] {
    return [
        {
            name: "Started",
            isKey: true,
            className: "whitespace-nowrap",
            render: (incident) => new Date(incident.startedAt).toLocaleString(),
        },
        {
            name: "Ended",
            className: "whitespace-nowrap",
            render: (incident) =>
                incident.endedAt === null ? (
                    <ToneBadge tone="red">Ongoing</ToneBadge>
                ) : (
                    new Date(incident.endedAt).toLocaleString()
                ),
        },
        {
            name: "Duration",
            align: "right",
            className: "tabular-nums",
            render: (incident) => formatIncidentDuration(incidentDurationMs(incident, now)),
        },
        {
            name: "Cause",
            render: (incident) => <StackStatusBadge status={incident.cause} display="compact"/>,
        },
    ];
}

// The scroll box only wraps a real table, so the empty copy is never clipped by it.
function IncidentTable({incidents, now, windowText}: Readonly<IncidentTableProps>) {
    const table = (
        <DataTable
            data={incidents}
            columns={buildColumns(now)}
            getRowKey={(incident) => incident.id}
            pagination={false}
            emptyMessage="No incidents"
            emptyDescription={`This stack hasn't been unhealthy or in error during ${windowText}.`}
        />
    );
    if (incidents.length === 0) return table;
    return <div className="max-h-96 overflow-y-auto">{table}</div>;
}
