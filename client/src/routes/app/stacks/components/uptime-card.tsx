import type {ReactNode} from "react";
import {Activity, AlertTriangle, HardDrive} from "lucide-react";
import {StatCard} from "@/components/common/stat-card";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip";
import {formatBytes} from "@/lib/format-bytes";
import type {StackUptime} from "@/lib/uptime-api";
import {
    formatUptimePercent,
    formatUptimeWindowLabel,
    getUptimeTone,
    uptimeValueClassName,
} from "@/lib/uptime-format";

export interface UptimeCardProps {
    readonly uptime: StackUptime | null;
    readonly loading: boolean;
    readonly error: string | null;
    readonly volumeSizeBytes: number | null;
}

const ICON_CLASS = "h-4 w-4 text-muted-foreground";
const NO_VALUE = "—";

// D-16 / UI-SPEC C: the stack's availability over the retention window, how
// many incidents it had, and the disk its volumes use (D-15 per-stack figure,
// read from the stack detail already loaded, so it never shows a skeleton).
// A failed uptime request leaves the first two reading an em dash; the error
// itself is reported by the IncidentList beneath.
export function UptimeCard({uptime, loading, error, volumeSizeBytes}: Readonly<UptimeCardProps>) {
    const data = error ? null : uptime;
    const percent = data?.percent ?? null;
    const incidentCount = data?.incidents.length ?? null;
    const hasNoUptimeData = data !== null && percent === null && !loading;

    const uptimeCard = (
        <StatCard
            label={formatUptimeWindowLabel(data)}
            value={formatUptimePercent(percent)}
            icon={<Activity className={ICON_CLASS} aria-hidden="true"/>}
            loading={loading}
            valueClassName={uptimeValueClassName(getUptimeTone(percent))}
        />
    );

    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {hasNoUptimeData ? <NoUptimeDataHint>{uptimeCard}</NoUptimeDataHint> : uptimeCard}
            <StatCard
                label={data ? `Incidents (last ${data.windowDays} days)` : "Incidents"}
                value={incidentCount ?? NO_VALUE}
                icon={<AlertTriangle className={ICON_CLASS} aria-hidden="true"/>}
                loading={loading}
                valueClassName={incidentCount !== null && incidentCount > 0 ? "text-red-600 dark:text-red-400" : undefined}
            />
            <StatCard
                label="Disk Used (volumes)"
                value={formatBytes(volumeSizeBytes)}
                icon={<HardDrive className={ICON_CLASS} aria-hidden="true"/>}
            />
        </div>
    );
}

interface NoUptimeDataHintProps {
    readonly children: ReactNode;
}

// StatCard stays generic, so the "no data" explanation lives in a focusable
// wrapper around it rather than in the card itself.
function NoUptimeDataHint({children}: Readonly<NoUptimeDataHintProps>) {
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div
                        role="group"
                        tabIndex={0}
                        aria-label="No uptime data"
                        className="rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                        {children}
                    </div>
                </TooltipTrigger>
                <TooltipContent>No data in this window</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
