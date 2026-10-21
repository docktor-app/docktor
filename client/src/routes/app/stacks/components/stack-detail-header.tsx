import {RefreshCw} from "lucide-react";
import {cn} from "@/lib/utils";
import {PageActions, PageDescription, PageHeader, PageTitle} from "@/components/common/layout/page";
import {StackBreadcrumb} from "@/components/domain/stack/stack-breadcrumb";
import {StackStatusBadge} from "@/components/domain/stack/stack-status-badge";
import {StackUpdateBadge} from "@/components/domain/stack/stack-update-badge";
import {TemplateUpdatedBadge} from "@/components/domain/stack/template-updated-badge";
import {STACK_TAB_LABELS, type StackTab} from "@/lib/stack-tabs";
import type {StackDetail} from "@/lib/stacks-api";
import {StackActions} from "./stack-actions";

export interface StackDetailHeaderProps {
    readonly stack: StackDetail;
    readonly activeTab: StackTab;
    readonly isRefreshing: boolean;
    readonly onAction: () => void;
}

// The stack detail page's header block — breadcrumb (the stack name returns
// to the overview, D-12; the tab label is the current page), title/description,
// and the status/actions row. D-09: the
// stack-level "update available" pill sits immediately after
// StackStatusBadge inside the same flex-wrap container.
export function StackDetailHeader({stack, activeTab, isRefreshing, onAction}: Readonly<StackDetailHeaderProps>) {
    return (
        <PageHeader
            breadcrumbs={
                <StackBreadcrumb
                    stackId={stack.id}
                    stackName={stack.displayName}
                    current={STACK_TAB_LABELS[activeTab]}
                />
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
                    <StackUpdateBadge services={stack.services}/>
                    <TemplateUpdatedBadge stack={stack}/>
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
