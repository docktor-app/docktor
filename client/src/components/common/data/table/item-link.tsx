import type {JSX, ReactNode} from "react";
import {Link} from "react-router";

import {cn} from "@/lib/utils";

interface ItemLinkProps {
    readonly to: string;
    readonly className?: string;
    readonly children: ReactNode;
}

/**
 * Real anchor for a clickable row or card, so keyboard and assistive-tech users can open the item.
 * The row/card click stays as a pointer shortcut; this link stops the click from navigating twice.
 */
export function ItemLink({to, className, children}: Readonly<ItemLinkProps>): JSX.Element {
    return (
        <Link
            to={to}
            className={cn("block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
            onClick={(event) => event.stopPropagation()}
        >
            {children}
        </Link>
    );
}
