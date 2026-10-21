import {type ReactNode, useState} from "react";
import {ArrowUpCircle, FileText, History} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Section, SectionHeader, SectionTitle} from "@/components/common/layout/section";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip";
import {DataTable, ExpandedRow, type DataTableLayout, type TableColumn} from "@/components/common/data/table";
import {cn} from "@/lib/utils";
import type {Service} from "@/lib/stacks-api";
import type {ServiceHealthEvent} from "@/lib/health-api";
import {formatStatusLabel} from "@/lib/status-labels";
import {TOUCH_TARGET} from "@/lib/touch-target";
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

interface ServiceActionsProps {
    readonly service: Service;
    readonly isUpgradeBlocked: boolean;
    readonly blockedLabel: string;
    readonly isExpanded: boolean;
    readonly onUpgrade: (service: Service) => void;
    readonly onViewLogs: (serviceName: string) => void;
    readonly onToggleHistory: (serviceName: string) => void;
}

function ServiceActions({
    service,
    isUpgradeBlocked,
    blockedLabel,
    isExpanded,
    onUpgrade,
    onViewLogs,
    onToggleHistory,
}: Readonly<ServiceActionsProps>) {
    const upgradeLabel = isUpgradeBlocked ? blockedLabel : `Upgrade ${service.serviceName}`;
    const logsLabel = `View logs for ${service.serviceName}`;
    const historyLabel = `${isExpanded ? "Hide" : "Show"} health history for ${service.serviceName}`;

    return (
        <TooltipProvider>
            <div className="flex items-center gap-1">
                {service.updateAvailable && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className={TOUCH_TARGET}
                                    disabled={isUpgradeBlocked}
                                    aria-label={upgradeLabel}
                                    onClick={() => onUpgrade(service)}
                                >
                                    <ArrowUpCircle className="h-4 w-4"/>
                                </Button>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>{upgradeLabel}</TooltipContent>
                    </Tooltip>
                )}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            size="icon"
                            variant="ghost"
                            className={TOUCH_TARGET}
                            aria-label={logsLabel}
                            onClick={() => onViewLogs(service.serviceName)}
                        >
                            <FileText className="h-4 w-4"/>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>{logsLabel}</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            size="icon"
                            variant="ghost"
                            className={TOUCH_TARGET}
                            aria-label={historyLabel}
                            aria-expanded={isExpanded}
                            aria-controls={`health-history-${service.serviceName}`}
                            onClick={() => onToggleHistory(service.serviceName)}
                        >
                            <History className="h-4 w-4"/>
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>{historyLabel}</TooltipContent>
                </Tooltip>
            </div>
        </TooltipProvider>
    );
}

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

    // RESEARCH Open Question 4: there is no DB probe column, so a service
    // reads as probed once it has any http-probe event.
    const eventsFor = (serviceName: string): readonly ServiceHealthEvent[] =>
        healthEventsByService.get(serviceName) ?? NO_HEALTH_EVENTS;
    const isProbed = (serviceName: string): boolean =>
        eventsFor(serviceName).some((event) => event.source === "http-probe");

    const blockedLabel = `Cannot upgrade while the stack is ${formatStatusLabel(stackStatus)}`;

    const columns: TableColumn<Service>[] = [
        {
            name: "Name",
            isKey: true,
            render: (svc) => (
                <span className="inline-flex items-center gap-2">
                    <span
                        className={cn("size-2 shrink-0 rounded-full bg-current", getServiceColor(svc.serviceName))}
                        aria-hidden="true"
                    />
                    <span className="font-mono text-xs">{svc.serviceName}</span>
                </span>
            ),
        },
        {
            name: "Status",
            render: (svc) => (
                <div className="flex flex-wrap items-center gap-1">
                    <ServiceStatusBadge
                        containerState={svc.containerState}
                        healthStatus={svc.healthStatus}
                        display="compact"
                    />
                    {isProbed(svc.serviceName) && <ToneBadge tone="neutral">HTTP probe</ToneBadge>}
                </div>
            ),
        },
        {
            name: "Image",
            render: (svc) => (
                <div className="flex flex-row flex-wrap items-center gap-2">
                    <span className="font-mono text-xs break-all">{svc.image}</span>
                    <ServiceUpdateBadge updateAvailable={svc.updateAvailable} latestTag={svc.latestTag}/>
                </div>
            ),
        },
        {
            name: "Tag",
            render: (svc) => <span className="font-mono text-xs">{svc.imageTag ?? "latest"}</span>,
        },
        {
            name: "Ports",
            className: "font-mono text-xs text-muted-foreground",
            render: (svc) => formatPorts(parsePorts(svc.ports)),
        },
        {
            name: "Actions",
            hideHeader: true,
            render: (svc) => (
                <ServiceActions
                    service={svc}
                    isUpgradeBlocked={isUpgradeBlocked}
                    blockedLabel={blockedLabel}
                    isExpanded={expanded.has(svc.serviceName)}
                    onUpgrade={setUpgradeTarget}
                    onViewLogs={onViewLogs}
                    onToggleHistory={toggleExpanded}
                />
            ),
        },
    ];

    const renderExpanded = (svc: Service, layout: DataTableLayout): ReactNode => {
        if (!expanded.has(svc.serviceName)) return null;
        const timeline = (
            <ServiceHealthTimeline
                serviceName={svc.serviceName}
                events={eventsFor(svc.serviceName)}
                loading={healthEventsLoading}
                error={healthEventsError}
                onRetry={onRetryHealthEvents}
            />
        );
        if (layout.mode === "cards") return timeline;
        return <ExpandedRow columnCount={layout.columnCount}>{timeline}</ExpandedRow>;
    };

    return (
        <Section>
            <SectionHeader>
                <SectionTitle>Services</SectionTitle>
            </SectionHeader>

            <DataTable
                data={services}
                columns={columns}
                getRowKey={(svc) => svc.id}
                pagination={false}
                emptyMessage="No services defined"
                emptyDescription="Add a service to the compose file and deploy to see it here."
                renderExpanded={renderExpanded}
            />

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
