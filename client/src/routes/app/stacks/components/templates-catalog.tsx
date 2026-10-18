import {Link} from "react-router";
import {Skeleton} from "@/components/ui/skeleton";
import {EmptyState} from "@/components/common/empty-state";
import {TemplateGrid} from "@/components/domain/template/template-grid";
import {TemplateRepoAlerts} from "@/routes/app/stacks/components/template-repo-alerts";
import type {TemplateCatalog, TemplateSummary} from "@/lib/templates-api";

export interface TemplatesCatalogProps {
    readonly catalog: TemplateCatalog | null;
    readonly loading: boolean;
    readonly onUse: (template: TemplateSummary) => void;
    readonly onRetryRepo: (repoId: string) => void;
    readonly retryingRepoId: string | null;
}

// Catalog body: first-run loading skeletons, per-repo sync alerts, then either
// the zero-templates empty state or the searchable grid.
export function TemplatesCatalog({
    catalog,
    loading,
    onUse,
    onRetryRepo,
    retryingRepoId,
}: Readonly<TemplatesCatalogProps>): React.JSX.Element | null {
    if (loading) {
        return (
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Templates are loading for the first time — this can take a moment.</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 w-full" />)}
                </div>
            </div>
        );
    }
    if (!catalog) return null;

    // A failed repo's own alert already explains an empty catalog, so the
    // empty state is reserved for a catalog with no failures.
    const isEmpty = catalog.templates.length === 0 && !catalog.repos.some((repo) => repo.lastSyncError);

    return (
        <>
            <TemplateRepoAlerts repos={catalog.repos} onRetry={onRetryRepo} retryingRepoId={retryingRepoId} />
            {isEmpty ? (
                <EmptyState heading="No templates available">
                    Add a template repository in{" "}
                    <Link to="/settings/stacks" className="underline">Settings</Link>
                    {" "}to populate the catalog, or{" "}
                    <Link to="/stacks/create" className="underline">start from a blank compose file</Link>.
                </EmptyState>
            ) : (
                <TemplateGrid templates={catalog.templates} onUse={onUse} />
            )}
        </>
    );
}
