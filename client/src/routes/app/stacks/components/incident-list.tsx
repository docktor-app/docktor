import {Section, SectionDescription, SectionHeader, SectionTitle} from "@/components/common/layout/section";
import {ToneBadge} from "@/components/common/tone-badge";
import {StackStatusBadge} from "@/components/domain/stack/stack-status-badge";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {Button} from "@/components/ui/button";
import {Skeleton} from "@/components/ui/skeleton";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
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
            ) : incidents.length === 0 ? (
                <div className="space-y-1 py-8 text-center">
                    <p className="text-sm font-medium">No incidents</p>
                    <p className="text-sm text-muted-foreground">
                        This stack hasn't been unhealthy or in error during {windowText}.
                    </p>
                </div>
            ) : (
                <div className="max-h-96 overflow-y-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Started</TableHead>
                                <TableHead>Ended</TableHead>
                                <TableHead className="text-right">Duration</TableHead>
                                <TableHead>Cause</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {incidents.map((incident) => (
                                <IncidentRow key={incident.id} incident={incident} now={now}/>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
        </Section>
    );
}

interface IncidentRowProps {
    readonly incident: Incident;
    readonly now: number;
}

function IncidentRow({incident, now}: Readonly<IncidentRowProps>) {
    const ongoing = incident.endedAt === null;
    const durationMs = ongoing
        ? now - new Date(incident.startedAt).getTime()
        : (incident.durationMs ?? 0);

    return (
        <TableRow>
            <TableCell className="whitespace-nowrap">{new Date(incident.startedAt).toLocaleString()}</TableCell>
            <TableCell className="whitespace-nowrap">
                {incident.endedAt === null ? (
                    <ToneBadge tone="red">Ongoing</ToneBadge>
                ) : (
                    new Date(incident.endedAt).toLocaleString()
                )}
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatIncidentDuration(durationMs)}</TableCell>
            <TableCell>
                <StackStatusBadge status={incident.cause} display="compact"/>
            </TableCell>
        </TableRow>
    );
}
