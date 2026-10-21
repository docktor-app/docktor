import type {JSX, ReactNode} from "react";

import {cn} from "@/lib/utils";

export interface TableFrameProps {
    readonly children: ReactNode;
    readonly className?: string;
}

// The shadcn Table cannot carry the border itself because components/ui is
// not edited (UI-SPEC R-06); this wrapper supplies the rounded outline.
export function TableFrame({children, className}: Readonly<TableFrameProps>): JSX.Element {
    return (
        <div data-slot="table-frame" className={cn("overflow-hidden rounded-md border", className)}>
            {children}
        </div>
    );
}
