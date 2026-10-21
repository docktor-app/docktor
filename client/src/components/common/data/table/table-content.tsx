import type {JSX} from "react";
import {useNavigate} from "react-router";
import {useIsMobile} from "@/hooks/use-mobile";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow,} from "@/components/ui/table";
import {Card, CardContent} from "@/components/ui/card";
import {cn} from "@/lib/utils";
import type {TableColumn} from "./data-table";
import {TableFrame} from "./table-frame";

interface TableContentProps<T> {
    data: readonly T[];
    columns: readonly TableColumn<T>[];
    itemRoute?: (item: T) => string;
    getRowKey: (item: T, index: number) => string;
}

export function TableContent<T>({
    data,
    columns,
    itemRoute,
    getRowKey,
}: Readonly<TableContentProps<T>>): JSX.Element {
    const isMobile = useIsMobile();
    const navigate = useNavigate();

    if (isMobile) {
        const keyColumn = columns.find((c) => c.isKey) ?? columns[0];
        const otherColumns = columns.filter((c) => c !== keyColumn);

        return (
            <div className="space-y-3">
                {data.map((item, index) => (
                    <Card
                        key={getRowKey(item, index)}
                        className={itemRoute ? "cursor-pointer hover:bg-accent/50 transition-colors" : ""}
                        onClick={itemRoute ? () => navigate(itemRoute(item)) : undefined}
                    >
                        <CardContent className="p-4 space-y-2">
                            <div className="font-medium">
                                {keyColumn.render(item)}
                            </div>
                            {otherColumns.map((col) => (
                                <div
                                    key={col.name}
                                    className="flex items-center justify-between text-sm"
                                >
                                    <span className="text-muted-foreground">
                                        {col.name}
                                    </span>
                                    <span>{col.render(item)}</span>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    return (
        <TableFrame>
            <Table>
                <TableHeader className="bg-muted/50">
                    <TableRow className="hover:bg-transparent">
                        {columns.map((col) => (
                            <TableHead key={col.name}>{col.name}</TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((item, index) => (
                        <TableRow
                            key={getRowKey(item, index)}
                            className={cn("hover:bg-muted/30", itemRoute && "cursor-pointer")}
                            onClick={
                                itemRoute
                                    ? () => navigate(itemRoute(item))
                                    : undefined
                            }
                        >
                            {columns.map((col) => (
                                <TableCell key={col.name}>
                                    {col.render(item)}
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableFrame>
    );
}
