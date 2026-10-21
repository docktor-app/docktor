import {Link} from "react-router";

import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export interface StackBreadcrumbCrumb {
    readonly label: string;
    readonly to: string;
}

export interface StackBreadcrumbProps {
    readonly stackId: string;
    readonly stackName: string;
    readonly trail?: ReadonlyArray<StackBreadcrumbCrumb>;
    readonly current: string;
}

/**
 * Shared stack breadcrumb: Stacks > stack name > optional trail > current page.
 *
 * The stack-name crumb always targets the stack overview (D-12, UI-09). On the
 * overview itself it links to the page you are on; it is kept there so every
 * stack page shares one breadcrumb structure (UI-SPEC section 7). The stack
 * name truncates on small screens with the full name in its title; the
 * current-page crumb is never truncated.
 */
export function StackBreadcrumb({stackId, stackName, trail = [], current}: Readonly<StackBreadcrumbProps>) {
    return (
        <Breadcrumb>
            <BreadcrumbList>
                <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                        <Link to="/stacks">Stacks</Link>
                    </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                        <Link to={`/stacks/${stackId}`} title={stackName} className="block max-w-48 truncate md:max-w-none">
                            {stackName}
                        </Link>
                    </BreadcrumbLink>
                </BreadcrumbItem>
                {trail.map((crumb) => (
                    <BreadcrumbTrailItem key={crumb.to} crumb={crumb} />
                ))}
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                    <BreadcrumbPage>{current}</BreadcrumbPage>
                </BreadcrumbItem>
            </BreadcrumbList>
        </Breadcrumb>
    );
}

function BreadcrumbTrailItem({crumb}: Readonly<{crumb: StackBreadcrumbCrumb}>) {
    return (
        <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
                <BreadcrumbLink asChild>
                    <Link to={crumb.to}>{crumb.label}</Link>
                </BreadcrumbLink>
            </BreadcrumbItem>
        </>
    );
}
