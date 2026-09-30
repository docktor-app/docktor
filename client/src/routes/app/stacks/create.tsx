import {useState} from "react";
import {Link, useNavigate} from "react-router";
import {useForm} from "react-hook-form";
import {standardSchemaResolver} from "@hookform/resolvers/standard-schema";
import {type CreateStackInput, createStackSchema} from "@docktor/shared";
import {createStack} from "@/lib/stacks-api";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,} from "@/components/ui/form";
import {ComposeEditor} from "@/components/domain/stack/compose-editor";
import {EnvEditor} from "@/components/domain/stack/env-editor";
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
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    // EnvEditor validates its own table rows; true by default so an
    // untouched/raw-mode editor never blocks Create Stack.
    const [envValid, setEnvValid] = useState(true);

    const form = useForm<CreateStackInput>({
        resolver: standardSchemaResolver(createStackSchema),
        defaultValues: {
            displayName: "",
            description: "",
            composeContent: "",
            envContent: "",
        },
    });

    async function onSubmit(values: CreateStackInput) {
        setError("");
        setLoading(true);
        try {
            const stack = await createStack(values);
            navigate(`/stacks/${stack.id}`);
        } catch (err: any) {
            setError(err.message ?? "Failed to create stack");
            setLoading(false);
        }
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
                    <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                    </div>
                )}

                <Card>
                    <CardHeader>
                        <CardTitle>Stack Configuration</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Form {...form}>
                            <form
                                onSubmit={form.handleSubmit(onSubmit)}
                                className="space-y-4"
                            >
                                <FormField
                                    control={form.control}
                                    name="displayName"
                                    render={({field}) => (
                                        <FormItem>
                                            <FormLabel>Name</FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder="My Nextcloud"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormDescription>
                                                A friendly name for your stack
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="description"
                                    render={({field}) => (
                                        <FormItem>
                                            <FormLabel>Description</FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder="Optional description"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="composeContent"
                                    render={({field}) => (
                                        <FormItem>
                                            <FormLabel>
                                                Docker Compose File
                                            </FormLabel>
                                            {/* Not wrapped in FormControl: its Slot would forward
                                                ids to ComposeEditor's wrapper div instead of the
                                                CodeMirror textbox — the accessible name comes from
                                                ComposeEditor's own ariaLabel below. */}
                                            <ComposeEditor
                                                value={field.value}
                                                onChange={field.onChange}
                                                height="300px"
                                            />
                                            <FormDescription>
                                                Paste your docker-compose.yml
                                                content
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="envContent"
                                    render={({field}) => (
                                        <FormItem>
                                            <FormLabel>
                                                Environment Variables
                                            </FormLabel>
                                            {/* Not wrapped in FormControl: same reason as the
                                                compose editor above — EnvEditor's accessible
                                                name comes from its own ariaLabel default. */}
                                            <EnvEditor
                                                value={field.value ?? ""}
                                                onChange={field.onChange}
                                                onValidityChange={setEnvValid}
                                            />
                                            <FormDescription>
                                                Optional .env file content
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <div className="flex gap-2">
                                    <Button type="submit" disabled={loading || !envValid}>
                                        {loading
                                            ? "Creating..."
                                            : "Create Stack"}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => navigate("/stacks")}
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            </form>
                        </Form>
                    </CardContent>
                </Card>
            </PageContent>
        </Page>
    );
}
