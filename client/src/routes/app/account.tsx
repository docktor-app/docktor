import {Page, PageContent, PageDescription, PageHeader, PageTitle} from "@/components/common/layout/page";
import {Section, SectionDescription, SectionHeader, SectionTitle} from "@/components/common/layout/section";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage} from "@/components/ui/breadcrumb";
import {Button} from "@/components/ui/button";
import {Separator} from "@/components/ui/separator";
import {Skeleton} from "@/components/ui/skeleton";
import {useAccountSecurity} from "@/hooks/use-account-security";
import {EnrollmentRequiredAlert} from "@/routes/app/account/components/enrollment-required-alert";
import {MandatoryTwoFactorRow} from "@/routes/app/account/components/mandatory-two-factor-row";
import {TwoFactorSection} from "@/routes/app/account/components/two-factor-section";

export default function AccountPage() {
    const {status, loading, error, refresh, setStatus} = useAccountSecurity();

    return (
        <Page>
            <PageHeader
                breadcrumbs={
                    <Breadcrumb>
                        <BreadcrumbList>
                            <BreadcrumbItem>
                                <BreadcrumbPage>Account</BreadcrumbPage>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                }
            >
                <div>
                    <PageTitle>Account</PageTitle>
                    <PageDescription>Manage how you sign in to Docktor.</PageDescription>
                </div>
            </PageHeader>
            <PageContent className="max-w-2xl">
                {status?.enrollmentRequired && <EnrollmentRequiredAlert/>}
                <Section>
                    <SectionHeader>
                        <div>
                            <SectionTitle>Security</SectionTitle>
                            <SectionDescription>Protect your account with a second sign-in step.</SectionDescription>
                        </div>
                    </SectionHeader>
                    {status && (
                        <>
                            <TwoFactorSection
                                status={status}
                                autoOpenEnroll={status.enrollmentRequired}
                                onChanged={() => void refresh()}
                            />
                            <Separator/>
                            <MandatoryTwoFactorRow status={status} onStatusChange={setStatus}/>
                        </>
                    )}
                    {!status && loading && (
                        <div className="space-y-4 py-4" data-testid="security-skeleton">
                            <Skeleton className="h-6 w-2/3"/>
                            <Skeleton className="h-6 w-1/2"/>
                        </div>
                    )}
                    {!status && !loading && error && (
                        <Alert variant="destructive">
                            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                                Couldn't load your security settings. Check your connection and try again.
                                <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
                                    Retry
                                </Button>
                            </AlertDescription>
                        </Alert>
                    )}
                </Section>
            </PageContent>
        </Page>
    );
}
