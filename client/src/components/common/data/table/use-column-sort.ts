import {useCallback, useMemo, useState} from "react";

import type {ColumnSort, TableColumn} from "./data-table";
import type {SortDirection} from "./sortable-head";
import {nextSortDirection, sortRows} from "./table-sort";

interface ActiveSort {
    readonly column: string;
    readonly direction: "asc" | "desc";
}

interface ColumnSortResult<T> {
    readonly columns: readonly TableColumn<T>[];
    readonly data: readonly T[];
}

function directionOf(active: ActiveSort | null, name: string): SortDirection {
    return active?.column === name ? active.direction : "none";
}

/**
 * Resolves the uncontrolled sort of a DataTable: every column that declares
 * `sortValue` without its own `sort` gets a ColumnSort driven by component
 * state, and the data is sorted before the caller paginates it. Controlled
 * columns (`sort` set) pass through untouched and are never re-sorted.
 */
export function useColumnSort<T>(
    data: readonly T[],
    columns: readonly TableColumn<T>[],
): ColumnSortResult<T> {
    const [active, setActive] = useState<ActiveSort | null>(null);

    const toggle = useCallback((name: string): void => {
        setActive((current) => {
            const next = nextSortDirection(directionOf(current, name));
            return next === "none" ? null : {column: name, direction: next};
        });
    }, []);

    const resolved = useMemo(
        () =>
            columns.map((col): TableColumn<T> => {
                if (!col.sortValue || col.sort) return col;
                const sort: ColumnSort = {direction: directionOf(active, col.name), onToggle: () => toggle(col.name)};
                return {...col, sort};
            }),
        [columns, active, toggle],
    );

    const sorted = useMemo(() => {
        const column = active && columns.find((col) => col.name === active.column);
        if (!active || !column?.sortValue || column.sort) return data;
        return sortRows(data, column.sortValue, active.direction);
    }, [data, columns, active]);

    return {columns: resolved, data: sorted};
}
