import {EmptyState} from "@/components/common/empty-state";
import {Section, SectionDescription, SectionHeader, SectionTitle} from "@/components/common/layout/section";
import {Skeleton} from "@/components/ui/skeleton";
import {Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {formatBytes} from "@/lib/format-bytes";
import type {StorageBackup} from "@/lib/storage-api";

export interface StorageBackupsSectionProps {
    readonly backups: readonly StorageBackup[];
    readonly loading: boolean;
}

function bySizeDescending(a: StorageBackup, b: StorageBackup): number {
    return b.sizeBytes - a.sizeBytes || a.displayName.localeCompare(b.displayName);
}

// D-14 (amended): one row per stack with a local restic repository. No sort
// controls — it is a secondary list, always largest first.
export function StorageBackupsSection({backups, loading}: Readonly<StorageBackupsSectionProps>) {
    const rows = [...backups].sort(bySizeDescending);
    const subtotal = rows.reduce((sum, backup) => sum + backup.sizeBytes, 0);

    return (
        <Section>
            <SectionHeader>
                <SectionTitle>Backups</SectionTitle>
            </SectionHeader>
            <SectionDescription>
                Local restic repositories stored inside each stack folder. Remote repositories (SFTP, S3) use no local
                disk.
            </SectionDescription>

            {loading && (
                <div className="space-y-2">
                    {[0, 1, 2].map((index) => (
                        <Skeleton key={index} className="h-12 w-full"/>
                    ))}
                </div>
            )}

            {!loading && rows.length === 0 && (
                <EmptyState heading="No local backups">
                    Stacks without a local backup repository don&apos;t appear here.
                </EmptyState>
            )}

            {!loading && rows.length > 0 && (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Stack</TableHead>
                            <TableHead className="text-right">Size</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((backup) => (
                            <TableRow key={backup.stackId}>
                                <TableCell className="w-full max-w-0 font-medium">
                                    <span className="block truncate" title={backup.displayName}>
                                        {backup.displayName}
                                    </span>
                                </TableCell>
                                <TableCell className="text-right tabular-nums">{formatBytes(backup.sizeBytes)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                    <TableFooter>
                        <TableRow>
                            <TableCell>Backups subtotal</TableCell>
                            <TableCell className="text-right tabular-nums">{formatBytes(subtotal)}</TableCell>
                        </TableRow>
                    </TableFooter>
                </Table>
            )}
        </Section>
    );
}
