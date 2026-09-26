import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("node-cron", () => ({
    default: {
        schedule: vi.fn(),
    },
}))

import cron from "node-cron"
import { IntervalJob, WatcherJob } from "../../../src/jobs/job.js"
import type { JobHealthReporter } from "../../../src/jobs/job.js"

const mockSchedule = vi.mocked(cron.schedule)

function createMockCronTask() {
    return {
        stop: vi.fn(),
        start: vi.fn(),
    }
}

function createMockReporter(): JobHealthReporter {
    return {
        recordRun: vi.fn(),
        recordError: vi.fn(),
    }
}

// ─── Synthetic IntervalJob subclass ────────────────────────────────────────

class TestIntervalJob extends IntervalJob {
    readonly name = "TestInterval"
    protected readonly cronExpression = "*/5 * * * *"
    protected readonly runImmediatelyOnStart: boolean
    readonly runBody = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)

    constructor(runImmediatelyOnStart = false) {
        super()
        this.runImmediatelyOnStart = runImmediatelyOnStart
    }

    protected async run(): Promise<void> {
        await this.runBody()
    }
}

// ─── Synthetic WatcherJob subclass ─────────────────────────────────────────

class TestWatcherJob extends WatcherJob {
    readonly name = "TestWatcher"
    protected readonly reconcileCronExpression: string | null
    readonly attachFn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    readonly detachFn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    readonly reconcileFn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)

    constructor(reconcileCronExpression: string | null = "*/60 * * * * *") {
        super()
        this.reconcileCronExpression = reconcileCronExpression
    }

    protected async attach(): Promise<void> {
        await this.attachFn()
    }

    protected async detach(): Promise<void> {
        await this.detachFn()
    }

    protected async reconcile(): Promise<void> {
        await this.reconcileFn()
    }
}

describe("IntervalJob", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockSchedule.mockReturnValue(createMockCronTask() as any)
    })

    it("schedules its run body on the declared cron expression", async () => {
        const job = new TestIntervalJob()
        await job.start()

        expect(mockSchedule).toHaveBeenCalledWith("*/5 * * * *", expect.any(Function))
    })

    it("invokes the run body once during start() when declaring immediate-run-on-start", async () => {
        const job = new TestIntervalJob(true)
        await job.start()

        expect(job.runBody).toHaveBeenCalledTimes(1)
        // The immediate run happens before scheduling.
        expect(mockSchedule).toHaveBeenCalledTimes(1)
    })

    it("does not invoke the run body during start() when not declaring immediate-run-on-start", async () => {
        const job = new TestIntervalJob(false)
        await job.start()

        expect(job.runBody).not.toHaveBeenCalled()
    })

    it("catches a throwing run body, reports it to the health reporter, and does not propagate out of the scheduled callback", async () => {
        const job = new TestIntervalJob()
        const reporter = createMockReporter()
        job.setHealthReporter(reporter)
        const error = new Error("boom")
        job.runBody.mockRejectedValueOnce(error)

        await job.start()
        const scheduledCallback = mockSchedule.mock.calls[0]?.[1] as (now: Date | "manual" | "init") => void

        await expect(Promise.resolve(scheduledCallback(new Date()))).resolves.toBeUndefined()
        // runGuarded is fire-and-forget from inside the callback; flush microtasks.
        await Promise.resolve()
        await Promise.resolve()

        expect(reporter.recordError).toHaveBeenCalledWith("TestInterval", error)
        expect(reporter.recordRun).not.toHaveBeenCalled()
    })

    it("reports a successful run to the health reporter with no error", async () => {
        const job = new TestIntervalJob()
        const reporter = createMockReporter()
        job.setHealthReporter(reporter)

        await job.start()
        const scheduledCallback = mockSchedule.mock.calls[0]?.[1] as (now: Date | "manual" | "init") => void
        scheduledCallback(new Date())
        await Promise.resolve()
        await Promise.resolve()

        expect(reporter.recordRun).toHaveBeenCalledWith("TestInterval")
        expect(reporter.recordError).not.toHaveBeenCalled()
    })

    it("cancels the schedule and clears the handle on stop()", async () => {
        const task = createMockCronTask()
        mockSchedule.mockReturnValue(task as any)
        const job = new TestIntervalJob()
        await job.start()

        job.stop()

        expect(task.stop).toHaveBeenCalledTimes(1)
    })

    it("does not leave a leaked, uncancellable schedule when start() is called twice", async () => {
        const job = new TestIntervalJob()
        await job.start()
        await job.start()

        expect(mockSchedule).toHaveBeenCalledTimes(1)
    })

    it("is a no-op and does not throw when stop() is called on a job that was never started", () => {
        const job = new TestIntervalJob()

        expect(() => job.stop()).not.toThrow()
    })
})

describe("WatcherJob", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockSchedule.mockReturnValue(createMockCronTask() as any)
    })

    it("attaches its event source first and then schedules the reconcile tick", async () => {
        const job = new TestWatcherJob()
        const callOrder: string[] = []
        job.attachFn.mockImplementation(async () => {
            callOrder.push("attach")
        })
        mockSchedule.mockImplementation(() => {
            callOrder.push("schedule")
            return createMockCronTask() as any
        })

        await job.start()

        expect(callOrder).toEqual(["attach", "schedule"])
    })

    it("attaches and schedules nothing when the reconcile schedule is null — no cron handle is created", async () => {
        const job = new TestWatcherJob(null)
        await job.start()

        expect(job.attachFn).toHaveBeenCalledTimes(1)
        expect(mockSchedule).not.toHaveBeenCalled()
    })

    it("detaches the event source and cancels the reconcile schedule on stop(), even when detaching throws", async () => {
        const task = createMockCronTask()
        mockSchedule.mockReturnValue(task as any)
        const job = new TestWatcherJob()
        job.detachFn.mockRejectedValueOnce(new Error("detach boom"))
        await job.start()

        await expect(job.stop()).resolves.toBeUndefined()

        expect(job.detachFn).toHaveBeenCalledTimes(1)
        expect(task.stop).toHaveBeenCalledTimes(1)
    })

    it("is a no-op and does not throw when stop() is called on a job that was never started", async () => {
        const job = new TestWatcherJob()

        await expect(job.stop()).resolves.toBeUndefined()
        expect(job.detachFn).not.toHaveBeenCalled()
    })

    it("does not leave a leaked, uncancellable schedule when start() is called twice", async () => {
        const job = new TestWatcherJob()
        await job.start()
        await job.start()

        expect(job.attachFn).toHaveBeenCalledTimes(1)
        expect(mockSchedule).toHaveBeenCalledTimes(1)
    })

    it("catches a throwing reconcile body and reports it to the health reporter", async () => {
        const job = new TestWatcherJob()
        const reporter = createMockReporter()
        job.setHealthReporter(reporter)
        const error = new Error("reconcile boom")
        job.reconcileFn.mockRejectedValueOnce(error)

        await job.start()
        const scheduledCallback = mockSchedule.mock.calls[0]?.[1] as (now: Date | "manual" | "init") => void
        scheduledCallback(new Date())
        await Promise.resolve()
        await Promise.resolve()

        expect(reporter.recordError).toHaveBeenCalledWith("TestWatcher", error)
        expect(reporter.recordRun).not.toHaveBeenCalled()
    })
})
