import {BackupStatusBadge} from "@/components/domain/backup/backup-status-badge";
import {BackupTriggerBadge} from "@/components/domain/backup/backup-trigger-badge";
import {formatDuration, formatSize} from "@/lib/backup-format";
import type {BackupRecord} from "@/lib/backups-api";

interface BackupMetadataProps {
    readonly backup: BackupRecord;
}

/** Flat metadata row (D-03) — no Card — replacing the backup detail page's metadata Card. */
export function BackupMetadata({backup}: Readonly<BackupMetadataProps>) {
    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <BackupStatusBadge status={backup.status} />
            <BackupTriggerBadge trigger={backup.trigger} />
            <span className="text-muted-foreground">
                Started: {new Date(backup.startedAt).toLocaleString()}
            </span>
            <span className="text-muted-foreground">
                Duration: {formatDuration(backup.startedAt, backup.completedAt)}
            </span>
            <span className="text-muted-foreground">Size: {formatSize(backup.sizeBytes)}</span>
        </div>
    );
}
