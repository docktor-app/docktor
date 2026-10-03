import {Link, useNavigate} from "react-router";
import {useTemplates} from "@/hooks/use-templates";
import {TemplateGrid} from "@/components/domain/template/template-grid";
import type {TemplateSummary} from "@/lib/templates-api";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {Page, PageContent, PageHeader, PageTitle} from "@/components/common/layout/page";

// Issue #19/D-07: the template browse page at /stacks/create/templates (not
// /stacks/templates — a stack id can never contain "/", so this path can
// never collide with a stack whose slug is "templates").
export default function TemplateBrowsePage() {
    const navigate = useNavigate();
    const {catalog, loading, error} = useTemplates();

    // D-06 zero-one-many: a single-variant template navigates straight to
    // that variant. Multi-variant handling (the variant-selection dialog)
    // is added in plan 12-09's Task 2 — until then the first variant wins.
    function handleUse(template: TemplateSummary) {
        const variant = template.variants[0];
        if (!variant) return;
        navigate(`/stacks/create?variant=${encodeURIComponent(variant.id)}`);
    }

    return (
        <Page>
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
                                    <Link to="/stacks/create">Create</Link>
                                </BreadcrumbLink>
                            </BreadcrumbItem>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                                <BreadcrumbPage>Templates</BreadcrumbPage>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                }
            >
                <PageTitle>Start from a Template</PageTitle>
            </PageHeader>

            <PageContent>
                {error && (
                    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
                )}

                {loading ? (
                    <p className="text-sm text-muted-foreground">
                        Templates are loading for the first time — this can take a moment.
                    </p>
                ) : (
                    catalog && <TemplateGrid templates={catalog.templates} onUse={handleUse} />
                )}
            </PageContent>
        </Page>
    );
}
