import {Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage} from "@/components/ui/breadcrumb";
import {Page, PageContent, PageDescription, PageHeader, PageTitle} from "@/components/common/layout/page";
import {StorageStacksTable} from "@/routes/app/storage/components/storage-stacks-table";
import {StorageTotals} from "@/routes/app/storage/components/storage-totals";
import {useStorage} from "@/hooks/use-storage";

export default function StoragePage() {
    const {overview, loading} = useStorage();

    return (
        <Page>
            <PageHeader
                breadcrumbs={
                    <Breadcrumb>
                        <BreadcrumbList>
                            <BreadcrumbItem>
                                <BreadcrumbPage>Storage</BreadcrumbPage>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                }
            >
                <div className="space-y-1">
                    <PageTitle>Storage</PageTitle>
                    <PageDescription>
                        Disk used by stack volumes and local backups, measured once a day.
                    </PageDescription>
                    {overview?.measuredAt && (
                        <p className="text-xs text-muted-foreground">
                            Last measured {new Date(overview.measuredAt).toLocaleString()}
                        </p>
                    )}
                </div>
            </PageHeader>

            <PageContent>
                <StorageTotals totals={overview?.totals ?? null} loading={loading}/>
                <StorageStacksTable stacks={overview?.stacks ?? []} loading={loading}/>
            </PageContent>
        </Page>
    );
}
