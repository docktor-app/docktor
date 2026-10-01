import {Link} from "react-router";

import {PageHeader, PageTitle} from "@/components/common/layout/page";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface BackupDetailHeaderProps {
    readonly stackId: string;
    readonly stackLabel: string;
    readonly crumb: string;
    readonly title: string;
}

/**
 * One PageHeader implementation for the backup detail page's loading, error,
 * and ready states — replaces three near-identical breadcrumb blocks
 * previously inlined in [backupId].tsx. The Backups link always points at
 * the path-segment route form (`/stacks/:id/backups`, which the app's
 * `/stacks/:id/:tab?` route actually consumes) rather than a query string,
 * which that route ignores.
 */
export function BackupDetailHeader({stackId, stackLabel, crumb, title}: Readonly<BackupDetailHeaderProps>) {
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
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbLink asChild>
                                <Link to={`/stacks/${stackId}`}>{stackLabel}</Link>
                            </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbLink asChild>
                                <Link to={`/stacks/${stackId}/backups`}>Backups</Link>
                            </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbPage>{crumb}</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
            }
        >
            <PageTitle>{title}</PageTitle>
        </PageHeader>
    );
}
