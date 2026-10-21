import type {ReactNode} from "react";
import {Card, CardContent, CardHeader} from "@/components/ui/card";
import {Skeleton} from "@/components/ui/skeleton";
import {cn} from "@/lib/utils";

export interface StatCardProps {
    readonly label: string;
    readonly value: number | string;
    readonly icon: ReactNode;
    readonly loading?: boolean;
    readonly valueClassName?: string;
    /** Optional one-line caption under the value, e.g. what the number counts. */
    readonly hint?: string;
}

// Generic, non-domain stat card (CLAUDE.md components/common checklist —
// no domain types in props, all counting logic lives in lib/dashboard-stats.ts).
// KPI value and label render in mono (D-06); the label wraps rather than
// truncating and the icon never shrinks.
export function StatCard({
    label,
    value,
    icon,
    loading = false,
    valueClassName,
    hint,
}: Readonly<StatCardProps>): ReactNode {
    return (
        <Card data-slot="stat-card">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <span className="font-mono text-xs font-normal text-muted-foreground">{label}</span>
                <span className="shrink-0">{icon}</span>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <Skeleton className="h-8 w-16" />
                ) : (
                    <>
                        <div
                            className={cn("font-mono text-2xl font-semibold tabular-nums truncate", valueClassName)}
                            title={String(value)}
                        >
                            {value}
                        </div>
                        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
                    </>
                )}
            </CardContent>
        </Card>
    );
}
