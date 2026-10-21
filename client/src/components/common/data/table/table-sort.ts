import type {SortDirection} from "./sortable-head";

export function nextSortDirection(current: SortDirection): SortDirection {
    if (current === "none") return "asc";
    if (current === "asc") return "desc";
    return "none";
}

function compareValues(a: string | number, b: string | number): number {
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b));
}

export function sortRows<T>(
    data: readonly T[],
    sortValue: (item: T) => string | number,
    direction: SortDirection,
): readonly T[] {
    if (direction === "none") return data;
    const factor = direction === "asc" ? 1 : -1;
    // Array.prototype.sort is stable, so ties keep their input order.
    return [...data].sort((a, b) => factor * compareValues(sortValue(a), sortValue(b)));
}
