import {Link} from "react-router";

import {useBackupHistory} from "@/hooks/use-backup-history";
import {BackupStatusBadge} from "@/components/domain/backup/backup-status-badge";
import {BackupTriggerBadge} from "@/components/domain/backup/backup-trigger-badge";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {ScrollArea} from "@/components/ui/scroll-area";
import {formatDuration, formatSize} from "@/lib/backup-format";

interface BackupHistoryProps {
    readonly stackId: string;
    readonly stackStatus?: string;
}

export function BackupHistory({stackId, stackStatus}: Readonly<BackupHistoryProps>) {
    const {backups, loading} = useBackupHistory(stackId, stackStatus);

    return (
        <div className="space-y-3">
            <h2 className="text-lg font-semibold">History</h2>

            {loading ? (
                <p className="text-muted-foreground text-sm">Loading...</p>
            ) : backups.length === 0 ? (
                <div className="text-center py-8 space-y-1">
                    <p className="text-sm font-medium">No backups yet</p>
                    <p className="text-sm text-muted-foreground">
                        Trigger your first backup using the Backup Now button above.
                    </p>
                </div>
            ) : (
                <ScrollArea className="h-96">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Status</TableHead>
                                <TableHead>Trigger</TableHead>
                                <TableHead>Started</TableHead>
                                <TableHead>Duration</TableHead>
                                <TableHead>Size</TableHead>
                                <TableHead></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {backups.map((backup) => (
                                <TableRow key={backup.id}>
                                    <TableCell>
                                        <BackupStatusBadge status={backup.status} />
                                    </TableCell>
                                    <TableCell>
                                        <BackupTriggerBadge trigger={backup.trigger} />
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {new Date(backup.startedAt).toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-sm">
                                        {formatDuration(backup.startedAt, backup.completedAt)}
                                    </TableCell>
                                    <TableCell className="text-sm">
                                        {formatSize(backup.sizeBytes)}
                                    </TableCell>
                                    <TableCell>
                                        <Link
                                            to={`/stacks/${stackId}/backups/${backup.id}`}
                                            className="text-sm text-primary hover:underline"
                                        >
                                            View details
                                        </Link>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </ScrollArea>
            )}
        </div>
    );
}
