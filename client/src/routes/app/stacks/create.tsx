import {Link, useNavigate} from "react-router";
import {useCreateStack} from "@/hooks/use-create-stack";
import {useCreateStackSource} from "@/hooks/use-create-stack-source";
import {CreateStackForm} from "@/routes/app/stacks/components/create-stack-form";
import {DiffConfirmDialog} from "@/components/domain/stack/diff-confirm-dialog";
import {Button} from "@/components/ui/button";
import {Skeleton} from "@/components/ui/skeleton";
import {Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator} from "@/components/ui/breadcrumb";
import {Page, PageActions, PageContent, PageHeader, PageTitle} from "@/components/common/layout/page";

// Issue #19/D-06: a ?variant=<id> search param (set by the template browse
// page) prefills this same form from useCreateStackSource — the blank-slate
// path (no variant) stays the default, with "Start from Template" as a
// secondary entry point.
export default function CreateStackPage() {
    const navigate = useNavigate();
    const {variantId, variant, loading: sourceLoading, error: sourceError, defaultValues, create} =
        useCreateStackSource();
    const {submitting, error, review, submit, confirmReview, cancelReview} = useCreateStack({
        create,
        onCreated: (stackId) => navigate(`/stacks/${stackId}`),
    });

    return (
        <Page>
            <PageHeader
                breadcrumbs={
                    <Breadcrumb>
                        <BreadcrumbList>
                            <BreadcrumbItem><BreadcrumbLink asChild><Link to="/stacks">Stacks</Link></BreadcrumbLink></BreadcrumbItem>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem><BreadcrumbPage>Create</BreadcrumbPage></BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                }
            >
                <PageTitle>Create Stack</PageTitle>
                {!variantId && (
                    <PageActions>
                        <Button asChild variant="outline">
                            <Link to="/stacks/create/templates">Start from Template</Link>
                        </Button>
                    </PageActions>
                )}
            </PageHeader>

            <PageContent className="max-w-2xl">
                {(error || sourceError) && (
                    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                        {error || sourceError}
                    </div>
                )}

                {variant && (
                    <p className="text-sm text-muted-foreground">Starting from {variant.template.name} — {variant.name}</p>
                )}
                {variant?.usage && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{variant.usage}</p>}

                {sourceLoading ? (
                    <div className="space-y-4">
                        <Skeleton className="h-9 w-full" />
                        <Skeleton className="h-9 w-full" />
                        <Skeleton className="h-64 w-full" />
                    </div>
                ) : (
                    <CreateStackForm
                        key={variantId ?? "blank"}
                        defaultValues={defaultValues}
                        submitting={submitting}
                        onSubmit={submit}
                        onCancel={() => navigate("/stacks")}
                    />
                )}
            </PageContent>

            <DiffConfirmDialog
                open={review !== null}
                stackName={review?.values.displayName ?? ""}
                subject={{kind: "create"}}
                findings={review?.preview.findings}
                composeParseError={review?.preview.composeParseError}
                onConfirm={confirmReview}
                onCancel={cancelReview}
            />
        </Page>
    );
}
