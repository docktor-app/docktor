import {Link} from "react-router";
import {RefreshCw} from "lucide-react";
import {cn} from "@/lib/utils";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {PageActions, PageDescription, PageHeader, PageTitle} from "@/components/common/layout/page";
import {StackStatusBadge} from "@/components/domain/stack/stack-status-badge";
import {STACK_TAB_LABELS, type StackTab} from "@/lib/stack-tabs";
import type {StackDetail} from "@/lib/stacks-api";
import {StackActions} from "./stack-actions";

export interface StackDetailHeaderProps {
    readonly stack: StackDetail;
    readonly activeTab: StackTab;
    readonly isRefreshing: boolean;
    readonly onAction: () => void;
}

// The stack detail page's header block — breadcrumb (with tab context
// preserved), title/description, and the status/actions row. The
// `flex flex-wrap items-center gap-1` wrapper around StackStatusBadge is the
// slot plan 11-06 adds the stack-level "update available" badge (D-09) to.
export function StackDetailHeader({stack, activeTab, isRefreshing, onAction}: Readonly<StackDetailHeaderProps>) {
    return (
        <PageHeader
            breadcrumbs={
                <Breadcrumb>
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbLink asChild>
                                <Link to="/stacks">Stacks</Link>
                            </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator/>
                        <BreadcrumbItem>
                            <BreadcrumbLink asChild>
                                <Link to={`/stacks/${stack.id}${activeTab !== "overview" ? `/${activeTab}` : ""}`}>
                                    {stack.displayName}
                                </Link>
                            </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator/>
                        <BreadcrumbItem>
                            <BreadcrumbPage>{STACK_TAB_LABELS[activeTab]}</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
            }
        >
            <div>
                <PageTitle>{stack.displayName}</PageTitle>
                {stack.description && <PageDescription>{stack.description}</PageDescription>}
            </div>
            <PageActions>
                <span
                    className={cn(
                        "flex items-center gap-1 text-xs text-muted-foreground transition-opacity",
                        isRefreshing ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden={!isRefreshing}
                >
                    <RefreshCw className="h-3 w-3 animate-spin"/>
                    Refreshing
                </span>
                <div className="flex flex-wrap items-center gap-1">
                    <StackStatusBadge status={stack.status}/>
                </div>
                <StackActions
                    stackId={stack.id}
                    stackName={stack.displayName}
                    status={stack.status}
                    isProtected={stack.isProtected}
                    onAction={onAction}
                />
            </PageActions>
        </PageHeader>
    );
}
