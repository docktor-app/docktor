import {useEffect, useState} from "react";
import {useForm} from "react-hook-form";
import {standardSchemaResolver} from "@hookform/resolvers/standard-schema";
import {toast} from "sonner";
import {
    HEALTH_RETENTION_DEFAULT_DAYS,
    healthSettingsSchema,
    type HealthSettings,
} from "@docktor/shared";

import {getHealthSettings, saveHealthSettings} from "@/lib/settings-api";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardFooter, CardHeader, CardTitle} from "@/components/ui/card";
import {Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage} from "@/components/ui/form";
import {Input} from "@/components/ui/input";
import {Skeleton} from "@/components/ui/skeleton";

const RETENTION_DESCRIPTION =
    "Uptime, incidents, and health history are kept and calculated over this window. " +
    "Records older than the window are deleted daily. 1 to 365; the default is 30.";

/**
 * D-10 / UI-SPEC G: the global health-history retention window. Structure
 * follows ComposeChecksCard, except a failed load renders an Alert (the
 * UI-SPEC forbids a silent failure here) and a decrease is gated behind an
 * AlertDialog, because shortening the window schedules irreversible deletion
 * of history in the daily pruner.
 */
export function HealthRetentionCard() {
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [savedDays, setSavedDays] = useState<number | null>(null);
    // The values awaiting confirmation stay set after the dialog closes so its
    // copy does not blank out during the exit animation.
    const [pending, setPending] = useState<HealthSettings | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);

    const form = useForm<HealthSettings>({
        resolver: standardSchemaResolver(healthSettingsSchema),
        mode: "onTouched",
        defaultValues: {retentionDays: HEALTH_RETENTION_DEFAULT_DAYS},
    });

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            setLoadError(false);
            try {
                const data = await getHealthSettings();
                if (cancelled) return;
                form.reset(data);
                setSavedDays(data.retentionDays);
            } catch {
                if (!cancelled) setLoadError(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        void load();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function save(values: HealthSettings) {
        toast.promise(
            saveHealthSettings(values).then((saved) => {
                form.reset(saved);
                setSavedDays(saved.retentionDays);
            }),
            {
                loading: "Saving health settings…",
                success: "Health settings saved",
                error: (err: unknown) =>
                    `Couldn't save health settings — ${err instanceof Error ? err.message : "unknown error"}. Try again.`,
            },
        );
    }

    function handleSubmit(values: HealthSettings) {
        if (savedDays !== null && values.retentionDays < savedDays) {
            setPending(values);
            setConfirmOpen(true);
            return;
        }
        save(values);
    }

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Health History</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-9 w-40" />
                    <Skeleton className="h-4 w-full max-w-md" />
                </CardContent>
            </Card>
        );
    }

    if (loadError) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Health History</CardTitle>
                </CardHeader>
                <CardContent>
                    <Alert variant="destructive">
                        <AlertDescription>
                            Couldn't load health settings. Reload the page to try again.
                        </AlertDescription>
                    </Alert>
                </CardContent>
            </Card>
        );
    }

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Health History</CardTitle>
                </CardHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)}>
                        <CardContent>
                            <FormField
                                control={form.control}
                                name="retentionDays"
                                render={({field}) => (
                                    <FormItem>
                                        <FormLabel>Retention (days)</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="number"
                                                inputMode="numeric"
                                                className="max-w-40"
                                                name={field.name}
                                                ref={field.ref}
                                                onBlur={field.onBlur}
                                                value={Number.isNaN(field.value) ? "" : field.value}
                                                onChange={(event) =>
                                                    field.onChange(
                                                        event.target.value === ""
                                                            ? Number.NaN
                                                            : event.target.valueAsNumber,
                                                    )
                                                }
                                            />
                                        </FormControl>
                                        <FormDescription>{RETENTION_DESCRIPTION}</FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </CardContent>
                        <CardFooter>
                            <Button type="submit">Save Health Settings</Button>
                        </CardFooter>
                    </form>
                </Form>
            </Card>

            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Shorten retention to {pending?.retentionDays} days?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Records older than {pending?.retentionDays} days will be permanently deleted during the
                            next daily cleanup, and uptime will be calculated over the shorter window.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep {savedDays} days</AlertDialogCancel>
                        <AlertDialogAction
                            variant="secondary"
                            onClick={() => pending && save(pending)}
                        >
                            Shorten retention
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
