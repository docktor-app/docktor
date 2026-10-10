import {apiFetch} from "./api";

// Mirrors server/src/routes/storage.ts (GET /api/storage, 14-02). The server
// excludes unmeasured stacks from every total and reports null totals when
// nothing is measured yet.
export interface StorageVolume {
    name: string;
    sizeBytes: number;
}

export interface StorageStack {
    stackId: string;
    displayName: string;
    volumeSizeBytes: number | null;
    measuredAt: string | null;
    volumes: StorageVolume[];
}

export interface StorageBackup {
    stackId: string;
    displayName: string;
    sizeBytes: number;
}

export interface StorageTotals {
    volumesBytes: number | null;
    backupsBytes: number | null;
    totalBytes: number | null;
}

export interface StorageOverview {
    measuredAt: string | null;
    totals: StorageTotals;
    stacks: StorageStack[];
    backups: StorageBackup[];
}

export async function getStorageOverview(): Promise<StorageOverview> {
    return apiFetch<StorageOverview>("/api/storage");
}
