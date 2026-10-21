import type {JSX} from "react";
import {ArrowDown, ArrowUp, ArrowUpDown, type LucideIcon} from "lucide-react";

import {Button} from "@/components/ui/button";
import {TableHead} from "@/components/ui/table";
import {cn} from "@/lib/utils";

export type SortDirection = "asc" | "desc" | "none";

export interface SortableHeadProps {
    readonly label: string;
    readonly direction: SortDirection;
    readonly onToggle: () => void;
    readonly align?: "left" | "right";
    readonly className?: string;
}

const ARIA_SORT = {asc: "ascending", desc: "descending", none: "none"} as const;

export function sortIconFor(direction: SortDirection): LucideIcon {
    if (direction === "asc") return ArrowUp;
    if (direction === "desc") return ArrowDown;
    return ArrowUpDown;
}

export function SortableHead({
    label,
    direction,
    onToggle,
    align = "left",
    className,
}: Readonly<SortableHeadProps>): JSX.Element {
    const Icon = sortIconFor(direction);

    return (
        <TableHead aria-sort={ARIA_SORT[direction]} className={cn(align === "right" && "text-right", className)}>
            <Button variant="ghost" size="sm" className={align === "right" ? "-mr-2" : "-ml-2"} onClick={onToggle}>
                {label}
                <Icon className="h-4 w-4" aria-hidden="true" />
            </Button>
        </TableHead>
    );
}
