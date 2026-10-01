import {Archive, ArrowUpCircle, AlertTriangle, Layers, Play, Square} from "lucide-react";
import {StatCard} from "@/components/common/stat-card";
import type {DashboardStats} from "@/lib/dashboard-stats";

export interface DashboardStatCardsProps {
    stats: DashboardStats;
    loading: boolean;
    stacksError: string | null;
    defaultsError: string | null;
}

// D-14: six stat cards, all rendered by the generic StatCard. UI-SPEC error
// row — every card shows an em dash when the stacks request fails; only
// Backups Configured shows one when just the backup-defaults request fails.
export function DashboardStatCards({
    stats,
    loading,
    stacksError,
    defaultsError,
}: Readonly<DashboardStatCardsProps>) {
    const value = (count: number): number | string => (stacksError ? "—" : count);
    const backupsValue: number | string = stacksError || defaultsError ? "—" : stats.backupsConfigured;

    return (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <StatCard
                label="Total Stacks"
                value={value(stats.total)}
                icon={<Layers className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                loading={loading}
            />
            <StatCard
                label="Running"
                value={value(stats.running)}
                icon={<Play className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                loading={loading}
                valueClassName="text-green-600 dark:text-green-400"
            />
            <StatCard
                label="Stopped"
                value={value(stats.stopped)}
                icon={<Square className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                loading={loading}
            />
            <StatCard
                label="Errors"
                value={value(stats.errors)}
                icon={<AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden="true" />}
                loading={loading}
                valueClassName="text-red-600 dark:text-red-400"
            />
            <StatCard
                label="Updates Available"
                value={value(stats.updatesAvailable)}
                icon={<ArrowUpCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />}
                loading={loading}
            />
            <StatCard
                label="Backups Configured"
                value={backupsValue}
                icon={<Archive className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                loading={loading}
            />
        </div>
    );
}
