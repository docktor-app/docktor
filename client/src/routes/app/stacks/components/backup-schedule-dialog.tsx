import * as React from "react"
import {useForm, type Resolver} from "react-hook-form"
import {standardSchemaResolver} from "@hookform/resolvers/standard-schema"
import {toast} from "sonner"
import {stackBackupConfigSchema} from "@docktor/shared"

import {saveBackupConfig, type StackBackupConfig} from "@/lib/backups-api"
import {ApiError} from "@/lib/api"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import {Button} from "@/components/ui/button"
import {Input} from "@/components/ui/input"
import {Switch} from "@/components/ui/switch"
import {Form, FormControl, FormField, FormItem, FormLabel, FormMessage} from "@/components/ui/form"

export interface BackupScheduleFormValues {
    useGlobalSchedule: boolean
    schedule: string
    useGlobalRetention: boolean
    retention: {
        keepDaily: number
        keepWeekly: number
        keepMonthly: number
    }
    preHook: string
    postHook: string
}

export interface BackupScheduleDialogProps {
    readonly stackId: string
    readonly config: StackBackupConfig
    readonly open: boolean
    readonly onOpenChange: (open: boolean) => void
    readonly onSaved: () => void
}

const FORM_FIELD_NAMES = new Set<keyof BackupScheduleFormValues>([
    "useGlobalSchedule",
    "schedule",
    "useGlobalRetention",
    "retention",
    "preHook",
    "postHook",
])

function defaultsForConfig(config: StackBackupConfig): BackupScheduleFormValues {
    return {
        useGlobalSchedule: config.useGlobalSchedule,
        schedule: config.schedule ?? "",
        useGlobalRetention: config.useGlobalRetention,
        retention: config.retention ?? config.globalRetention ?? {keepDaily: 7, keepWeekly: 4, keepMonthly: 12},
        preHook: config.preHook ?? "",
        postHook: config.postHook ?? "",
    }
}

/**
 * Maps the dialog's form values to saveBackupConfig's payload: an override
 * field only carries its edited value when its "use global" toggle is off;
 * otherwise it submits null so the server falls back to the global default.
 * Mirrors BackupConfigCard's former handleSave mapping exactly.
 */
export function toBackupConfigPayload(values: BackupScheduleFormValues): Record<string, unknown> {
    return {
        useGlobalSchedule: values.useGlobalSchedule,
        schedule: values.useGlobalSchedule ? null : values.schedule || null,
        useGlobalRetention: values.useGlobalRetention,
        retention: values.useGlobalRetention
            ? null
            : {
                  keepDaily: values.retention.keepDaily,
                  keepWeekly: values.retention.keepWeekly,
                  keepMonthly: values.retention.keepMonthly,
              },
        preHook: values.preHook || null,
        postHook: values.postHook || null,
    }
}

/**
 * Schedule/retention/hooks editor (D-05) — moved from BackupConfigCard's
 * eight ad-hoc local-state fields onto react-hook-form + the shared
 * stackBackupConfigSchema (CLAUDE.md forms rule), following the
 * Dialog-with-form shell established by proxy-assign-dialog.tsx.
 */
