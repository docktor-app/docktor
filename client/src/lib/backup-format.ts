import type {BackupRecord} from "@/lib/backups-api";

/**
 * Formats the elapsed time between a backup's start and completion.
 * Moved verbatim (same behavior) from the backup detail page and the
 * Backups-tab history table, which previously duplicated this function.
 */
export function formatDuration(startedAt: string, completedAt: string | null): string {
    if (!completedAt) return "In progress...";
    const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
    if (ms < 1000) return "< 1s";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0) return `${seconds}s`;
    return `${minutes}m ${seconds}s`;
}

/**
 * Formats a byte count (as returned by the API, a string) into a
 * human-readable size. Moved verbatim from the same two duplicated sites as
 * formatDuration above.
 */
export function formatSize(sizeBytes: string | null): string {
    if (!sizeBytes) return "-";
    const bytes = Number(sizeBytes);
    if (isNaN(bytes)) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const BACKUP_TRIGGER_LABELS: Record<BackupRecord["trigger"], string> = {
    MANUAL: "Manual",
    SCHEDULED: "Scheduled",
    RESTORE: "Restore",
};
