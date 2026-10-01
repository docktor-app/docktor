import * as React from "react"

import {cn} from "@/lib/utils"

// Generic flat-section primitive (D-03): every later phase-11 flattening
// (11-04 dashboard, 11-06 overview, 11-07 proxy/backups, 11-08 backup detail)
// composes these instead of wrapping content in a Card. Mirrors page.tsx's
// naming/data-slot/cn() conventions exactly.

function Section({className, ...props}: React.ComponentProps<"section">) {
    return (
        <section
            data-slot="section"
            className={cn("space-y-3", className)}
            {...props}
        />
    )
}

function SectionHeader({className, ...props}: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="section-header"
            className={cn("flex flex-wrap items-center justify-between gap-2", className)}
            {...props}
        />
    )
}

function SectionTitle({className, children, ...props}: React.ComponentProps<"h2">) {
    return (
        <h2
            data-slot="section-title"
            className={cn("text-lg font-semibold", className)}
            {...props}
        >
            {children}
        </h2>
    )
}

function SectionDescription({className, ...props}: React.ComponentProps<"p">) {
    return (
        <p
            data-slot="section-description"
            className={cn("text-sm text-muted-foreground", className)}
            {...props}
        />
    )
}

function SectionActions({className, ...props}: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="section-actions"
            className={cn("flex flex-wrap items-center gap-2", className)}
            {...props}
        />
    )
}

export {
    Section,
    SectionHeader,
    SectionTitle,
    SectionDescription,
    SectionActions,
}
