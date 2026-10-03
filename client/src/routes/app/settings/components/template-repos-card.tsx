import {useForm} from "react-hook-form";
import {standardSchemaResolver} from "@hookform/resolvers/standard-schema";
import {toast} from "sonner";
import {addTemplateRepoSchema, type AddTemplateRepoInput} from "@docktor/shared";

import {useTemplateRepos} from "@/hooks/use-template-repos";
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Skeleton} from "@/components/ui/skeleton";
import {ToneBadge} from "@/components/common/tone-badge";
import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage} from "@/components/ui/form";

/**
 * Issue #19 "users can add additional template repositories": Settings →
 * Stacks "Template Repositories" card — lists every configured repo (the
 * official one flagged "Official") and an add-repository form. Built on
 * ProxySettingsCard's RHF + Skeleton + toast pattern (CLAUDE.md's named
 * target shape for settings cards).
 */
export function TemplateReposCard() {
    const {repos, loading, addRepo} = useTemplateRepos();

    const form = useForm<AddTemplateRepoInput>({
        resolver: standardSchemaResolver(addTemplateRepoSchema),
        defaultValues: {url: ""},
    });

    function handleAdd(data: AddTemplateRepoInput) {
        toast.promise(addRepo(data.url), {
            loading: "Adding repository…",
            success: (created) => {
                form.reset({url: ""});
                return created.lastSyncError
                    ? "Repository added, but syncing failed — see the error below."
                    : "Repository added";
            },
            error: (err: unknown) =>
                `Couldn't add repository — ${err instanceof Error ? err.message : "unknown error"}`,
        });
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Template Repositories</CardTitle>
                <CardDescription>Docktor reads stack templates from these git repositories.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {loading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                ) : (
                    repos.map((repoRow) => (
                        <div key={repoRow.id} className="flex items-center gap-2 rounded-md border p-3">
                            <span className="min-w-0 flex-1 font-mono text-sm break-all">{repoRow.url}</span>
                            {repoRow.isDefault && <ToneBadge tone="neutral">Official</ToneBadge>}
                        </div>
                    ))
                )}
            </CardContent>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(handleAdd)}>
                    <CardContent className="space-y-4">
                        <FormField
                            control={form.control}
                            name="url"
                            render={({field}) => (
                                <FormItem>
                                    <FormLabel className="font-semibold">Repository URL</FormLabel>
                                    <FormControl>
                                        <Input {...field} placeholder="https://github.com/you/templates" />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </CardContent>
                    <CardFooter>
                        <Button type="submit">Add Repository</Button>
                    </CardFooter>
                </form>
            </Form>
        </Card>
    );
}
