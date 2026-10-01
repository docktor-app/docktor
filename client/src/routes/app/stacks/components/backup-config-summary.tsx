import {useCallback, useEffect, useState} from "react"
import {useNavigate} from "react-router"
import {toast} from "sonner"
import {AlertTriangle} from "lucide-react"

import {
    getBackupConfig,
    getVolumeWarnings,
    triggerBackup,
    type RetentionPolicy,
    type StackBackupConfig,
} from "@/lib/backups-api"
import {ApiError} from "@/lib/api"
import {Section, SectionActions, SectionHeader, SectionTitle} from "@/components/common/layout/section"
import {Button} from "@/components/ui/button"
import {Skeleton} from "@/components/ui/skeleton"
import {Alert, AlertDescription} from "@/components/ui/alert"
import {BackupScheduleDialog} from "@/routes/app/stacks/components/backup-schedule-dialog"

export interface BackupConfigSummaryProps {
    readonly stackId: string
    readonly stackStatus: string
}

type LoadState =
    | {status: "loading"}
    | {status: "error"; message: string}
    | {status: "ready"; config: StackBackupConfig; volumeWarnings: string[]}

function formatRetention(retention: RetentionPolicy): string {
    return `${retention.keepDaily} daily · ${retention.keepWeekly} weekly · ${retention.keepMonthly} monthly`
}

export function describeSchedule(config: StackBackupConfig): string {
    if (!config.useGlobalSchedule && config.schedule) {
        return config.schedule
    }
    if (config.globalSchedule) {
        return `Global default (${config.globalSchedule})`
    }
    return "Not scheduled"
}

export function describeRetention(config: StackBackupConfig): string {
    if (!config.useGlobalRetention && config.retention) {
        return formatRetention(config.retention)
    }
    if (config.globalRetention) {
        return `${formatRetention(config.globalRetention)} (global default)`
    }
    return "Global default"
}

/**
 * Read-only Backup Configuration summary (D-05/D-03) — replaces
 * BackupConfigCard's always-visible form with a flat Section, keeping the
 * frequently-used "Backup Now" inline and moving schedule/retention/hooks
 * editing into BackupScheduleDialog behind "Edit Schedule".
 */
export function BackupConfigSummary({stackId, stackStatus}: Readonly<BackupConfigSummaryProps>) {
    const navigate = useNavigate()
    const [state, setState] = useState<LoadState>({status: "loading"})
    const [dialogOpen, setDialogOpen] = useState(false)

    const load = useCallback(() => {
        setState({status: "loading"})
        Promise.all([getBackupConfig(stackId), getVolumeWarnings(stackId)])
            .then(([config, warnings]) => {
                setState({status: "ready", config, volumeWarnings: warnings.warnings})
            })
            .catch((err: unknown) => {
                const message =
                    err instanceof ApiError ? err.message : "Failed to load backup configuration"
                setState({status: "error", message})
            })
    }, [stackId])

    useEffect(() => {
        load()
    }, [load])

    const isBackingUp = stackStatus === "BACKING_UP"

    async function handleBackupNow() {
        try {
            const {backupId} = await triggerBackup(stackId)
            toast.success("Backup started", {
                action: {
                    label: "View progress",
                    onClick: () => navigate(`/stacks/${stackId}/backups/${backupId}`),
                },
            })
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Backup failed"
            toast.error(message)
        }
    }

    if (state.status === "loading") {
        return (
            <div className="space-y-4">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-24 w-full" />
            </div>
        )
    }

    if (state.status === "error") {
        return (
            <Alert variant="destructive">
                <AlertDescription className="space-y-2">
                    <p>{state.message}</p>
                    <Button variant="outline" size="sm" onClick={load}>
                        Retry
                    </Button>
                </AlertDescription>
            </Alert>
        )
    }

    const {config, volumeWarnings} = state

    return (
        <Section>
            <SectionHeader>
                <SectionTitle>Backup Configuration</SectionTitle>
                <SectionActions>
                    <Button variant="outline" disabled={isBackingUp} onClick={handleBackupNow}>
                        {isBackingUp ? "Backup in progress..." : "Backup Now"}
                    </Button>
                    <Button onClick={() => setDialogOpen(true)}>Edit Schedule</Button>
                </SectionActions>
            </SectionHeader>

            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
                <dt className="text-sm font-semibold text-muted-foreground">Schedule</dt>
                <dd className="text-sm">{describeSchedule(config)}</dd>

                <dt className="text-sm font-semibold text-muted-foreground">Retention</dt>
                <dd className="text-sm">{describeRetention(config)}</dd>

                <dt className="text-sm font-semibold text-muted-foreground">Pre-backup hook</dt>
                <dd className="text-sm font-mono break-all">{config.preHook || "None"}</dd>

                <dt className="text-sm font-semibold text-muted-foreground">Post-backup hook</dt>
                <dd className="text-sm font-mono break-all">{config.postHook || "None"}</dd>
            </dl>

            {volumeWarnings.length > 0 && (
                <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                        <p className="mb-1">
                            The following volumes are outside the stack directory and will not be
                            included in this backup:
                        </p>
                        <ul className="list-disc list-inside space-y-0.5">
                            {volumeWarnings.map((w) => (
                                <li key={w} className="text-xs font-mono">
                                    {w}
                                </li>
                            ))}
                        </ul>
                    </AlertDescription>
                </Alert>
            )}

            <BackupScheduleDialog
                stackId={stackId}
                config={config}
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                onSaved={load}
            />
        </Section>
    )
}
