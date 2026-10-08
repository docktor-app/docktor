import {Archive, Database, HardDrive} from "lucide-react";
import {StatCard} from "@/components/common/stat-card";
import {formatBytes} from "@/lib/format-bytes";
import type {StorageTotals as StorageTotalsData} from "@/lib/storage-api";

export interface StorageTotalsProps {
    readonly totals: StorageTotalsData | null;
    readonly loading: boolean;
}

// D-14 (amended): the grand total is volumes + backups, never the whole stack
// directory, so nothing is counted twice. A null total (nothing measured, or
// the request failed) reads as an em dash.
export function StorageTotals({totals, loading}: Readonly<StorageTotalsProps>) {
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
                label="Total Disk Used"
                value={formatBytes(totals?.totalBytes ?? null)}
                icon={<HardDrive className="h-4 w-4 text-muted-foreground" aria-hidden="true"/>}
                loading={loading}
            />
            <StatCard
                label="Stack Volumes"
                value={formatBytes(totals?.volumesBytes ?? null)}
                icon={<Database className="h-4 w-4 text-muted-foreground" aria-hidden="true"/>}
                loading={loading}
            />
            <StatCard
                label="Local Backups"
                value={formatBytes(totals?.backupsBytes ?? null)}
                icon={<Archive className="h-4 w-4 text-muted-foreground" aria-hidden="true"/>}
                loading={loading}
            />
        </div>
    );
}
