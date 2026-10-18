import {useState} from "react";
import {useLocation, useNavigate} from "react-router";
import {toast} from "sonner";
import {useTemplates} from "@/hooks/use-templates";
import {TemplateVariantDialog} from "@/components/domain/template/template-variant-dialog";
import {TemplatesCatalog} from "@/routes/app/stacks/components/templates-catalog";
import type {TemplateSummary} from "@/lib/templates-api";
import {AlertTriangle} from "lucide-react";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {Button} from "@/components/ui/button";
import {Page, PageContent} from "@/components/common/layout/page";
import {TemplatesPageHeader} from "@/routes/app/stacks/components/templates-page-header";
import type {TemplatesPageVariant} from "@/routes/app/stacks/components/templates-page-header";

// The template browse page, served at two routes: /templates (#94, standalone
// catalog) and /stacks/create/templates (#19/D-07; not /stacks/templates — a
// stack id can never contain "/", so this path can never collide with a stack
// whose slug is "templates"). handleUse behaves identically on both (UI-SPEC D-05).
export default function TemplateBrowsePage() {
    const navigate = useNavigate();
    const {pathname} = useLocation();
    const variant: TemplatesPageVariant = pathname.startsWith("/stacks/create") ? "create-flow" : "catalog";
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
            <TemplatesPageHeader variant={variant} />

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

                <TemplatesCatalog
                    catalog={catalog}
                    loading={loading}
                    onUse={handleUse}
                    onRetryRepo={handleRetry}
                    retryingRepoId={retryingRepoId}
                />
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
