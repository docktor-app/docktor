import {Activity, AlertTriangle, HardDrive} from "lucide-react";
import {StatCard} from "@/components/common/stat-card";
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

// D-16 / UI-SPEC C: the stack's availability over the retention window, how
// many incidents it had, and the disk its volumes use (D-15 per-stack figure,
// read from the stack detail already loaded, so it never shows a skeleton).
export function UptimeCard({uptime, loading, volumeSizeBytes}: Readonly<UptimeCardProps>) {
    const incidentCount = uptime?.incidents.length ?? null;

    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
                label={formatUptimeWindowLabel(uptime)}
                value={formatUptimePercent(uptime?.percent ?? null)}
                icon={<Activity className={ICON_CLASS} aria-hidden="true"/>}
                loading={loading}
                valueClassName={uptimeValueClassName(getUptimeTone(uptime?.percent ?? null))}
            />
            <StatCard
                label={uptime ? `Incidents (last ${uptime.windowDays} days)` : "Incidents"}
                value={incidentCount ?? "—"}
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
