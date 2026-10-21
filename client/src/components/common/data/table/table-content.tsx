import {Fragment, type JSX, type ReactNode} from "react";
import {useNavigate} from "react-router";
import {useIsMobile} from "@/hooks/use-mobile";
import {
    Table,
    TableBody,
    TableCell,
    TableFooter,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {cn} from "@/lib/utils";
import type {DataTableLayout, TableColumn} from "./data-table";
import {SortableHead} from "./sortable-head";
import {ItemLink} from "./item-link";
import {TableCards, titleColumn} from "./table-cards";
import {TableFrame} from "./table-frame";

function cellClass<T>(col: TableColumn<T>): string {
    return cn(col.align === "right" && "text-right", col.className, col.tableClassName);
}

function ColumnHeader<T>({column}: Readonly<{column: TableColumn<T>}>): JSX.Element {
    if (column.sort) {
        return (
            <SortableHead
                label={column.name}
                direction={column.sort.direction}
                onToggle={column.sort.onToggle}
                align={column.align}
                className={column.headerClassName}
            />
        );
    }
    return (
        <TableHead className={cn(column.align === "right" && "text-right", column.headerClassName)}>
            {column.hideHeader ? <span className="sr-only">{column.name}</span> : column.name}
        </TableHead>
    );
}

function FooterRow<T>({columns, footer}: Readonly<{columns: readonly TableColumn<T>[]; footer: readonly ReactNode[]}>): JSX.Element {
    return (
        <TableFooter>
            <TableRow className="hover:bg-transparent">
                {columns.map((col, index) => (
                    <TableCell key={col.name} className={cellClass(col)}>
                        {footer[index]}
                    </TableCell>
                ))}
            </TableRow>
        </TableFooter>
    );
}

interface TableContentProps<T> {
    data: readonly T[];
    columns: readonly TableColumn<T>[];
    itemRoute?: (item: T) => string;
    getRowKey: (item: T, index: number) => string;
    renderExpanded?: (item: T, layout: DataTableLayout) => ReactNode;
    footer?: readonly ReactNode[];
}

export function TableContent<T>({
    data,
    columns,
    itemRoute,
    getRowKey,
    renderExpanded,
    footer,
}: Readonly<TableContentProps<T>>): JSX.Element {
    const isMobile = useIsMobile();
    const navigate = useNavigate();

    if (isMobile) {
        return (
            <TableCards
                data={data}
                columns={columns}
                getRowKey={getRowKey}
                itemRoute={itemRoute}
                renderExpanded={renderExpanded}
                footer={footer}
            />
        );
    }

    const layout: DataTableLayout = {mode: "table", columnCount: columns.length};
    const linkColumn = itemRoute ? titleColumn(columns) : undefined;

    return (
        <TableFrame>
            <Table>
                <TableHeader className="bg-muted/50">
                    <TableRow className="hover:bg-transparent">
                        {columns.map((col) => (
                            <ColumnHeader key={col.name} column={col} />
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((item, index) => (
                        <Fragment key={getRowKey(item, index)}>
                            <TableRow
                                className={cn("hover:bg-muted/30", itemRoute && "cursor-pointer")}
                                onClick={itemRoute ? () => navigate(itemRoute(item)) : undefined}
                            >
                                {columns.map((col) => (
                                    <TableCell key={col.name} className={cellClass(col)}>
                                        {itemRoute && col === linkColumn ? (
                                            <ItemLink to={itemRoute(item)}>{col.render(item)}</ItemLink>
                                        ) : (
                                            col.render(item)
                                        )}
                                    </TableCell>
                                ))}
                            </TableRow>
                            {renderExpanded?.(item, layout)}
                        </Fragment>
                    ))}
                </TableBody>
                {footer && <FooterRow columns={columns} footer={footer} />}
            </Table>
        </TableFrame>
    );
}
