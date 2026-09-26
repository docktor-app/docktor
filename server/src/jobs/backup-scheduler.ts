import cron from "node-cron"
import type {Job, JobHealthReporter, JobKind} from "./job.js"
// Type-only import (erased at compile time, no runtime edge) — this file's
// only top-level *runtime* imports remain `cron` and `./job.js`, confirmed
// before wiring the composition root's import of this module below
// (T-10-34: a runtime cycle here would break server startup, not a test).
import type {BackupSchedulePort} from "../application/ports/backup-schedule-port.js"

// ─── Dependency interfaces ────────────────────────────────────────────────────

export interface BackupSchedulerService {
    initiateBackup(stackId: string, trigger: "MANUAL" | "SCHEDULED"): Promise<{id: string} | undefined>
    runBackup(
        backupRecord: {id: string; stackId: string; logLines: string[]},
        stack: {id: string; hostPath?: string; status: string; previousStatus: string | null; backupPreHook: string | null; backupPostHook: string | null; backupSchedule: string | null; backupRetention: string | null},
        repoConfig: {repoType: "local" | "sftp" | "s3"; password: string; repoPath?: string; sftpHost?: string; sftpUser?: string; sftpKey?: string; s3Endpoint?: string; s3Bucket?: string; s3AccessKey?: string; s3SecretKey?: string},
    ): Promise<void>
    getBackupRepoConfig(): Promise<{repoType: "local" | "sftp" | "s3"; password: string; repoPath?: string; sftpHost?: string; sftpUser?: string; sftpKey?: string; s3Endpoint?: string; s3Bucket?: string; s3AccessKey?: string; s3SecretKey?: string} | null>
    abortBackup(backupId: string, stackId: string, errorMessage: string): Promise<void>
}

export interface BackupSchedulerStackRepo {
    findAllWithSchedule(): Promise<Array<{id: string; backupSchedule: string | null}>>
    findByIdOrThrow(id: string): Promise<{id: string; hostPath?: string; status: string; previousStatus: string | null; backupPreHook: string | null; backupPostHook: string | null; backupSchedule: string | null; backupRetention: string | null}>
}

export interface BackupSchedulerBackupRepo {
    findByIdOrThrow(id: string): Promise<{id: string; stackId: string; logLines: string[]}>
}

export interface BackupSchedulerSettings {
    getSetting(key: string): Promise<string | null>
}

// ─── BackupScheduler ──────────────────────────────────────────────────────────

// PD-6: this job's schedules are per-stack and dynamic (one cron task per
// stack, created/destroyed at runtime by upsert()/remove()), so it
// implements Job directly rather than extending IntervalJob or WatcherJob —
// neither base class's single schedule handle fits an N-task job. The
// per-stack task map stays internal; the registry only ever sees name/kind
// and the four Job lifecycle members.
export class BackupScheduler implements Job {
    readonly name = "BackupScheduler"
    readonly kind: JobKind = "dynamic"

    private tasks = new Map<string, cron.ScheduledTask>()
    private healthReporter: JobHealthReporter | null = null

    constructor(
        private readonly service: BackupSchedulerService,
        private readonly stackRepo: BackupSchedulerStackRepo,
        private readonly settings: BackupSchedulerSettings,
        private readonly backupRepo: BackupSchedulerBackupRepo,
    ) {}

    setHealthReporter(reporter: JobHealthReporter): void {
        this.healthReporter = reporter
    }

    async start(): Promise<void> {
        await this.loadAll()
    }

    /**
     * Creates or replaces a cron task for the given stack.
     * Validates the cron expression before scheduling.
     */
    upsert(stackId: string, cronExpr: string): void {
        // Validate expression; cron.validate returns false for invalid expressions
        if (cron.validate(cronExpr) === false) {
            console.error(`[BackupScheduler] Invalid cron expression for stack ${stackId}: ${cronExpr}`)
            return
        }

        // Stop existing task for this stack if one exists
        const existing = this.tasks.get(stackId)
        if (existing) {
            existing.stop()
        }

        const task = cron.schedule(cronExpr, () => {
            void this.runScheduledBackup(stackId)
        }, {scheduled: true})

        this.tasks.set(stackId, task)
    }

    /**
     * Stops and removes the cron task for the given stack.
     * No-op if no task is registered.
     */
    remove(stackId: string): void {
        const task = this.tasks.get(stackId)
        if (!task) return
        task.stop()
        this.tasks.delete(stackId)
    }

    /**
     * Stops all registered cron tasks and clears the map.
     */
    stop(): void {
        for (const task of this.tasks.values()) {
            task.stop()
        }
        this.tasks.clear()
    }

