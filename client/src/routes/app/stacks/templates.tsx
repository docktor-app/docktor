import {useState} from "react";
import {Link, useNavigate} from "react-router";
import {toast} from "sonner";
import {useTemplates} from "@/hooks/use-templates";
import {TemplateGrid} from "@/components/domain/template/template-grid";
import {TemplateVariantDialog} from "@/components/domain/template/template-variant-dialog";
import {TemplateRepoAlerts} from "@/routes/app/stacks/components/template-repo-alerts";
import type {TemplateSummary} from "@/lib/templates-api";
import {AlertTriangle} from "lucide-react";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {Button} from "@/components/ui/button";
import {Skeleton} from "@/components/ui/skeleton";
import {Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator} from "@/components/ui/breadcrumb";
import {Page, PageContent, PageHeader, PageTitle} from "@/components/common/layout/page";

const BREADCRUMB = (
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

// Issue #19/D-07: the template browse page at /stacks/create/templates (not
// /stacks/templates — a stack id can never contain "/", so this path can
// never collide with a stack whose slug is "templates").
export default function TemplateBrowsePage() {
    const navigate = useNavigate();
    const {catalog, loading, error, refetch, retryRepo} = useTemplates();
    const [dialogTemplate, setDialogTemplate] = useState<TemplateSummary | null>(null);
    const [retryingRepoId, setRetryingRepoId] = useState<string | null>(null);

    // D-06 zero-one-many: a single-variant template navigates straight to
    // that variant; a multi-variant template opens the picker dialog.
    function handleUse(template: TemplateSummary) {
        if (template.variants.length > 1) return setDialogTemplate(template);
        const variant = template.variants[0];
        if (variant) navigate(`/stacks/create?variant=${encodeURIComponent(variant.id)}`);
    }

    function handleRetry(repoId: string) {
        setRetryingRepoId(repoId);
        retryRepo(repoId)
            .catch((err: unknown) => {
                toast.error(`Couldn't retry sync — ${err instanceof Error ? err.message : "unknown error"}.`);
            })
            .finally(() => setRetryingRepoId(null));
    }

    return (
        <Page>
            <PageHeader breadcrumbs={BREADCRUMB}>
                <PageTitle>Start from a Template</PageTitle>
            </PageHeader>

            <PageContent>
                {error && (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                            <span>{error}</span>
                            <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
                        </AlertDescription>
                    </Alert>
                )}

                {loading ? (
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">Templates are loading for the first time — this can take a moment.</p>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 w-full" />)}
                        </div>
                    </div>
                ) : (
                    catalog && <>
                        <TemplateRepoAlerts repos={catalog.repos} onRetry={handleRetry} retryingRepoId={retryingRepoId} />
                        <TemplateGrid templates={catalog.templates} onUse={handleUse} />
                    </>
                )}
            </PageContent>

            <TemplateVariantDialog
                open={dialogTemplate !== null}
                template={dialogTemplate}
                onOpenChange={(open) => !open && setDialogTemplate(null)}
                onChoose={(variant) => {
                    setDialogTemplate(null);
                    navigate(`/stacks/create?variant=${encodeURIComponent(variant.id)}`);
                }}
            />
        </Page>
    );
}
