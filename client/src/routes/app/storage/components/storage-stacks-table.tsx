import {Fragment, useState} from "react";
import {Link} from "react-router";
import {ArrowDown, ArrowUp, ArrowUpDown, ChevronRight} from "lucide-react";
import {Button} from "@/components/ui/button";
import {EmptyState} from "@/components/common/empty-state";
import {Section, SectionHeader, SectionTitle} from "@/components/common/layout/section";
import {Skeleton} from "@/components/ui/skeleton";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip";
import {cn} from "@/lib/utils";
import {formatBytes} from "@/lib/format-bytes";
import type {StorageStack} from "@/lib/storage-api";
import {
    ariaSortFor,
    DEFAULT_STORAGE_SORT,
    formatVolumeCount,
    nextStorageSort,
    sortStorageStacks,
    sortStorageVolumes,
    type StorageSort,
    type StorageSortKey,
} from "@/lib/storage-view";

const TOUCH_TARGET = "min-h-11 min-w-11 md:min-h-9 md:min-w-9";

interface SortableHeadProps {
    readonly label: string;
    readonly sortKey: StorageSortKey;
    readonly sort: StorageSort;
    readonly onSort: (key: StorageSortKey) => void;
    readonly align?: "left" | "right";
}

function sortIcon(sort: StorageSort, key: StorageSortKey) {
    if (sort.key !== key) return ArrowUpDown;
    return sort.direction === "asc" ? ArrowUp : ArrowDown;
}

function SortableHead({label, sortKey, sort, onSort, align = "left"}: Readonly<SortableHeadProps>) {
    const Icon = sortIcon(sort, sortKey);

    return (
        <TableHead aria-sort={ariaSortFor(sort, sortKey)} className={align === "right" ? "text-right" : undefined}>
            <Button
                variant="ghost"
                size="sm"
                className={align === "right" ? "-mr-2" : "-ml-2"}
                onClick={() => onSort(sortKey)}
            >
                {label}
                <Icon className="h-4 w-4" aria-hidden="true"/>
            </Button>
        </TableHead>
    );
}

interface StackRowsProps {
    readonly stack: StorageStack;
    readonly sort: StorageSort;
    readonly open: boolean;
    readonly onToggle: (stackId: string) => void;
}

function stackHint(stack: StorageStack): string {
    if (stack.volumeSizeBytes === null) return "Not measured";
    if (stack.volumes.length === 0) return "No volumes found in this stack's volumes folder.";
    return formatVolumeCount(stack.volumes.length);
}

function StackRows({stack, sort, open, onToggle}: Readonly<StackRowsProps>) {
    const expandable = stack.volumeSizeBytes !== null && stack.volumes.length > 0;
    const groupId = `storage-volumes-${stack.stackId}`;
    const label = `${open ? "Hide" : "Show"} volumes for ${stack.displayName}`;

    return (
        <Fragment>
            <TableRow>
                <TableCell>
                    {expandable ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    className={TOUCH_TARGET}
                                    aria-label={label}
                                    aria-expanded={open}
                                    aria-controls={groupId}
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
                    ) : (
                        <span className={cn("inline-block", TOUCH_TARGET)} aria-hidden="true"/>
                    )}
                </TableCell>
                <TableCell className="w-full max-w-0 font-medium">
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
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatBytes(stack.volumeSizeBytes)}</TableCell>
            </TableRow>
            {open &&
                sortStorageVolumes(stack.volumes, sort).map((volume, index) => (
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

    const toggle = (stackId: string) => {
        setExpanded((current) => {
            const next = new Set(current);
            if (!next.delete(stackId)) next.add(stackId);
            return next;
        });
    };

    return (
        <Section>
            <SectionHeader>
                <SectionTitle>Stacks</SectionTitle>
            </SectionHeader>

            {loading && (
                <div className="space-y-2">
                    {[0, 1, 2].map((index) => (
                        <Skeleton key={index} className="h-12 w-full"/>
                    ))}
                </div>
            )}

            {!loading && stacks.length === 0 && (
                <EmptyState heading="No stacks to measure">
                    Create or import a stack and its disk usage will appear here after the next measurement.
                </EmptyState>
            )}

            {!loading && stacks.length > 0 && measuredAt === null && (
                <EmptyState heading="Disk usage hasn't been measured yet">
                    Docktor measures stack volumes and backups once a day. The first measurement appears shortly after
                    startup.
                </EmptyState>
            )}

            {!loading && stacks.length > 0 && measuredAt !== null && (
                <TooltipProvider>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-12">
                                    <span className="sr-only">Volumes</span>
                                </TableHead>
                                <SortableHead label="Stack" sortKey="name" sort={sort} onSort={handleSort}/>
                                <SortableHead label="Size" sortKey="size" sort={sort} onSort={handleSort} align="right"/>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortStorageStacks(stacks, sort).map((stack) => (
                                <StackRows
                                    key={stack.stackId}
                                    stack={stack}
                                    sort={sort}
                                    open={expanded.has(stack.stackId)}
                                    onToggle={toggle}
                                />
                            ))}
                        </TableBody>
                    </Table>
                </TooltipProvider>
            )}
        </Section>
    );
}
