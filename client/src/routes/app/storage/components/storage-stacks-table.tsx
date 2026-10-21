import {Fragment, type ReactNode, useState} from "react";
import {Link} from "react-router";
import {ChevronRight} from "lucide-react";
import {Button} from "@/components/ui/button";
import {DataTable, type DataTableLayout, TableCell, TableRow, type TableColumn} from "@/components/common/data/table";
import {EmptyState} from "@/components/common/empty-state";
import {Section, SectionHeader, SectionTitle} from "@/components/common/layout/section";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip";
import {cn} from "@/lib/utils";
import {formatBytes} from "@/lib/format-bytes";
import type {StorageStack} from "@/lib/storage-api";
import {
    DEFAULT_STORAGE_SORT,
    formatVolumeCount,
    nextStorageSort,
    sortStorageStacks,
    sortStorageVolumes,
    type StorageSort,
    type StorageSortKey,
} from "@/lib/storage-view";
import {TOUCH_TARGET} from "@/lib/touch-target";

function stackHint(stack: StorageStack): string {
    if (stack.volumeSizeBytes === null) return "Not measured";
    if (stack.volumes.length === 0) return "No volumes found in this stack's volumes folder.";
    return formatVolumeCount(stack.volumes.length);
}

function isExpandable(stack: StorageStack): boolean {
    return stack.volumeSizeBytes !== null && stack.volumes.length > 0;
}

function volumeGroupId(stack: StorageStack): string {
    return `storage-volumes-${stack.stackId}`;
}

interface ExpanderProps {
    readonly stack: StorageStack;
    readonly open: boolean;
    readonly onToggle: (stackId: string) => void;
}

function Expander({stack, open, onToggle}: Readonly<ExpanderProps>) {
    if (!isExpandable(stack)) {
        // Reserves the same slot as the button so names stay aligned.
        return <span className={cn("inline-block size-9", TOUCH_TARGET)} aria-hidden="true"/>;
    }

    const label = `${open ? "Hide" : "Show"} volumes for ${stack.displayName}`;

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    size="icon"
                    variant="ghost"
                    className={TOUCH_TARGET}
                    aria-label={label}
                    aria-expanded={open}
                    aria-controls={volumeGroupId(stack)}
                    onClick={() => onToggle(stack.stackId)}
                >
                    <ChevronRight
                        className={cn(
                            "h-4 w-4 transition-transform motion-reduce:transition-none",
                            open && "rotate-90",
                        )}
                    />
                </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}

function StackNameCell({stack}: Readonly<{stack: StorageStack}>) {
    return (
        <div className="flex min-w-0 flex-col sm:flex-row sm:items-center sm:gap-2">
            <Link
                to={`/stacks/${encodeURIComponent(stack.stackId)}`}
                className="truncate hover:underline"
                title={stack.displayName}
            >
                {stack.displayName}
            </Link>
            <span className="text-xs font-normal whitespace-normal text-muted-foreground sm:shrink-0">
                {stackHint(stack)}
            </span>
        </div>
    );
}

interface VolumeRowsProps {
    readonly stack: StorageStack;
    readonly sort: StorageSort;
    readonly layout: DataTableLayout;
}

// One aligned row per volume on desktop; a compact "name · size" list in a card.
function VolumeRows({stack, sort, layout}: Readonly<VolumeRowsProps>) {
    const groupId = volumeGroupId(stack);
    const volumes = sortStorageVolumes(stack.volumes, sort);

    if (layout.mode === "cards") {
        return (
            <ul id={groupId} className="space-y-1 text-sm text-muted-foreground">
                {volumes.map((volume) => (
                    <li key={volume.name} className="truncate" title={volume.name}>
                        {volume.name} · {formatBytes(volume.sizeBytes)}
                    </li>
                ))}
            </ul>
        );
    }

    return (
        <Fragment>
            {volumes.map((volume, index) => (
                <TableRow key={volume.name} id={index === 0 ? groupId : undefined} className="bg-muted/50">
                    <TableCell/>
                    <TableCell className="max-w-0 pl-8">
                        <span className="block truncate" title={volume.name}>
                            {volume.name}
                        </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatBytes(volume.sizeBytes)}</TableCell>
                </TableRow>
            ))}
        </Fragment>
    );
}

export interface StorageStacksTableProps {
    readonly stacks: readonly StorageStack[];
    readonly measuredAt: string | null;
    readonly loading: boolean;
}

export function StorageStacksTable({stacks, measuredAt, loading}: Readonly<StorageStacksTableProps>) {
    const [sort, setSort] = useState<StorageSort>(DEFAULT_STORAGE_SORT);
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

    const handleSort = (key: StorageSortKey) => setSort((current) => nextStorageSort(current, key));
    const directionFor = (key: StorageSortKey) => (sort.key === key ? sort.direction : "none");

    const toggle = (stackId: string) => {
        setExpanded((current) => {
            const next = new Set(current);
            if (!next.delete(stackId)) next.add(stackId);
            return next;
        });
    };

    const columns: readonly TableColumn<StorageStack>[] = [
        {
            name: "Volumes",
            hideHeader: true,
            headerClassName: "w-12",
            render: (stack) => <Expander stack={stack} open={expanded.has(stack.stackId)} onToggle={toggle}/>,
        },
        {
            name: "Stack",
            isKey: true,
            className: "w-full max-w-0 font-medium",
            sort: {direction: directionFor("name"), onToggle: () => handleSort("name")},
            render: (stack) => <StackNameCell stack={stack}/>,
        },
        {
            name: "Size",
            align: "right",
            className: "tabular-nums",
            sort: {direction: directionFor("size"), onToggle: () => handleSort("size")},
            render: (stack) => formatBytes(stack.volumeSizeBytes),
        },
    ];

    const renderExpanded = (stack: StorageStack, layout: DataTableLayout): ReactNode =>
        expanded.has(stack.stackId) && isExpandable(stack) ? (
            <VolumeRows stack={stack} sort={sort} layout={layout}/>
        ) : null;

    const unmeasured = !loading && stacks.length > 0 && measuredAt === null;

    return (
        <Section>
            <SectionHeader>
                <SectionTitle>Stacks</SectionTitle>
            </SectionHeader>

            {unmeasured ? (
                <EmptyState heading="Disk usage hasn't been measured yet">
                    Docktor measures stack volumes and backups once a day. The first measurement appears shortly after
                    startup.
                </EmptyState>
            ) : (
                <TooltipProvider>
                    <DataTable
                        data={sortStorageStacks(stacks, sort)}
                        columns={columns}
                        getRowKey={(stack) => stack.stackId}
                        loading={loading}
                        emptyMessage="No stacks to measure"
                        emptyDescription="Create or import a stack and its disk usage will appear here after the next measurement."
                        renderExpanded={renderExpanded}
                        pagination={false}
                    />
                </TooltipProvider>
            )}
        </Section>
    );
}
