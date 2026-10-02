import {Link, useNavigate} from "react-router";
import {createStack} from "@/lib/stacks-api";
import {useCreateStack} from "@/hooks/use-create-stack";
import {CreateStackForm} from "@/routes/app/stacks/components/create-stack-form";
import {DiffConfirmDialog} from "@/components/domain/stack/diff-confirm-dialog";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {Page, PageContent, PageHeader, PageTitle} from "@/components/common/layout/page";

export default function CreateStackPage() {
    const navigate = useNavigate();
    const {submitting, error, review, submit, confirmReview, cancelReview} = useCreateStack({
        create: createStack,
        onCreated: (stackId) => navigate(`/stacks/${stackId}`),
    });

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
                                <BreadcrumbPage>Create</BreadcrumbPage>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                }
            >
                <PageTitle>Create Stack</PageTitle>
            </PageHeader>

            <PageContent className="max-w-2xl">
                {error && (
                    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
                )}

                <CreateStackForm
                    defaultValues={{displayName: "", description: "", composeContent: "", envContent: ""}}
                    submitting={submitting}
                    onSubmit={submit}
                    onCancel={() => navigate("/stacks")}
                />
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
