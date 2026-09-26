import cron from "node-cron"

/**
 * The three job shapes the registry can manage. `interval` and `watcher` are
 * generalised by the base classes below (D-13); `dynamic` is the escape
 * hatch for a job that manages its own set of schedules (e.g. one cron task
 * per stack) and implements `Job` directly instead of extending a base
 * class — see 10-04-PLAN.md PD-6.
 */
export type JobKind = "interval" | "watcher" | "dynamic"

/**
 * Two-member interface so a job can report its own outcomes without
 * importing the registry itself — the registry implements this and hands
 * itself to each job via `setHealthReporter`, keeping the dependency arrow
 * pointing one way (job -> reporter interface, never job -> registry).
 */
export interface JobHealthReporter {
    recordRun(jobName: string): void
    recordError(jobName: string, error: unknown): void
}

/**
 * The lifecycle contract every job — however it schedules itself — must
 * satisfy so the registry can start, stop and health-track it uniformly.
 */
export interface Job {
    readonly name: string
    readonly kind: JobKind
    start(): Promise<void> | void
    stop(): Promise<void> | void
    setHealthReporter(reporter: JobHealthReporter): void
}

/**
 * Base class for the purely cron-driven job shape (disk-checker,
 * backup-scheduler's per-stack tasks aside — see PD-6 — update-checker,
 * proxy-cert-poller). The subclass supplies its cron expression, an
 * optional "run once immediately on start" behaviour, and the run body;
 * this class owns the schedule handle, the try/catch around every
 * invocation, and health reporting.
 */
export abstract class IntervalJob implements Job {
    readonly kind: JobKind = "interval"
    abstract readonly name: string

    /** The cron expression this job runs on, kept next to the job's own code. */
    protected abstract readonly cronExpression: string
    /** Whether `start()` invokes `run()` once immediately, before the first scheduled tick. */
    protected abstract readonly runImmediatelyOnStart: boolean

    protected abstract run(): Promise<void> | void

    private cronTask: cron.ScheduledTask | null = null
    private healthReporter: JobHealthReporter | null = null

    setHealthReporter(reporter: JobHealthReporter): void {
        this.healthReporter = reporter
    }

    async start(): Promise<void> {
        // A second start() while already scheduled would leak the first
        // handle (overwritten, never cancellable) — no-op instead.
        if (this.cronTask !== null) return

        if (this.runImmediatelyOnStart) {
            await this.runGuarded()
        }

        this.cronTask = cron.schedule(this.cronExpression, () => {
            void this.runGuarded()
        })
    }

    stop(): void {
        this.cronTask?.stop()
        this.cronTask = null
    }

    private async runGuarded(): Promise<void> {
        try {
            await this.run()
            this.healthReporter?.recordRun(this.name)
        } catch (err) {
            console.error(`[${this.name}] run failed:`, err)
            this.healthReporter?.recordError(this.name, err)
        }
    }
}

/**
 * Base class for the event-driven job shape with an optional cron-based
 * reconciliation fallback (state-poller, file-watcher, and
 * notification-watcher whose reconcile schedule is `null` — it has nothing
 * to reconcile against, per PD-6). The subclass supplies how to attach and
 * detach its event source and how to reconcile; this class owns the
 * attach-then-schedule / detach-then-cancel ordering, the try/catch around
 * every reconcile invocation, and health reporting.
 */
export abstract class WatcherJob implements Job {
    readonly kind: JobKind = "watcher"
    abstract readonly name: string

    /** The reconcile cron expression, or `null` when this watcher has nothing to reconcile against. */
    protected abstract readonly reconcileCronExpression: string | null

    protected abstract attach(): Promise<void> | void
    protected abstract detach(): Promise<void> | void
    protected abstract reconcile(): Promise<void> | void

    private cronTask: cron.ScheduledTask | null = null
    private started = false
    private healthReporter: JobHealthReporter | null = null

    setHealthReporter(reporter: JobHealthReporter): void {
        this.healthReporter = reporter
    }

    async start(): Promise<void> {
        // A second start() while already attached would leak the first
        // event source / schedule — no-op instead.
        if (this.started) return
        this.started = true

        await this.attach()

        if (this.reconcileCronExpression !== null) {
            this.cronTask = cron.schedule(this.reconcileCronExpression, () => {
                void this.reconcileGuarded()
            })
        }
    }

    async stop(): Promise<void> {
        if (!this.started) return

        try {
            await this.detach()
        } catch (err) {
            console.error(`[${this.name}] detach failed:`, err)
        } finally {
            // Cancel the schedule even when detach threw — a leaked cron
            // handle on a failed detach is exactly the shutdown gap D-14
            // closes (10-RESEARCH.md Pitfall 4).
            this.cronTask?.stop()
            this.cronTask = null
            this.started = false
        }
    }

    private async reconcileGuarded(): Promise<void> {
        try {
            await this.reconcile()
            this.healthReporter?.recordRun(this.name)
        } catch (err) {
            console.error(`[${this.name}] reconcile failed:`, err)
            this.healthReporter?.recordError(this.name, err)
        }
    }
}
