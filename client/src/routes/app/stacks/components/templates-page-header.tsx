import {Link} from "react-router";
import {Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator} from "@/components/ui/breadcrumb";
import {PageDescription, PageHeader, PageTitle} from "@/components/common/layout/page";

export type TemplatesPageVariant = "catalog" | "create-flow";

export interface TemplatesPageHeaderProps {
    readonly variant: TemplatesPageVariant;
}

const CATALOG_BREADCRUMB = (
    <Breadcrumb>
        <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbPage>Templates</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
    </Breadcrumb>
);

const CREATE_FLOW_BREADCRUMB = (
    <Breadcrumb>
        <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink asChild><Link to="/stacks">Stacks</Link></BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink asChild><Link to="/stacks/create">Create</Link></BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>Templates</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
    </Breadcrumb>
);

// One page, two routes: #94 serves the standalone catalog at /templates and
// #19 serves the create-flow entry at /stacks/create/templates. Title and
// breadcrumb are chosen by path (UI-SPEC D-04).
export function TemplatesPageHeader({variant}: Readonly<TemplatesPageHeaderProps>): React.JSX.Element {
    if (variant === "create-flow") {
        return (
            <PageHeader breadcrumbs={CREATE_FLOW_BREADCRUMB}>
                <PageTitle>Start from a Template</PageTitle>
            </PageHeader>
        );
    }

    return (
        <PageHeader breadcrumbs={CATALOG_BREADCRUMB}>
            <div className="space-y-1">
                <PageTitle>Templates</PageTitle>
                <PageDescription>Browse the catalog and start a stack from a ready-made template.</PageDescription>
            </div>
        </PageHeader>
    );
}
