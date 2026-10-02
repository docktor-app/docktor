import {useNavigate, useParams} from "react-router";
import {Page, PageContent, PageDescription, PageHeader, PageTitle} from "@/components/common/layout/page";
import {Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage} from "@/components/ui/breadcrumb";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {GeneralSettingsCard} from "@/routes/app/settings/components/general-settings-card";
import {SmtpCard} from "@/routes/app/settings/components/smtp-card";
import {NotificationTriggersCard} from "@/routes/app/settings/components/notification-triggers-card";
import {NotificationLogCard} from "@/routes/app/settings/components/notification-log-card";
import {BackupRepositoryCard} from "@/routes/app/settings/components/backup-repository-card";
import {BackupDefaultsCard} from "@/routes/app/settings/components/backup-defaults-card";
import {ProxySettingsCard} from "@/routes/app/settings/components/proxy-settings-card";
import {CertificatesCard} from "@/routes/app/settings/components/certificates-card";
import {ComposeChecksCard} from "@/routes/app/settings/components/compose-checks-card";

const VALID_TABS = ["general", "notifications", "backup", "proxy", "stacks"] as const;
type Tab = typeof VALID_TABS[number];

export default function SettingsPage() {
    const {tab} = useParams<{tab: string}>();
    const navigate = useNavigate();
    const activeTab: Tab = VALID_TABS.includes(tab as Tab) ? (tab as Tab) : "general";

    return (
        <Page>
            <PageHeader
                breadcrumbs={
                    <Breadcrumb>
                        <BreadcrumbList>
                            <BreadcrumbItem>
                                <BreadcrumbPage>Settings</BreadcrumbPage>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                }
            >
                <div>
                    <PageTitle>Settings</PageTitle>
                    <PageDescription>Configure your Docktor instance</PageDescription>
                </div>
            </PageHeader>
            <PageContent>
                <Tabs value={activeTab} onValueChange={(v) => navigate(`/settings/${v}`)}>
                    <div className="-mx-1 overflow-x-auto px-1">
                        <TabsList className="w-max">
                            <TabsTrigger value="general">General</TabsTrigger>
                            <TabsTrigger value="notifications">Notifications</TabsTrigger>
                            <TabsTrigger value="backup">Backup</TabsTrigger>
                            <TabsTrigger value="proxy">Proxy</TabsTrigger>
                            <TabsTrigger value="stacks">Stacks</TabsTrigger>
                        </TabsList>
                    </div>
                    <TabsContent value="general">
                        <GeneralSettingsCard />
                    </TabsContent>
                    <TabsContent value="notifications">
                        <div className="space-y-6">
                            <SmtpCard />
                            <NotificationTriggersCard />
                            <NotificationLogCard />
                        </div>
                    </TabsContent>
                    <TabsContent value="backup" className="space-y-6">
                        <BackupRepositoryCard />
                        <BackupDefaultsCard />
                    </TabsContent>
                    <TabsContent value="proxy" className="space-y-6">
                        <ProxySettingsCard />
                        <CertificatesCard />
                    </TabsContent>
                    <TabsContent value="stacks" className="space-y-6">
                        <ComposeChecksCard />
                    </TabsContent>
                </Tabs>
            </PageContent>
        </Page>
    );
}
