import {Link} from "react-router";

import {useBackupHistory} from "@/hooks/use-backup-history";
import {DataTable, type TableColumn} from "@/components/common/data/table";
import {BackupStatusBadge} from "@/components/domain/backup/backup-status-badge";
import {BackupTriggerBadge} from "@/components/domain/backup/backup-trigger-badge";
import {ScrollArea} from "@/components/ui/scroll-area";
import {formatDuration, formatSize} from "@/lib/backup-format";
import type {BackupRecord} from "@/lib/backups-api";

interface BackupHistoryProps {
    readonly stackId: string;
    readonly stackStatus?: string;
}

function historyColumns(stackId: string): readonly TableColumn<BackupRecord>[] {
    return [
        {name: "Status", render: (backup) => <BackupStatusBadge status={backup.status} />},
        {name: "Trigger", render: (backup) => <BackupTriggerBadge trigger={backup.trigger} />},
        {
            name: "Started",
            className: "text-sm text-muted-foreground",
            render: (backup) => new Date(backup.startedAt).toLocaleString(),
        },
        {
            name: "Duration",
            className: "text-sm tabular-nums",
            render: (backup) => formatDuration(backup.startedAt, backup.completedAt),
        },
        {
            name: "Size",
            align: "right",
            className: "text-sm tabular-nums",
            render: (backup) => formatSize(backup.sizeBytes),
        },
        {
            name: "Details",
            hideHeader: true,
            render: (backup) => (
                <Link
                    to={`/stacks/${stackId}/backups/${backup.id}`}
                    className="text-sm text-primary hover:underline"
                >
                    View details
                </Link>
            ),
        },
    ];
}

export function BackupHistory({stackId, stackStatus}: Readonly<BackupHistoryProps>) {
    const {backups, loading} = useBackupHistory(stackId, stackStatus);

    const table = (
        <DataTable
            data={backups}
            columns={historyColumns(stackId)}
            getRowKey={(backup) => backup.id}
            emptyMessage="No backups yet"
            emptyDescription="Trigger your first backup using the Backup Now button above."
            pagination={false}
        />
    );

    return (
        <div className="space-y-3">
            <h2 className="text-lg font-semibold">History</h2>

            {loading ? (
                <p className="text-muted-foreground text-sm">Loading...</p>
            ) : backups.length === 0 ? (
                table
            ) : (
                <ScrollArea className="h-96">{table}</ScrollArea>
            )}
        </div>
    );
}
