import {type JSX, type ReactNode, useMemo} from "react";
import {useSearchParams} from "react-router";
import {Skeleton} from "@/components/ui/skeleton";
import type {SortDirection} from "./sortable-head";
import {TableContent} from "./table-content";
import {PAGE_SIZE_OPTIONS, TablePagination} from "./table-pagination";
import {useColumnSort} from "./use-column-sort";

/** Controlled sort: the consumer owns the order and only learns about toggles. */
export interface ColumnSort {
    readonly direction: SortDirection;
    readonly onToggle: () => void;
}

export type DataTableLayout =
    | {readonly mode: "table"; readonly columnCount: number}
    | {readonly mode: "cards"};

export interface TableColumn<T> {
    name: string;
    render: (item: T) => ReactNode;
    isKey?: boolean;
    /** Typography/colour classes; applied to the table cell and to the field in the mobile card layout. */
    className?: string;
    /** Table-only layout classes (widths, truncation anchors); ignored in the mobile card layout. */
    tableClassName?: string;
    headerClassName?: string;
    align?: "left" | "right";
    /** Keeps the header as a column header but visible to screen readers only. */
    hideHeader?: boolean;
    /** Makes the column sortable by the table itself (ascending, descending, none). */
    sortValue?: (item: T) => string | number;
    /** Makes the column sortable by the consumer; wins over `sortValue`. */
    sort?: ColumnSort;
}

export interface DataTableProps<T> {
    data: readonly T[];
    columns: readonly TableColumn<T>[];
    getRowKey?: (item: T, index: number) => string;
    itemRoute?: (item: T) => string;
    loading?: boolean;
    emptyMessage: string;
    emptyDescription?: string;
    pagination?: boolean;
    defaultPageSize?: number;
    /** Content rendered directly after an item's row (table) or inside its card (cards). */
    renderExpanded?: (item: T, layout: DataTableLayout) => ReactNode;
    /** One cell per column; a TableFooter row on desktop, a summary line below the cards on mobile. */
    footer?: readonly ReactNode[];
}

function defaultGetRowKey<T>(_item: T, index: number): string {
    return String(index);
}

// The page and pageSize query params are user-controlled URL input, so only accept sane values.
function parsePage(raw: string | null): number {
    const parsed = Math.floor(Number(raw));
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

function parsePageSize(raw: string | null, fallback: number): number {
    const requested = Number(raw);
    return PAGE_SIZE_OPTIONS.includes(requested) ? requested : fallback;
}

export function DataTable<T>({
    data,
    columns,
    getRowKey = defaultGetRowKey,
    itemRoute,
    loading = false,
    emptyMessage,
    emptyDescription,
    pagination = true,
    defaultPageSize = 10,
    renderExpanded,
    footer,
}: Readonly<DataTableProps<T>>): JSX.Element {
    const [searchParams] = useSearchParams();
    const {columns: resolvedColumns, data: sortedData} = useColumnSort(data, columns);

    const page = pagination ? parsePage(searchParams.get("page")) : 1;
    const pageSize = pagination ? parsePageSize(searchParams.get("pageSize"), defaultPageSize) : sortedData.length;
    const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
    const currentPage = Math.min(page, totalPages);

    const pageData = useMemo(() => {
        if (!pagination) return sortedData;
        const start = (currentPage - 1) * pageSize;
        return sortedData.slice(start, start + pageSize);
    }, [sortedData, currentPage, pageSize, pagination]);

    if (loading) {
        return (
            <div className="space-y-3">
                {Array.from({length: 3}).map((_, i) => (
                    <Skeleton key={`skeleton-${String(i)}`} className="h-12 w-full" />
                ))}
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="space-y-1 py-12 text-center">
                <p className="text-sm font-medium">{emptyMessage}</p>
                {emptyDescription && <p className="text-sm text-muted-foreground">{emptyDescription}</p>}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <TableContent
                data={pageData}
                columns={resolvedColumns}
                itemRoute={itemRoute}
                getRowKey={getRowKey}
                renderExpanded={renderExpanded}
                footer={footer}
            />
            {pagination && data.length > pageSize && (
                <TablePagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    totalItems={data.length}
                />
            )}
        </div>
    );
}
