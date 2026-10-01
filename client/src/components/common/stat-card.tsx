import type {ReactNode} from "react";
import {Card, CardContent, CardHeader} from "@/components/ui/card";
import {Skeleton} from "@/components/ui/skeleton";
import {cn} from "@/lib/utils";

export interface StatCardProps {
    label: string;
    value: number | string;
    icon: ReactNode;
    loading?: boolean;
    valueClassName?: string;
}

// Generic, non-domain stat card (CLAUDE.md components/common checklist —
// no domain types in props, all counting logic lives in lib/dashboard-stats.ts).
export function StatCard({label, value, icon, loading = false, valueClassName}: Readonly<StatCardProps>) {
    return (
        <Card data-slot="stat-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <span className="text-sm font-normal text-muted-foreground">{label}</span>
                {icon}
            </CardHeader>
            <CardContent>
                {loading ? (
                    <Skeleton className="h-8 w-12" />
                ) : (
                    <div
                        className={cn("text-2xl font-semibold tabular-nums truncate", valueClassName)}
                        title={String(value)}
                    >
                        {value}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