export function BackupScheduleDialog({
    stackId,
    config,
    open,
    onOpenChange,
    onSaved,
}: Readonly<BackupScheduleDialogProps>) {
    const [submitting, setSubmitting] = React.useState(false)

    const form = useForm<BackupScheduleFormValues>({
        // Safe: retentionPolicySchema's fields use z.coerce.number(), so the
        // resolver's pre-coercion input type doesn't structurally match
        // BackupScheduleFormValues (the post-coercion output type) at the
        // type level — at runtime the resolver still coerces exactly to
        // this shape, matching what the form actually submits. Mirrors
        // proxy-assign-dialog.tsx's identical cast.
        resolver: standardSchemaResolver(
            stackBackupConfigSchema,
        ) as unknown as Resolver<BackupScheduleFormValues>,
        defaultValues: defaultsForConfig(config),
    })
    const useGlobalSchedule = form.watch("useGlobalSchedule")
    const useGlobalRetention = form.watch("useGlobalRetention")

    // Re-pre-fill every time the dialog opens — never a blank required
    // field on first open (UI-SPEC empty row).
    React.useEffect(() => {
        if (!open) return
        form.reset(defaultsForConfig(config))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, config])

    function onSubmit(values: BackupScheduleFormValues) {
        setSubmitting(true)
        toast.promise(
            (async () => {
                try {
                    await saveBackupConfig(stackId, toBackupConfigPayload(values))
                    onOpenChange(false)
                    onSaved()
                } finally {
                    setSubmitting(false)
                }
            })(),
            {
                loading: "Saving schedule…",
                success: "Schedule saved",
                error: (err: unknown) => {
                    if (err instanceof ApiError && err.fields) {
                        for (const [key, message] of Object.entries(err.fields)) {
                            if (FORM_FIELD_NAMES.has(key as keyof BackupScheduleFormValues)) {
                                form.setError(key as keyof BackupScheduleFormValues, {message})
                            }
                        }
                    }
                    const message =
                        err instanceof ApiError
                            ? err.message
                            : ((err as Error)?.message ?? "Failed to save schedule")
                    return `Couldn't save schedule — ${message}. Try again.`
                },
            },
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit Backup Schedule</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="useGlobalSchedule"
                            render={({field}) => (
                                <FormItem className="flex items-center gap-3 space-y-0">
                                    <FormControl>
                                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                                    </FormControl>
                                    <FormLabel className="font-semibold">
                                        Use global schedule
                                        {config.globalSchedule && (
                                            <span className="ml-1 font-normal text-xs text-muted-foreground">
                                                ({config.globalSchedule})
                                            </span>
                                        )}
                                    </FormLabel>
                                </FormItem>
                            )}
                        />

                        {!useGlobalSchedule && (
                            <FormField
                                control={form.control}
                                name="schedule"
                                render={({field}) => (
                                    <FormItem>
                                        <FormLabel className="font-semibold">Schedule</FormLabel>
                                        <FormControl>
                                            <Input {...field} placeholder="0 3 * * *" />
                                        </FormControl>
                                        <p className="text-xs text-muted-foreground">
                                            5-field cron expression (minute hour day month weekday)
                                        </p>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        <FormField
                            control={form.control}
                            name="useGlobalRetention"
                            render={({field}) => (
                                <FormItem className="flex items-center gap-3 space-y-0">
                                    <FormControl>
                                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                                    </FormControl>
                                    <FormLabel className="font-semibold">Use global retention</FormLabel>
                                </FormItem>
                            )}
                        />

                        {!useGlobalRetention && (
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <FormField
                                    control={form.control}
                                    name="retention.keepDaily"
                                    render={({field}) => (
                                        <FormItem>
                                            <FormLabel>Keep daily</FormLabel>
                                            <FormControl>
                                                <Input type="number" min={0} {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="retention.keepWeekly"
                                    render={({field}) => (
                                        <FormItem>
                                            <FormLabel>Keep weekly</FormLabel>
                                            <FormControl>
                                                <Input type="number" min={0} {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="retention.keepMonthly"
                                    render={({field}) => (
                                        <FormItem>
                                            <FormLabel>Keep monthly</FormLabel>
                                            <FormControl>
                                                <Input type="number" min={0} {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        )}

                        <FormField
                            control={form.control}
                            name="preHook"
                            render={({field}) => (
                                <FormItem>
                                    <FormLabel className="font-semibold">Pre-backup hook</FormLabel>
                                    <FormControl>
                                        <Input {...field} placeholder="e.g. docker exec mydb pg_dump ..." />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="postHook"
                            render={({field}) => (
                                <FormItem>
                                    <FormLabel className="font-semibold">Post-backup hook</FormLabel>
                                    <FormControl>
                                        <Input {...field} placeholder="e.g. /opt/scripts/notify.sh" />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={submitting}>
                                Save Schedule
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}
