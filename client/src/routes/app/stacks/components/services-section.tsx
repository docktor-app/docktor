import {Fragment, useState} from "react";
import {ArrowUpCircle, FileText, History} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Section, SectionHeader, SectionTitle} from "@/components/common/layout/section";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {cn} from "@/lib/utils";
import type {Service} from "@/lib/stacks-api";
import type {ServiceHealthEvent} from "@/lib/health-api";
import {getServiceColor} from "@/lib/service-color";
import {formatPorts, parsePorts} from "@/lib/service-ports";
import {ToneBadge} from "@/components/common/tone-badge";
import {ServiceStatusBadge} from "@/components/domain/stack/service-status-badge";
import {ServiceUpdateBadge} from "@/components/domain/stack/service-update-badge";
import {ServiceUpgradeDialog} from "./service-upgrade-dialog";
import {ServiceHealthTimeline} from "./service-health-timeline";

// Transitional states that block a new upgrade: the states stack-actions.tsx
// already treats as blocking (BACKING_UP, RESTORING, DEPLOYING), plus
// UPDATING and MIGRATING. This matches the server's authoritative
// TRANSITIONS.UPDATE allow-list in stack-status-machine.ts exactly (the
// complement of that allow-list across all StackStatus values) — the client
// gate exists only so the user isn't invited into a request the server's
// guardTransition would reject anyway.
const UPGRADE_BLOCKED_STATES = ["BACKING_UP", "RESTORING", "DEPLOYING", "UPDATING", "MIGRATING"];

const NO_HEALTH_EVENTS: readonly ServiceHealthEvent[] = [];

export interface ServicesSectionProps {
    readonly services: Service[];
    readonly stackId: string;
    readonly stackStatus: string;
    readonly onViewLogs: (serviceName: string) => void;
    readonly onUpgraded: () => void;
    readonly healthEventsByService: ReadonlyMap<string, readonly ServiceHealthEvent[]>;
    readonly healthEventsLoading: boolean;
    readonly healthEventsError: string | null;
    readonly onRetryHealthEvents: () => void;
}

