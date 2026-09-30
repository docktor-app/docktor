import * as React from "react"

import {cn} from "@/lib/utils"
import {SidebarTrigger} from "@/components/ui/sidebar"
import {Separator} from "@/components/ui/separator"
import {ThemeToggle} from "@/components/common/theme-toggle"

function Page({className, ...props}: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="page"
            // min-w-0 (D-17, defense-in-depth): Page is a flex item of
            // shadcn's SidebarInset (`flex w-full flex-1 flex-col`,
            // components/ui/, not editable). Flex items default to
            // `min-width: auto`, which resolves to their content's
            // min-content size — without this, a wide-enough descendant
            // could silently grow the whole page past the viewport instead
            // of scrolling inside its own overflow-x-auto container. The
            // concrete D-17 finding this phase fixed (EnvEditor's table on
            // Create Stack/Config) is capped at its own grid-item boundary
            // in env-editor.tsx; this is the page-level backstop.
            className={cn("flex flex-col flex-1 min-w-0", className)}
            {...props}
        />
    )
}

function PageHeader({
                        breadcrumbs,
                        className,
                        children,
                        ...props
                    }: React.ComponentProps<"header"> & { breadcrumbs?: React.ReactNode }) {
    return (
        <header
            data-slot="page-header"
            className={cn("flex flex-col gap-4", className)}
            {...props}>
            <div className="flex items-center gap-3 px-6 pt-4">
                <SidebarTrigger/>
                <Separator orientation="vertical" className={"max-h-4"}/>
                <div className={"px-1"}>
                    {breadcrumbs}
                </div>
                <div className="ml-auto">
                    <ThemeToggle/>
                </div>
            </div>
            <Separator/>
            <div className="flex flex-wrap items-center justify-between gap-2 px-6">{children}</div>
        </header>
    )
}

function PageTitle({className, children, ...props}: React.ComponentProps<"h1">) {
    return (
        <h1
            data-slot="page-title"
            className={cn("text-2xl font-semibold", className)}
            {...props}
        >
            {children}
        </h1>
    )
}

function PageDescription({className, ...props}: React.ComponentProps<"p">) {
    return (
        <p
            data-slot="page-description"
            className={cn("text-muted-foreground", className)}
            {...props}
        />
    )
}

function PageActions({className, ...props}: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="page-actions"
            className={cn("flex items-center gap-2", className)}
            {...props}
        />
    )
}

function PageContent({className, ...props}: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="page-content"
            className={cn("p-6 space-y-6", className)}
            {...props}
        />
    )
}

function PageFooter({className, ...props}: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="page-footer"
            className={cn("flex items-center p-6 pt-0", className)}
            {...props}
        />
    )
}

export {
    Page,
    PageHeader,
    PageTitle,
    PageDescription,
    PageActions,
    PageContent,
    PageFooter,
}
