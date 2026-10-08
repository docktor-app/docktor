/**
 * Pure totals rule for the disk usage overview (#27).
 *
 * The grand total is volumes + backups and never the stack-directory size
 * (D-14 amended): the stack directory already contains `volumes/` and
 * `backups/`, so using it would count the same bytes twice.
 */

export interface DiskUsageRow {
    /** Sum of the stack's `volumes/*` subdirectories; null = never measured. */
    volumeSizeBytes: number | null;
    /** Size of the stack-local restic repository; null = no local repo or never measured. */
    backupSizeBytes: number | null;
    measuredAt: Date | null;
}

export interface DiskUsageTotals {
    volumesBytes: number | null;
    backupsBytes: number | null;
    totalBytes: number | null;
}

/**
 * Only stacks with a measured volume size take part in the totals; an
 * unmeasured stack is excluded rather than counted as zero. When nothing has
 * been measured every total is null ("not measured"), not 0.
 */
export function summarizeDiskUsage(rows: readonly DiskUsageRow[]): DiskUsageTotals {
    const measured = rows.filter((r) => r.volumeSizeBytes !== null);
    if (measured.length === 0) {
        return {volumesBytes: null, backupsBytes: null, totalBytes: null};
    }

    const volumesBytes = measured.reduce((sum, r) => sum + (r.volumeSizeBytes ?? 0), 0);
    const backupsBytes = measured.reduce((sum, r) => sum + (r.backupSizeBytes ?? 0), 0);
    return {volumesBytes, backupsBytes, totalBytes: volumesBytes + backupsBytes};
}
