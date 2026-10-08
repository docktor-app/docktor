import {Link} from "react-router";
import {Section, SectionHeader, SectionTitle} from "@/components/common/layout/section";
import {Skeleton} from "@/components/ui/skeleton";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {formatBytes} from "@/lib/format-bytes";
import type {StorageStack} from "@/lib/storage-api";
import {DEFAULT_STORAGE_SORT, sortStorageStacks} from "@/lib/storage-view";

export interface StorageStacksTableProps {
    readonly stacks: readonly StorageStack[];
    readonly loading: boolean;
}

export function StorageStacksTable({stacks, loading}: Readonly<StorageStacksTableProps>) {
    const rows = sortStorageStacks(stacks, DEFAULT_STORAGE_SORT);

    return (
        <Section>
            <SectionHeader>
                <SectionTitle>Stacks</SectionTitle>
            </SectionHeader>

            {loading ? (
                <div className="space-y-2">
                    {[0, 1, 2].map((index) => (
                        <Skeleton key={index} className="h-12 w-full"/>
                    ))}
                </div>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-12">
                                <span className="sr-only">Volumes</span>
                            </TableHead>
                            <TableHead>Stack</TableHead>
                            <TableHead className="text-right">Size</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((stack) => (
                            <TableRow key={stack.stackId}>
                                <TableCell/>
                                <TableCell className="max-w-0 w-full font-medium">
                                    <Link
                                        to={`/stacks/${encodeURIComponent(stack.stackId)}`}
                                        className="block truncate hover:underline"
                                        title={stack.displayName}
                                    >
                                        {stack.displayName}
                                    </Link>
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                    {formatBytes(stack.volumeSizeBytes)}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </Section>
    );
}
