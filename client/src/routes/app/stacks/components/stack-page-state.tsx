import {Link} from "react-router";
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {Page, PageContent, PageHeader, PageTitle} from "@/components/common/layout/page";

export type StackPageStateProps =
    | {readonly kind: "loading"}
    | {readonly kind: "error"; readonly message: string};

// The stack detail page's loading/error shells, extracted verbatim so
// [id].tsx stays a composition-only orchestrator (CLAUDE.md Known
// Refactoring Target).
export function StackPageState(props: Readonly<StackPageStateProps>) {
    const label = props.kind === "loading" ? "Loading..." : "Error";

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
                            <BreadcrumbSeparator/>
                            <BreadcrumbItem>
                                <BreadcrumbPage>{label}</BreadcrumbPage>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>
                }
            >
                <PageTitle>{label}</PageTitle>
            </PageHeader>
            <PageContent>
                {props.kind === "loading" ? (
                    <p className="text-muted-foreground">Loading...</p>
                ) : (
                    <Alert variant="destructive">
                        <AlertDescription>{props.message}</AlertDescription>
                    </Alert>
                )}
            </PageContent>
        </Page>
    );
}
