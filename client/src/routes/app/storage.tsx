import {Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage} from "@/components/ui/breadcrumb";
import {Page, PageContent, PageDescription, PageHeader, PageTitle} from "@/components/common/layout/page";
import {StorageBackupsSection} from "@/routes/app/storage/components/storage-backups-section";
import {StorageStacksTable} from "@/routes/app/storage/components/storage-stacks-table";
import {StorageStatusAlerts} from "@/routes/app/storage/components/storage-status-alerts";
import {StorageTotals} from "@/routes/app/storage/components/storage-totals";
import {useStorage} from "@/hooks/use-storage";

export default function StoragePage() {
    const {overview, loading, error, retry} = useStorage();
    // A failed load shows only the alert and em-dash totals, never stale or
    // misleading "empty" sections.
    const data = error ? null : overview;

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
                    {data?.measuredAt && (
                        <p className="text-xs text-muted-foreground">
                            Last measured {new Date(data.measuredAt).toLocaleString()}
                        </p>
                    )}
                </div>
            </PageHeader>

            <PageContent>
                <StorageStatusAlerts measuredAt={data?.measuredAt ?? null} error={error} onRetry={retry}/>
                <StorageTotals totals={data?.totals ?? null} loading={loading}/>
                {!error && (
                    <>
                        <StorageStacksTable
                            stacks={data?.stacks ?? []}
                            measuredAt={data?.measuredAt ?? null}
                            loading={loading}
                        />
                        <StorageBackupsSection backups={data?.backups ?? []} loading={loading}/>
                    </>
                )}
            </PageContent>
        </Page>
    );
}
