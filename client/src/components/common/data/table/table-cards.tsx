import type {JSX, ReactNode} from "react";
import {useNavigate} from "react-router";

import {Button} from "@/components/ui/button";
import {Card, CardContent} from "@/components/ui/card";
import type {DataTableLayout, TableColumn} from "./data-table";
import {sortIconFor} from "./sortable-head";

const CARDS_LAYOUT: DataTableLayout = {mode: "cards"};

function visibleColumns<T>(columns: readonly TableColumn<T>[]): readonly TableColumn<T>[] {
    return columns.filter((col) => !col.hideHeader);
}

function titleColumn<T>(columns: readonly TableColumn<T>[]): TableColumn<T> {
    return columns.find((col) => col.isKey) ?? visibleColumns(columns)[0] ?? columns[0];
}

function SortToolbar<T>({columns}: Readonly<{columns: readonly TableColumn<T>[]}>): JSX.Element | null {
    const sortable = columns.filter((col) => col.sort);
    if (sortable.length === 0) return null;

    return (
        <div role="group" aria-label="Sort" className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground" aria-hidden="true">
                Sort by
            </span>
            {sortable.map((col) => {
                const direction = col.sort?.direction ?? "none";
                const Icon = sortIconFor(direction);
                return (
                    <Button
                        key={col.name}
                        variant="outline"
                        size="sm"
                        className="min-h-11"
                        aria-pressed={direction !== "none"}
                        onClick={col.sort?.onToggle}
                    >
                        {col.name}
                        <Icon className="h-4 w-4" aria-hidden="true" />
                    </Button>
                );
            })}
        </div>
    );
}

function CardFields<T>({item, columns}: Readonly<{item: T; columns: readonly TableColumn<T>[]}>): JSX.Element {
    const title = titleColumn(columns);
    const others = columns.filter((col) => col !== title);

    return (
        <>
            <div className="font-medium">{title.render(item)}</div>
            {others
                .filter((col) => !col.hideHeader)
                .map((col) => (
                    <div key={col.name} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{col.name}</span>
                        <span>{col.render(item)}</span>
                    </div>
                ))}
            {others
                .filter((col) => col.hideHeader)
                .map((col) => (
                    <div key={col.name} className="text-sm">
                        {col.render(item)}
                    </div>
                ))}
        </>
    );
}

interface ItemCardProps<T> {
    readonly item: T;
    readonly columns: readonly TableColumn<T>[];
    readonly route?: string;
    readonly expanded?: ReactNode;
}

function ItemCard<T>({item, columns, route, expanded}: Readonly<ItemCardProps<T>>): JSX.Element {
    const navigate = useNavigate();

    return (
        <Card
            className={route ? "cursor-pointer hover:bg-accent/50 transition-colors" : ""}
            onClick={route ? () => navigate(route) : undefined}
        >
            <CardContent className="p-4 space-y-2">
                <CardFields item={item} columns={columns} />
                {expanded}
            </CardContent>
        </Card>
    );
}

interface FooterSummaryProps<T> {
    readonly columns: readonly TableColumn<T>[];
    readonly footer: readonly ReactNode[];
}

// Footer cells are positional (one per column), so each is keyed by its column.
function FooterSummary<T>({columns, footer}: Readonly<FooterSummaryProps<T>>): JSX.Element {
    const [first, ...rest] = columns.map((col, index) => ({key: col.name, cell: footer[index]}));

    return (
        <div className="flex items-center justify-between rounded-md border px-4 py-3 text-sm font-medium">
            <span>{first?.cell}</span>
            <span className="flex items-center gap-4">
                {rest.map(({key, cell}) => (
                    <span key={key}>{cell}</span>
                ))}
            </span>
        </div>
    );
}

export interface TableCardsProps<T> {
    readonly data: readonly T[];
    readonly columns: readonly TableColumn<T>[];
    readonly getRowKey: (item: T, index: number) => string;
    readonly itemRoute?: (item: T) => string;
    readonly renderExpanded?: (item: T, layout: DataTableLayout) => ReactNode;
    readonly footer?: readonly ReactNode[];
}

/** Card-per-row layout used below md: keeps sorting, expanded content and the footer. */
export function TableCards<T>({
    data,
    columns,
    getRowKey,
    itemRoute,
    renderExpanded,
    footer,
}: Readonly<TableCardsProps<T>>): JSX.Element {
    return (
        <div className="space-y-3">
            <SortToolbar columns={columns} />
            {data.map((item, index) => (
                <ItemCard
                    key={getRowKey(item, index)}
                    item={item}
                    columns={columns}
                    route={itemRoute?.(item)}
                    expanded={renderExpanded?.(item, CARDS_LAYOUT)}
                />
            ))}
            {footer && <FooterSummary columns={columns} footer={footer} />}
        </div>
    );
}
