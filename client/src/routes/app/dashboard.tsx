import {Link} from "react-router";
import {Plus} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage} from "@/components/ui/breadcrumb";
import {Page, PageActions, PageContent, PageHeader, PageTitle} from "@/components/common/layout/page";
import {Section, SectionActions, SectionHeader, SectionTitle} from "@/components/common/layout/section";
import {StackList} from "@/components/domain/stack/stack-list";
import {DashboardStatCards} from "@/routes/app/dashboard/components/dashboard-stat-cards";
import {useStacks} from "@/hooks/use-stacks";
import {useStackUptimes} from "@/hooks/use-stack-uptimes";
import {useBackupDefaults} from "@/hooks/use-backup-defaults";
import {computeDashboardStats} from "@/lib/dashboard-stats";

export default function Dashboard() {
    const {stacks, loading, error} = useStacks();
    const uptimes = useStackUptimes();
    const {defaultSchedule, loading: defaultsLoading, error: defaultsError} = useBackupDefaults();

    const stats = computeDashboardStats(stacks, defaultSchedule);
    const recentStacks = stacks.slice(0, 5);

    return (
        <Page>
            <PageHeader
                breadcrumbs={
                    <Breadcrumb>
                        <BreadcrumbList>
                            <BreadcrumbItem>
                                <BreadcrumbPage>Dashboard</BreadcrumbPage>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                }
            >
                <PageTitle>Dashboard</PageTitle>
                <PageActions>
                    <Button asChild>
                        <Link to="/stacks/create">
                            <Plus className="h-4 w-4 mr-2" />
                            Create Stack
                        </Link>
                    </Button>
                </PageActions>
            </PageHeader>

            <PageContent>
                <DashboardStatCards
                    stats={stats}
                    loading={loading || defaultsLoading}
                    stacksError={error}
                    defaultsError={defaultsError}
                />

                <Section>
                    <SectionHeader>
                        <SectionTitle>Recent Stacks</SectionTitle>
                        {stacks.length > 5 && (
                            <SectionActions>
                                <Button asChild variant="link">
                                    <Link to="/stacks">View all stacks</Link>
                                </Button>
                            </SectionActions>
                        )}
                    </SectionHeader>
                    <StackList stacks={recentStacks} loading={loading} pagination={false} uptimes={uptimes} />
                </Section>
            </PageContent>
        </Page>
    );
}
