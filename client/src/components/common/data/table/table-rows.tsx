import type {JSX, ReactNode} from "react";

import {TableCell, TableRow} from "@/components/ui/table";
import {cn} from "@/lib/utils";

// Re-exported so migrated consumers never import the shadcn table file directly.
export {TableRow, TableCell};

export interface ExpandedRowProps {
    readonly columnCount: number;
    readonly id?: string;
    readonly className?: string;
    readonly children: ReactNode;
}

/** One full-width detail row shown directly under its item's row. */
export function ExpandedRow({columnCount, id, className, children}: Readonly<ExpandedRowProps>): JSX.Element {
    return (
        <TableRow data-slot="expanded-row" id={id}>
            <TableCell colSpan={columnCount} className={cn("bg-muted/50", className)}>
                {children}
            </TableCell>
        </TableRow>
    );
}
