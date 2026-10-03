import {useForm} from "react-hook-form";
import {standardSchemaResolver} from "@hookform/resolvers/standard-schema";
import {toast} from "sonner";
import {addTemplateRepoSchema, type AddTemplateRepoInput} from "@docktor/shared";

import {useTemplateRepos} from "@/hooks/use-template-repos";
import {ApiError} from "@/lib/api";
import type {TemplateRepoStatus} from "@/lib/templates-api";
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Skeleton} from "@/components/ui/skeleton";
import {ToneBadge} from "@/components/common/tone-badge";
import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage} from "@/components/ui/form";

/**
 * Issue #19 "users can add additional template repositories"/"malformed
 * templates are rejected with a clear error": Settings → Stacks "Template
 * Repositories" card — lists every configured repo (the official one
 * flagged "Official"), its sync status/error, any skipped-template issues,
 * a per-row manual re-sync action, and an add-repository form. Built on
 * ProxySettingsCard's RHF + Skeleton + toast pattern (CLAUDE.md's named
 * target shape for settings cards).
 */
export function TemplateReposCard() {
    const {repos, loading, syncingIds, addRepo, syncRepo} = useTemplateRepos();

    const form = useForm<AddTemplateRepoInput>({
        resolver: standardSchemaResolver(addTemplateRepoSchema),
        defaultValues: {url: ""},
    });

    // Manual toast lifecycle (not toast.promise) because a 409 duplicate-url
    // response must set a field error with NO generic error toast — a
    // requirement toast.promise's single error-callback can't express
    // (returning a falsy value from its error callback still renders an
    // empty toast).
    function handleAdd(data: AddTemplateRepoInput) {
        const toastId = toast.loading("Adding repository…");
        addRepo(data.url)
            .then((created) => {
                form.reset({url: ""});
                toast.success(
                    created.lastSyncError
                        ? "Repository added, but syncing failed — see the error below."
                        : "Repository added",
                    {id: toastId},
                );
            })
            .catch((err: unknown) => {
                if (err instanceof ApiError && err.status === 409) {
                    form.setError("url", {message: "This repository is already added"});
                    toast.dismiss(toastId);
                    return;
                }
                if (err instanceof ApiError && err.fields?.url) {
                    form.setError("url", {message: err.fields.url});
                }
                const message = err instanceof ApiError ? err.message : ((err as Error)?.message ?? "unknown error");
                toast.error(`Couldn't add repository — ${message}`, {id: toastId});
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
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-16 w-full" />
                    </div>
                ) : (
                    repos.map((repoRow) => (
                        <TemplateRepoRow
                            key={repoRow.id}
                            repo={repoRow}
                            syncing={syncingIds.has(repoRow.id)}
                            onSyncNow={() => void syncRepo(repoRow.id)}
                        />
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

interface TemplateRepoRowProps {
    readonly repo: TemplateRepoStatus;
    readonly syncing: boolean;
    readonly onSyncNow: () => void;
}

function TemplateRepoRow({repo, syncing, onSyncNow}: Readonly<TemplateRepoRowProps>) {
    return (
        <div className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 font-mono text-sm break-all">{repo.url}</span>
                    {repo.isDefault && <ToneBadge tone="neutral">Official</ToneBadge>}
                </div>
                <Button type="button" variant="outline" size="sm" disabled={syncing} onClick={onSyncNow}>
                    {syncing ? "Syncing…" : "Sync now"}
                </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {repo.lastSyncError ? (
                    <>
                        <ToneBadge tone="red">Sync failed</ToneBadge>
                        <span className="text-sm text-destructive">{repo.lastSyncError}</span>
                    </>
                ) : repo.lastSyncedAt ? (
                    <>
                        <ToneBadge tone="green">Synced</ToneBadge>
                        <span className="text-sm text-muted-foreground">
                            Last synced {new Date(repo.lastSyncedAt).toLocaleString()}
                        </span>
                    </>
                ) : (
                    <ToneBadge tone="neutral">Not synced yet</ToneBadge>
                )}
                {repo.issues.length > 0 && <ToneBadge tone="yellow">{repo.issues.length} skipped</ToneBadge>}
            </div>
            {repo.issues.length > 0 && (
                <details>
                    <summary className="cursor-pointer text-sm text-muted-foreground">
                        Show skipped templates
                    </summary>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {repo.issues.map((issue) => (
                            <li key={`${issue.path}:${issue.message}`}>
                                {issue.path}: {issue.message}
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </div>
    );
}
