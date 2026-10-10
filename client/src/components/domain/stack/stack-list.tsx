import {useMemo} from "react";

import {DataTable, type TableColumn} from "@/components/common/data/table";
import {ToneBadge} from "@/components/common/tone-badge";
import {StackStatusBadge} from "@/components/domain/stack/stack-status-badge";
import {StackUpdateBadge} from "@/components/domain/stack/stack-update-badge";
import {UptimeBadge} from "@/components/domain/stack/uptime-badge";
import {Skeleton} from "@/components/ui/skeleton";
import type {StackWithServices} from "@/lib/stacks-api";

export interface StackListUptimes {
    byStackId: ReadonlyMap<string, number | null>;
    windowDays: number | null;
    loading: boolean;
}

interface StackListProps {
    stacks: StackWithServices[];
    loading?: boolean;
    pagination?: boolean;
    uptimes?: StackListUptimes;
}

const baseColumns: TableColumn<StackWithServices>[] = [
    {
        name: "Name",
        isKey: true,
        render: (stack) => (
            <div>
                <span className="font-medium">{stack.displayName}</span>
                {stack.description && (
                    <p className="text-sm text-muted-foreground">
                        {stack.description}
                    </p>
                )}
            </div>
        ),
    },
    {
        name: "Status",
        render: (stack) => (
            <div className="flex flex-wrap items-center gap-1">
                <StackStatusBadge status={stack.status} display="compact" />
                {stack.configError && <ToneBadge tone="red">config error</ToneBadge>}
                {stack.configChanged && <ToneBadge tone="yellow">config changed</ToneBadge>}
                <StackUpdateBadge services={stack.services} />
            </div>
        ),
    },
    {
        name: "Services",
        render: (stack) => <span>{stack.services.length}</span>,
    },
    {
        name: "Created",
        render: (stack) => (
            <span className="text-muted-foreground">
                {new Date(stack.createdAt).toLocaleDateString()}
            </span>
        ),
    },
];

function uptimeColumn(uptimes: StackListUptimes): TableColumn<StackWithServices> {
    return {
        name: "Uptime",
        render: (stack) =>
            uptimes.loading ? (
                <Skeleton className="h-5 w-12" />
            ) : (
                <UptimeBadge percent={uptimes.byStackId.get(stack.id) ?? null} windowDays={uptimes.windowDays} />
            ),
    };
}

export function StackList({stacks, loading, pagination, uptimes}: Readonly<StackListProps>) {
    // The Uptime column sits between Status and Services and exists only when
    // the page supplies uptime data; StackList itself fetches nothing.
    const columns = useMemo(
        () => (uptimes ? [...baseColumns.slice(0, 2), uptimeColumn(uptimes), ...baseColumns.slice(2)] : baseColumns),
        [uptimes],
    );

    return (
        <DataTable
            data={stacks}
            columns={columns}
            getRowKey={(stack) => stack.id}
            itemRoute={(stack) => `/stacks/${stack.id}`}
            loading={loading}
            emptyMessage="No stacks yet"
            pagination={pagination}
        />
    );
}
