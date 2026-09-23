import { beforeEach, describe, expect, it, vi } from "vitest"
import { JobRegistry } from "../../../src/jobs/job-registry.js"
import type { Job, JobHealthReporter, JobKind } from "../../../src/jobs/job.js"
import { ConflictError } from "../../../src/lib/errors.js"

function createMockJob(name: string, kind: JobKind = "interval") {
    return {
        name,
        kind,
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        setHealthReporter: vi.fn(),
    }
}

type MockJob = ReturnType<typeof createMockJob>

/** Extracts the reporter a mock job was handed by `register()`, so a test can call it back as the job itself would. */
function getReporter(job: MockJob): JobHealthReporter {
    const reporter = job.setHealthReporter.mock.calls[0]?.[0] as JobHealthReporter | undefined
    if (!reporter) throw new Error("job.setHealthReporter was never called")
    return reporter
}

describe("JobRegistry", () => {
    let registry: JobRegistry

    beforeEach(() => {
        registry = new JobRegistry()
    })

    describe("register", () => {
        it("rejects a duplicate job name with the typed conflict error from lib/errors.ts", () => {
            const jobA = createMockJob("Job")
            const jobB = createMockJob("Job")
            registry.register(jobA as unknown as Job)

            expect(() => registry.register(jobB as unknown as Job)).toThrow(ConflictError)
        })

        it("gives the job a health reporter, so an unregistered job never writes into the registry", () => {
            const job = createMockJob("A")
            registry.register(job as unknown as Job)

            expect(job.setHealthReporter).toHaveBeenCalledTimes(1)
            expect(job.setHealthReporter).toHaveBeenCalledWith(registry)
        })
    })

    describe("startAll", () => {
        it("starts every registered job, in registration order", async () => {
            const order: string[] = []
            const jobA = createMockJob("A")
            const jobB = createMockJob("B")
            jobA.start.mockImplementation(async () => {
                order.push("A")
            })
            jobB.start.mockImplementation(async () => {
                order.push("B")
            })
            registry.register(jobA as unknown as Job)
            registry.register(jobB as unknown as Job)

            await registry.startAll()

            expect(order).toEqual(["A", "B"])
        })

        it("logs and records a failed start, and every subsequent job still starts, when a job's start() throws synchronously", async () => {
            const jobA = createMockJob("A")
            const jobB = createMockJob("B")
            jobA.start.mockImplementation(() => {
                throw new Error("boom")
            })
            registry.register(jobA as unknown as Job)
            registry.register(jobB as unknown as Job)
            const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)

            await registry.startAll()

            expect(jobB.start).toHaveBeenCalledTimes(1)
            expect(consoleError).toHaveBeenCalled()
            const healthA = registry.health().find((h) => h.name === "A")
            expect(healthA?.status).toBe("failed-to-start")
            expect(healthA?.lastError).toBe("boom")

            consoleError.mockRestore()
        })

        it("handles an asynchronously rejecting start() identically to a synchronous throw", async () => {
            const jobA = createMockJob("A")
            const jobB = createMockJob("B")
            jobA.start.mockRejectedValueOnce(new Error("async boom"))
            registry.register(jobA as unknown as Job)
            registry.register(jobB as unknown as Job)
            const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)

            await registry.startAll()

            expect(jobB.start).toHaveBeenCalledTimes(1)
            const healthA = registry.health().find((h) => h.name === "A")
            expect(healthA?.status).toBe("failed-to-start")
            expect(healthA?.lastError).toBe("async boom")

            consoleError.mockRestore()
        })

        it("records each job's health as running with a start timestamp after a successful startAll()", async () => {
            const job = createMockJob("A")
            registry.register(job as unknown as Job)

            await registry.startAll()

            const health = registry.health().find((h) => h.name === "A")
            expect(health?.status).toBe("running")
            expect(health?.lastStartedAt).not.toBeNull()
        })
    })

    describe("stopAll", () => {
        it("stops every registered job even when an earlier job's stop() throws synchronously", async () => {
            const jobA = createMockJob("A")
            const jobB = createMockJob("B")
            jobA.stop.mockImplementation(() => {
                throw new Error("stop boom")
            })
            registry.register(jobA as unknown as Job)
            registry.register(jobB as unknown as Job)
            const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)

            await registry.stopAll()

            expect(jobB.stop).toHaveBeenCalledTimes(1)

            consoleError.mockRestore()
        })

        it("stops every registered job even when an earlier job's stop() rejects asynchronously", async () => {
            const jobA = createMockJob("A")
            const jobB = createMockJob("B")
            jobA.stop.mockRejectedValueOnce(new Error("stop boom"))
            registry.register(jobA as unknown as Job)
            registry.register(jobB as unknown as Job)
            const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)

            await registry.stopAll()

            expect(jobB.stop).toHaveBeenCalledTimes(1)

            consoleError.mockRestore()
        })

        it("records each job's health as stopped after stopAll()", async () => {
            const job = createMockJob("A")
            registry.register(job as unknown as Job)
            await registry.startAll()

            await registry.stopAll()

            const health = registry.health().find((h) => h.name === "A")
            expect(health?.status).toBe("stopped")
        })
    })

    describe("health reporting", () => {
        it("advances the last-run timestamp and leaves the last error untouched when a job reports a run", () => {
            const job = createMockJob("A")
            registry.register(job as unknown as Job)
            const reporter = getReporter(job)

            reporter.recordRun("A")

            const health = registry.health().find((h) => h.name === "A")
            expect(health?.lastRunAt).not.toBeNull()
            expect(health?.lastError).toBeNull()
        })

        it("records the last error and its timestamp while leaving status running when a job reports an error", async () => {
            const job = createMockJob("A")
            registry.register(job as unknown as Job)
            await registry.startAll()
            const reporter = getReporter(job)

            reporter.recordError("A", new Error("tick failed"))

            const health = registry.health().find((h) => h.name === "A")
            expect(health?.lastError).toBe("tick failed")
            expect(health?.lastErrorAt).not.toBeNull()
            expect(health?.status).toBe("running")
        })
    })

    describe("health", () => {
        it("returns a snapshot the caller cannot mutate into the registry's own state", () => {
            const job = createMockJob("A")
            registry.register(job as unknown as Job)

            const snapshot = registry.health()
            const mutable = snapshot[0] as {status: string}
            mutable.status = "running"

            const secondRead = registry.health()
            expect(secondRead[0]?.status).toBe("stopped")
        })
    })
})
