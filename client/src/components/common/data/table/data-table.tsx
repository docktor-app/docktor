import {type JSX, type ReactNode, useMemo} from "react";
import {useSearchParams} from "react-router";
import {Skeleton} from "@/components/ui/skeleton";
import {TableContent} from "./table-content";
import {TablePagination} from "./table-pagination";

export interface TableColumn<T> {
    name: string;
    render: (item: T) => ReactNode;
    isKey?: boolean;
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
}

function defaultGetRowKey<T>(_item: T, index: number): string {
    return String(index);
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
}: Readonly<DataTableProps<T>>): JSX.Element {
    const [searchParams] = useSearchParams();

    const page = pagination ? Math.max(1, Number(searchParams.get("page")) || 1) : 1;
    const pageSize = pagination
        ? Number(searchParams.get("pageSize")) || defaultPageSize
        : data.length;
    const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
    const currentPage = Math.min(page, totalPages);

    const pageData = useMemo(() => {
        if (!pagination) return data;
        const start = (currentPage - 1) * pageSize;
        return data.slice(start, start + pageSize);
    }, [data, currentPage, pageSize, pagination]);

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
                columns={columns}
                itemRoute={itemRoute}
                getRowKey={getRowKey}
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