// D-03/D-10/D-11: services-tab.tsx flattened into a Section (no Card), with
// a per-service color dot matching the log viewer's attribution (D-11) and
// the shared ServiceUpdateBadge copy (D-10) instead of a hand-rolled pill.
// D-12 (amended): each row can expand a health history panel fed by the
// stack-wide events the caller already fetched (no per-service request).
export function ServicesSection({
    services,
    stackId,
    stackStatus,
    onViewLogs,
    onUpgraded,
    healthEventsByService,
    healthEventsLoading,
    healthEventsError,
    onRetryHealthEvents,
}: Readonly<ServicesSectionProps>) {
    const [upgradeTarget, setUpgradeTarget] = useState<Service | null>(null);
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
    const isUpgradeBlocked = UPGRADE_BLOCKED_STATES.includes(stackStatus);

    const toggleExpanded = (serviceName: string) => {
        setExpanded((current) => {
            const next = new Set(current);
            if (next.has(serviceName)) {
                next.delete(serviceName);
            } else {
                next.add(serviceName);
            }
            return next;
        });
    };

    return (
        <Section>
            <SectionHeader>
                <SectionTitle>Services</SectionTitle>
            </SectionHeader>

            {services.length === 0 ? (
                <p className="text-muted-foreground">No services defined</p>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Image</TableHead>
                            <TableHead>Tag</TableHead>
                            <TableHead>Ports</TableHead>
                            <TableHead></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {services.map((svc) => {
                            const isExpanded = expanded.has(svc.serviceName);
                            const serviceEvents = healthEventsByService.get(svc.serviceName) ?? NO_HEALTH_EVENTS;
                            // RESEARCH Open Question 4: there is no DB probe column, so a
                            // service reads as probed once it has any http-probe event.
                            const isProbed = serviceEvents.some((event) => event.source === "http-probe");
                            const historyLabel = `${isExpanded ? "Hide" : "Show"} health history for ${svc.serviceName}`;

                            return (
                                <Fragment key={svc.id}>
                                    <TableRow>
                                        <TableCell className="font-medium">
                                            <span className="inline-flex items-center gap-2">
                                                <span
                                                    className={cn("size-2 shrink-0 rounded-full bg-current", getServiceColor(svc.serviceName))}
                                                    aria-hidden="true"
                                                />
                                                {svc.serviceName}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap items-center gap-1">
                                                <ServiceStatusBadge
                                                    containerState={svc.containerState}
                                                    healthStatus={svc.healthStatus}
                                                    display="compact"
                                                />
                                                {isProbed && <ToneBadge tone="neutral">HTTP probe</ToneBadge>}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-row flex-wrap items-center gap-2">
                                                <span>{svc.image}</span>
                                                <ServiceUpdateBadge
                                                    updateAvailable={svc.updateAvailable}
                                                    latestTag={svc.latestTag}
                                                />
                                            </div>
                                        </TableCell>
                                        <TableCell>{svc.imageTag ?? "latest"}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {formatPorts(parsePorts(svc.ports))}
                                        </TableCell>
                                        <TableCell>
                                            <TooltipProvider>
                                                <div className="flex items-center gap-1">
                                                    {svc.updateAvailable && (
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <span>
                                                                    <Button
                                                                        size="icon"
                                                                        variant="ghost"
                                                                        className="min-h-11 min-w-11 md:min-h-9 md:min-w-9"
                                                                        disabled={isUpgradeBlocked}
                                                                        aria-label={
                                                                            isUpgradeBlocked
                                                                                ? `Cannot upgrade while the stack is ${stackStatus}`
                                                                                : `Upgrade ${svc.serviceName}`
                                                                        }
                                                                        onClick={() => setUpgradeTarget(svc)}
                                                                    >
                                                                        <ArrowUpCircle className="h-4 w-4"/>
                                                                    </Button>
                                                                </span>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                {isUpgradeBlocked
                                                                    ? `Cannot upgrade while the stack is ${stackStatus}`
                                                                    : `Upgrade ${svc.serviceName}`}
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    )}
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                className="min-h-11 min-w-11 md:min-h-9 md:min-w-9"
                                                                aria-label={`View logs for ${svc.serviceName}`}
                                                                onClick={() => onViewLogs(svc.serviceName)}
                                                            >
                                                                <FileText className="h-4 w-4"/>
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>{`View logs for ${svc.serviceName}`}</TooltipContent>
                                                    </Tooltip>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                className="min-h-11 min-w-11 md:min-h-9 md:min-w-9"
                                                                aria-label={historyLabel}
                                                                aria-expanded={isExpanded}
                                                                aria-controls={`health-history-${svc.serviceName}`}
                                                                onClick={() => toggleExpanded(svc.serviceName)}
                                                            >
                                                                <History className="h-4 w-4"/>
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>{historyLabel}</TooltipContent>
                                                    </Tooltip>
                                                </div>
                                            </TooltipProvider>
                                        </TableCell>
                                    </TableRow>
                                    {isExpanded && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="bg-muted/50">
                                                <ServiceHealthTimeline
                                                    serviceName={svc.serviceName}
                                                    events={serviceEvents}
                                                    loading={healthEventsLoading}
                                                    error={healthEventsError}
                                                    onRetry={onRetryHealthEvents}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </Fragment>
                            );
                        })}
                    </TableBody>
                </Table>
            )}

            {upgradeTarget && (
                <ServiceUpgradeDialog
                    stackId={stackId}
                    serviceName={upgradeTarget.serviceName}
                    currentTag={upgradeTarget.imageTag ?? "latest"}
                    open={upgradeTarget !== null}
                    onOpenChange={(open) => {
                        if (!open) setUpgradeTarget(null);
                    }}
                    onUpgraded={onUpgraded}
                />
            )}
        </Section>
    );
}
