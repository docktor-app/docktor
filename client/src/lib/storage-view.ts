import type {StorageStack, StorageVolume} from "./storage-api";

export type StorageSortKey = "name" | "size";
export type StorageSortDirection = "asc" | "desc";
export type StorageAriaSort = "ascending" | "descending" | "none";

export interface StorageSort {
    key: StorageSortKey;
    direction: StorageSortDirection;
}

export const DEFAULT_STORAGE_SORT: StorageSort = {key: "size", direction: "desc"};

// The measurement job runs daily; two missed days means something is wrong.
export const STORAGE_STALE_AFTER_MS = 48 * 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// A first click on a new column applies its natural direction (name
// ascending, size descending); a second click on the same column reverses.
const NATURAL_DIRECTION: Record<StorageSortKey, StorageSortDirection> = {name: "asc", size: "desc"};

export function nextStorageSort(current: StorageSort, clicked: StorageSortKey): StorageSort {
    if (current.key === clicked) {
        return {key: clicked, direction: current.direction === "asc" ? "desc" : "asc"};
    }
    return {key: clicked, direction: NATURAL_DIRECTION[clicked]};
}

export function ariaSortFor(sort: StorageSort, key: StorageSortKey): StorageAriaSort {
    if (sort.key !== key) return "none";
    return sort.direction === "asc" ? "ascending" : "descending";
}

// Shared by stacks and volumes. A null size (unmeasured) always sorts last,
// in both directions; the rest compare by the chosen key and ties break by
// name ascending.
function sortEntries<T>(
    items: readonly T[],
    sort: StorageSort,
    getName: (item: T) => string,
    getSize: (item: T) => number | null,
): T[] {
    const factor = sort.direction === "asc" ? 1 : -1;

    return [...items].sort((a, b) => {
        const sizeA = getSize(a);
        const sizeB = getSize(b);
        const byName = getName(a).localeCompare(getName(b));

        if (sizeA === null || sizeB === null) {
            if (sizeA === sizeB) return byName;
            return sizeA === null ? 1 : -1;
        }

        const primary = sort.key === "name" ? byName : sizeA - sizeB;
        return primary === 0 ? byName : primary * factor;
    });
}

export function sortStorageStacks(stacks: readonly StorageStack[], sort: StorageSort): StorageStack[] {
    return sortEntries(stacks, sort, (stack) => stack.displayName, (stack) => stack.volumeSizeBytes);
}

export function sortStorageVolumes(volumes: readonly StorageVolume[], sort: StorageSort): StorageVolume[] {
    return sortEntries(volumes, sort, (volume) => volume.name, (volume) => volume.sizeBytes);
}

export function isStorageMeasurementStale(measuredAt: string | null, now: Date): boolean {
    if (measuredAt === null) return false;
    return now.getTime() - new Date(measuredAt).getTime() > STORAGE_STALE_AFTER_MS;
}

function pluralize(count: number, unit: string): string {
    return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

// Whole hours under two days, whole days beyond — "3 days", "30 hours".
export function formatMeasurementAge(measuredAt: string, now: Date): string {
    const elapsed = Math.max(0, now.getTime() - new Date(measuredAt).getTime());
    if (elapsed < 2 * DAY_MS) return pluralize(Math.floor(elapsed / HOUR_MS), "hour");
    return pluralize(Math.floor(elapsed / DAY_MS), "day");
}

export function formatVolumeCount(count: number): string {
    return pluralize(count, "volume");
}
