import {summarizeDiskUsage, type DiskUsageTotals} from "../domain/disk-usage.js";
import type {StackDiskUsageRepository} from "../repositories/stack-disk-usage-repository.js";

export interface StorageVolumeDto {
    name: string;
    sizeBytes: number;
}

export interface StorageStackDto {
    stackId: string;
    displayName: string;
    /** null = not measured yet. */
    volumeSizeBytes: number | null;
    measuredAt: string | null;
    volumes: StorageVolumeDto[];
}

export interface StorageBackupDto {
    stackId: string;
    displayName: string;
    sizeBytes: number;
}

export interface StorageOverview {
    /** The newest per-stack measurement time, or null when nothing has been measured. */
    measuredAt: string | null;
    totals: DiskUsageTotals;
    stacks: StorageStackDto[];
    /** Stacks with a stack-local backup repository, largest first. */
    backups: StorageBackupDto[];
}

/**
 * Read model behind GET /api/storage (#27, D-15 data side). The measurements
 * themselves are written by DiskUsageJob; this service only shapes them.
 */
export class StorageService {
    constructor(private readonly repo: Pick<StackDiskUsageRepository, "findStorageRows">) {}

    async getStorageOverview(): Promise<StorageOverview> {
        const rows = await this.repo.findStorageRows();

        const stacks = rows.map((row): StorageStackDto => ({
            stackId: row.stackId,
            displayName: row.displayName,
            volumeSizeBytes: row.volumeSizeBytes,
            measuredAt: row.measuredAt?.toISOString() ?? null,
            volumes: [...row.volumes].sort((a, b) => b.sizeBytes - a.sizeBytes || a.name.localeCompare(b.name)),
        }));

        const backups = rows
            .flatMap((row): StorageBackupDto[] =>
                row.backupSizeBytes === null
                    ? []
                    : [{stackId: row.stackId, displayName: row.displayName, sizeBytes: row.backupSizeBytes}],
            )
            .sort((a, b) => b.sizeBytes - a.sizeBytes);

        return {
            measuredAt: newestMeasurement(rows.map((row) => row.measuredAt)),
            totals: summarizeDiskUsage(rows),
            stacks,
            backups,
        };
    }
}

function newestMeasurement(times: ReadonlyArray<Date | null>): string | null {
    const present = times.filter((t): t is Date => t !== null);
    if (present.length === 0) return null;
    return new Date(Math.max(...present.map((t) => t.getTime()))).toISOString();
}