    /**
     * Loads all stacks with backup schedules and registers cron tasks.
     * Uses the per-stack schedule if set, otherwise falls back to the global default.
     */
    async loadAll(): Promise<void> {
        const stacks = await this.stackRepo.findAllWithSchedule()
        const globalDefault = await this.settings.getSetting("backup.defaultSchedule")

        let registered = 0
        for (const stack of stacks) {
            const schedule = stack.backupSchedule ?? globalDefault
            if (!schedule) continue

            this.upsert(stack.id, schedule)
            registered++
        }

        console.log(`[BackupScheduler] Registered ${registered} backup schedule(s)`)
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    /**
     * Invokes backup for a stack on schedule. Errors are logged and swallowed
     * to prevent cron task crashes. Reports at the scheduler level (a "run"
     * once the tick has fired the initiateBackup call, an "error" only when
     * that call itself throws) — the only honest reading of a single
     * last-run/last-error field shared across every stack's cron task.
     */
    private async runScheduledBackup(stackId: string): Promise<void> {
        try {
            const result = await this.service.initiateBackup(stackId, "SCHEDULED")
            if (!result) {
                this.healthReporter?.recordRun(this.name)
                return
            }

            // Fire-and-forget: fetch required args and run backup asynchronously
            // Pattern matches routes/backups.ts lines 36-56
            void (async () => {
                try {
                    console.log(`[BackupScheduler] Fetching backup dependencies for ${result.id}`)
                    const [backupRecord, stack, repoConfig] = await Promise.all([
                        this.backupRepo.findByIdOrThrow(result.id),
                        this.stackRepo.findByIdOrThrow(stackId),
                        this.service.getBackupRepoConfig(),
                    ])
                    console.log(`[BackupScheduler] Dependencies fetched. repoConfig exists: ${!!repoConfig}`)
                    if (!repoConfig) {
                        console.error(`[BackupScheduler] No repoConfig - backup repository not configured`)
                        await this.service.abortBackup(
                            result.id,
                            stackId,
                            "No backup repository is configured. Configure one in Settings > Backup.",
                        )
                        return
                    }
                    console.log(`[BackupScheduler] Starting runBackup for ${result.id}`)
                    await this.service.runBackup(backupRecord, stack, repoConfig)
                    console.log(`[BackupScheduler] runBackup completed for ${result.id}`)
                } catch (err) {
                    console.error(`[BackupScheduler] Scheduled backup execution failed for ${result.id}:`, err)
                    try {
                        await this.service.abortBackup(
                            result.id,
                            stackId,
                            err instanceof Error ? err.message : String(err),
                        )
                    } catch (abortErr) {
                        console.error(`[BackupScheduler] abortBackup failed for ${result.id}:`, abortErr)
                    }
                }
            })()

            this.healthReporter?.recordRun(this.name)
        } catch (err) {
            console.error(`[BackupScheduler] Scheduled backup failed for stack ${stackId}:`, err)
            this.healthReporter?.recordError(this.name, err)
        }
    }
}

// ─── Lazy production singleton ────────────────────────────────────────────────

let _scheduler: BackupScheduler | null = null

async function createProductionScheduler(): Promise<BackupScheduler> {
    const {backupService, settingsService} = await import("../application/index.js")
    const {stackRepository} = await import("../repositories/stack-repository.js")
    const {backupRepository} = await import("../repositories/backup-repository.js")

    return new BackupScheduler(
        backupService,
        {
            findAllWithSchedule: () => stackRepository.findAll(),
            findByIdOrThrow: (id: string) => stackRepository.findByIdOrThrow(id),
        },
        settingsService,
        {
            findByIdOrThrow: (id: string) => backupRepository.findByIdOrThrow(id),
        },
    )
}

let _healthReporter: JobHealthReporter | null = null

// A Job facade over the lazily-constructed production BackupScheduler,
// plus the upsert()/remove() members BackupService calls at runtime (via
// BackupSchedulePort) to create and destroy a single stack's schedule —
// the lazy construction itself (not this facade) is what keeps db.ts and
// the rest of the production dependency chain out of the unit-test module
// graph. Annotated with BackupSchedulePort so removing upsert()/remove()
// from this object is a compile error, not a silent drift from the port.
export const backupScheduler: Job & BackupSchedulePort = {
    name: "BackupScheduler",
    kind: "dynamic",
    start: async () => {
        _scheduler = await createProductionScheduler()
        if (_healthReporter) _scheduler.setHealthReporter(_healthReporter)
        await _scheduler.start()
    },
    stop: () => _scheduler?.stop(),
    setHealthReporter: (reporter: JobHealthReporter) => {
        _healthReporter = reporter
        _scheduler?.setHealthReporter(reporter)
    },
    upsert: (stackId: string, cronExpr: string) => _scheduler?.upsert(stackId, cronExpr),
    remove: (stackId: string) => _scheduler?.remove(stackId),
}
