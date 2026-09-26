import {useState} from "react";
import {Navigate, useNavigate, useParams} from "react-router";
import {useStack} from "@/hooks/use-stack";
import {useStackConfigFiles} from "@/hooks/use-stack-config-files";
import {resolveStackTab, STACK_TAB_LABELS, STACK_TABS} from "@/lib/stack-tabs";
import {LogViewer} from "@/components/domain/stack/log-viewer";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {Page, PageContent} from "@/components/common/layout/page";
import {StackPageState} from "./components/stack-page-state";
import {StackDetailHeader} from "./components/stack-detail-header";
import {StackAlerts} from "./components/stack-alerts";
import {OverviewTab} from "./components/overview-tab";
import {ConfigTab} from "./components/config-tab";
import {BackupsTab} from "./components/backups-tab";
import {ProxyTab} from "./components/proxy-tab";

export default function StackDetailPage() {
    const {id = "", tab} = useParams<{ id: string; tab?: string }>();
    const navigate = useNavigate();
    const {stack, loading, isRefreshing, error, refetch} = useStack(id);
    const files = useStackConfigFiles(id, stack?.lastKnownHash, refetch);
    const [logsService, setLogsService] = useState<string | undefined>(undefined);

    const resolution = resolveStackTab(tab);
    if (resolution.kind === "redirect") {
        return <Navigate to={`/stacks/${id}/${resolution.tab}`} replace />;
    }
    const activeTab = resolution.tab;

    if (loading && !stack) {
        return <StackPageState kind="loading" />;
    }

    if (error || !stack) {
        return <StackPageState kind="error" message={error ?? "Stack not found"} />;
    }

    return (
        <Page>
            <StackDetailHeader
                stack={stack}
                activeTab={activeTab}
                isRefreshing={isRefreshing}
                onAction={refetch}
            />

            <PageContent>
                <StackAlerts stack={stack} />

                <Tabs value={activeTab} onValueChange={(v) => navigate(`/stacks/${id}/${v}`)}>
                    <div className="-mx-1 overflow-x-auto px-1">
                        <TabsList className="w-max">
                            {STACK_TABS.map((t) => (
                                <TabsTrigger key={t} value={t}>{STACK_TAB_LABELS[t]}</TabsTrigger>
                            ))}
                        </TabsList>
                    </div>

                    <TabsContent value="overview" className="mt-4">
                        <OverviewTab
                            stack={stack}
                            onViewLogs={(serviceName) => {
                                setLogsService(serviceName);
                                navigate(`/stacks/${id}/logs`);
                            }}
                            onUpgraded={refetch}
                        />
                    </TabsContent>
                    <TabsContent value="config" className="mt-4">
                        <ConfigTab files={files} />
                    </TabsContent>
                    <TabsContent value="logs" className="mt-4 w-full max-w-full overflow-hidden">
                        <LogViewer
                            stackId={id}
                            serviceNames={stack.services.map((s) => s.serviceName)}
                            initialService={logsService}
                        />
                    </TabsContent>
                    <TabsContent value="backups" className="mt-4">
                        <BackupsTab stackId={id} stackName={stack.displayName} stackStatus={stack.status} />
                    </TabsContent>
                    <TabsContent value="proxy" className="mt-4">
                        <ProxyTab stackId={id} services={stack.services} />
                    </TabsContent>
                </Tabs>
            </PageContent>
        </Page>
    );
}
