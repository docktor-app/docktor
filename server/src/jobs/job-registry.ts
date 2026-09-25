import {ConflictError} from "../lib/errors.js"
import type {Job, JobHealthReporter, JobKind} from "./job.js"

export type JobStatus = "stopped" | "running" | "failed-to-start"

/** A read-only snapshot of one job's health. Nullable fields are unset until observed. */
export interface JobHealth {
    readonly name: string
    readonly kind: JobKind
    readonly status: JobStatus
    readonly lastStartedAt: string | null
    readonly lastRunAt: string | null
    readonly lastError: string | null
    readonly lastErrorAt: string | null
}

/** Mutable internal counterpart of `JobHealth` — never handed out directly, only copied. */
interface JobHealthEntry {
    name: string
    kind: JobKind
    status: JobStatus
    lastStartedAt: string | null
    lastRunAt: string | null
    lastError: string | null
    lastErrorAt: string | null
}

function toMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

/**
 * Starts, stops and health-tracks every registered job with per-job
 * failure isolation on both sides of the lifecycle (D-14). This is
 * internal state only — no route, SSE event or settings key reads it in
 * this phase; Phase 14 is where a health surface, if any, would be built.
 */
export class JobRegistry implements JobHealthReporter {
    private readonly jobs = new Map<string, Job>()
    private readonly entries = new Map<string, JobHealthEntry>()

    register(job: Job): void {
        if (this.jobs.has(job.name)) {
            throw new ConflictError(`Job "${job.name}" is already registered`)
        }

        this.jobs.set(job.name, job)
        this.entries.set(job.name, {
            name: job.name,
            kind: job.kind,
            status: "stopped",
            lastStartedAt: null,
            lastRunAt: null,
            lastError: null,
            lastErrorAt: null,
        })
        job.setHealthReporter(this)
    }

    /**
     * Starts every registered job sequentially, in registration order, each
     * inside its own try/catch. Preserves the cold-start contract a
     * docker-compose start depends on: jobs start one at a time and one
     * failure never blocks another job or the HTTP server. Each successful
     * start is logged by name, so the startup log lists every running job
     * in registration order (G-10-1).
     */
    async startAll(): Promise<void> {
        for (const job of this.jobs.values()) {
            try {
                await job.start()
                this.markRunning(job.name)
                console.log(`[JobRegistry] Started ${job.name} (${job.kind})`)
            } catch (err) {
                console.error(`[JobRegistry] ${job.name} failed to start:`, err)
                this.markFailedToStart(job.name, err)
            }
        }
    }

    /**
     * Stops every registered job sequentially, each inside its own
     * try/catch — the same isolation `startAll()` gets, closing the gap
     * where a throwing `stop()` used to abort the remaining stops and
     * could leak a running cron task or event stream (10-RESEARCH.md
     * Pitfall 4).
     */
    async stopAll(): Promise<void> {
        for (const job of this.jobs.values()) {
            try {
                await job.stop()
            } catch (err) {
                console.error(`[JobRegistry] ${job.name} failed to stop:`, err)
            } finally {
                this.markStopped(job.name)
            }
        }
    }

    recordRun(jobName: string): void {
        const entry = this.entries.get(jobName)
        if (!entry) return
        entry.lastRunAt = new Date().toISOString()
    }

    recordError(jobName: string, error: unknown): void {
        const entry = this.entries.get(jobName)
        if (!entry) return
        // Store the message only — never the error object, its `cause`
        // chain, or any config/env object a job was operating on (T-10-11).
        entry.lastError = toMessage(error)
        entry.lastErrorAt = new Date().toISOString()
    }

    /** Returns a snapshot of every job's health. Mutating the result never changes the registry's own state. */
    health(): JobHealth[] {
        return Array.from(this.entries.values()).map((entry) => ({...entry}))
    }

    private markRunning(name: string): void {
        const entry = this.entries.get(name)
        if (!entry) return
        entry.status = "running"
        entry.lastStartedAt = new Date().toISOString()
    }

    private markFailedToStart(name: string, error: unknown): void {
        const entry = this.entries.get(name)
        if (!entry) return
        entry.status = "failed-to-start"
        entry.lastError = toMessage(error)
        entry.lastErrorAt = new Date().toISOString()
    }

    private markStopped(name: string): void {
        const entry = this.entries.get(name)
        if (!entry) return
        entry.status = "stopped"
    }
}

export const jobRegistry = new JobRegistry()
