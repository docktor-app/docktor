import {ToneBadge} from "@/components/common/tone-badge";
import {BACKUP_TRIGGER_LABELS} from "@/lib/backup-format";
import type {BackupRecord} from "@/lib/backups-api";

interface BackupTriggerBadgeProps {
    readonly trigger: BackupRecord["trigger"];
}

/** Shared trigger pill (Manual/Scheduled/Restore) for the backup history table and the backup detail page. */
export function BackupTriggerBadge({trigger}: Readonly<BackupTriggerBadgeProps>) {
    return <ToneBadge tone="neutral">{BACKUP_TRIGGER_LABELS[trigger]}</ToneBadge>;
}
