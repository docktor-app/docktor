import {useState} from "react";
import {useForm} from "react-hook-form";
import {standardSchemaResolver} from "@hookform/resolvers/standard-schema";
import {type CreateStackInput, createStackSchema} from "@docktor/shared";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage} from "@/components/ui/form";
import {ComposeEditor} from "@/components/domain/stack/compose-editor";
import {EnvEditor} from "@/components/domain/stack/env-editor";

export interface CreateStackFormProps {
    readonly defaultValues: CreateStackInput;
    readonly submitting: boolean;
    readonly onSubmit: (values: CreateStackInput) => void;
    readonly onCancel: () => void;
}

/**
 * Issue #20/CLAUDE.md Page Composition: the Create Stack page's form section
 * — moved out of create.tsx unchanged in behaviour so the page itself is a
 * thin orchestrator. Keeps its own `useForm` state so "Keep Editing" (the
 * create-review dialog's cancel action) returns to intact field values —
 * this component is never unmounted while the review dialog is open.
 */
export function CreateStackForm({
    defaultValues,
    submitting,
    onSubmit,
    onCancel,
}: Readonly<CreateStackFormProps>): React.JSX.Element {
    // EnvEditor validates its own table rows; true by default so an
    // untouched/raw-mode editor never blocks Create Stack.
    const [envValid, setEnvValid] = useState(true);

    const form = useForm<CreateStackInput>({
        resolver: standardSchemaResolver(createStackSchema),
        defaultValues,
    });

    return (
        <Card>
            <CardHeader>
                <CardTitle>Stack Configuration</CardTitle>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="displayName"
                            render={({field}) => (
                                <FormItem>
                                    <FormLabel>Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="My Nextcloud" {...field} />
                                    </FormControl>
                                    <FormDescription>A friendly name for your stack</FormDescription>
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
                                        <Input placeholder="Optional description" {...field} />
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
                                    <FormLabel>Docker Compose File</FormLabel>
                                    {/* Not wrapped in FormControl: its Slot would forward
                                        ids to ComposeEditor's wrapper div instead of the
                                        CodeMirror textbox — the accessible name comes from
                                        ComposeEditor's own ariaLabel below. */}
                                    <ComposeEditor value={field.value} onChange={field.onChange} height="300px" />
                                    <FormDescription>Paste your docker-compose.yml content</FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="envContent"
                            render={({field}) => (
                                <FormItem>
                                    <FormLabel>Environment Variables</FormLabel>
                                    {/* Not wrapped in FormControl: same reason as the
                                        compose editor above — EnvEditor's accessible
                                        name comes from its own ariaLabel default. */}
                                    <EnvEditor
                                        value={field.value ?? ""}
                                        onChange={field.onChange}
                                        onValidityChange={setEnvValid}
                                    />
                                    <FormDescription>Optional .env file content</FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="flex gap-2">
                            <Button type="submit" disabled={submitting || !envValid}>
                                {submitting ? "Creating..." : "Create Stack"}
                            </Button>
                            <Button type="button" variant="outline" onClick={onCancel}>
                                Cancel
                            </Button>
                        </div>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
