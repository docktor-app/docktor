import type {StorageStack} from "./storage-api";

export type StorageSortKey = "name" | "size";
export type StorageSortDirection = "asc" | "desc";

export interface StorageSort {
    key: StorageSortKey;
    direction: StorageSortDirection;
}

export const DEFAULT_STORAGE_SORT: StorageSort = {key: "size", direction: "desc"};

// Unmeasured stacks (null size) always sort last, in both directions. The
// rest compare by the chosen key; ties break by display name ascending.
export function sortStorageStacks(stacks: readonly StorageStack[], sort: StorageSort): StorageStack[] {
    const factor = sort.direction === "asc" ? 1 : -1;

    return [...stacks].sort((a, b) => {
        if (a.volumeSizeBytes === null || b.volumeSizeBytes === null) {
            if (a.volumeSizeBytes === b.volumeSizeBytes) return a.displayName.localeCompare(b.displayName);
            return a.volumeSizeBytes === null ? 1 : -1;
        }

        const primary = sort.key === "name"
            ? a.displayName.localeCompare(b.displayName)
            : a.volumeSizeBytes - b.volumeSizeBytes;

        return primary !== 0 ? primary * factor : a.displayName.localeCompare(b.displayName);
    });
}
