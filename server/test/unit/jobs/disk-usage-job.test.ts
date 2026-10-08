import path from "node:path"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {DiskUsageJob, KICKOFF_DELAY_MS} from "../../../src/jobs/disk-usage-job.js"

const NOW = new Date("2026-10-08T00:15:00Z")

function createStore(stackIds: string[]) {
    return {
        listStackIds: vi.fn().mockResolvedValue(stackIds),
        recordStackUsage: vi.fn().mockResolvedValue(undefined),
    }
}

function createScanner(volumesByDir: Record<string, string[] | null>, sizes: Record<string, number>) {
    return {
        listVolumeDirectories: vi.fn(async (dir: string) => volumesByDir[dir] ?? null),
        measureBytes: vi.fn(async (p: string) => sizes[p] ?? null),
    }
}

function buildJob(store: ReturnType<typeof createStore>, scanner: ReturnType<typeof createScanner>): DiskUsageJob {
    return new DiskUsageJob(store, scanner, (id) => path.join("stacks", id), () => NOW)
}

function runOf(job: DiskUsageJob): Promise<void> {
    return (job as unknown as {run(): Promise<void>}).run()
}

describe("DiskUsageJob (#27, D-13)", () => {
    it("measures each volume with its own call and records the per-volume rows plus their sum", async () => {
        const volumesDir = path.join("stacks", "a", "volumes")
        const store = createStore(["a"])
        const scanner = createScanner(
            {[volumesDir]: ["db", "uploads"]},
            {[path.join(volumesDir, "db")]: 1_048_576, [path.join(volumesDir, "uploads")]: 2048},
        )

        await runOf(buildJob(store, scanner))

        expect(scanner.measureBytes).toHaveBeenCalledTimes(2)
        expect(store.recordStackUsage).toHaveBeenCalledOnce()
        expect(store.recordStackUsage).toHaveBeenCalledWith({
            stackId: "a",
            volumes: [
                {name: "db", sizeBytes: 1_048_576},
                {name: "uploads", sizeBytes: 2048},
            ],
            volumeSizeBytes: 1_050_624,
            backupSizeBytes: null,
            measuredAt: NOW,
        })
    })

    it("records a stack without a volumes folder as measured: 0 bytes, no rows, nothing sized (Open Question 3)", async () => {
        const store = createStore(["b"])
        const scanner = createScanner({}, {})

        await runOf(buildJob(store, scanner))

        expect(scanner.measureBytes).not.toHaveBeenCalled()
        expect(store.recordStackUsage).toHaveBeenCalledOnce()
        expect(store.recordStackUsage).toHaveBeenCalledWith({
            stackId: "b",
            volumes: [],
            volumeSizeBytes: 0,
            backupSizeBytes: null,
            measuredAt: NOW,
        })
    })

    it("keeps the previous figures when a volume cannot be sized instead of recording a partial sum", async () => {
        const volumesDir = path.join("stacks", "a", "volumes")
        const store = createStore(["a"])
        const scanner = createScanner({[volumesDir]: ["db", "broken"]}, {[path.join(volumesDir, "db")]: 4096})

        await runOf(buildJob(store, scanner))

        expect(store.recordStackUsage).not.toHaveBeenCalled()
    })

    it("records one entry per stack, in order", async () => {
        const store = createStore(["a", "b"])
        const scanner = createScanner({}, {})

        await runOf(buildJob(store, scanner))

        expect(store.recordStackUsage.mock.calls.map(([input]) => input.stackId)).toEqual(["a", "b"])
    })

    describe("non-blocking kickoff (RESEARCH Finding 7)", () => {
        beforeEach(() => {
            vi.useFakeTimers()
        })

        afterEach(() => {
            vi.useRealTimers()
        })

        it("does not scan on start(), then scans once after the delay", async () => {
            const store = createStore(["a"])
            const scanner = createScanner({}, {})
            const job = buildJob(store, scanner)

            await job.start()
            expect(scanner.listVolumeDirectories).not.toHaveBeenCalled()
            expect(store.listStackIds).not.toHaveBeenCalled()

            await vi.advanceTimersByTimeAsync(KICKOFF_DELAY_MS)

            expect(store.recordStackUsage).toHaveBeenCalledOnce()
            job.stop()
        })

        it("never scans when stop() runs before the delay elapses", async () => {
            const store = createStore(["a"])
            const scanner = createScanner({}, {})
            const job = buildJob(store, scanner)

            await job.start()
            job.stop()
            await vi.advanceTimersByTimeAsync(KICKOFF_DELAY_MS * 2)

            expect(store.listStackIds).not.toHaveBeenCalled()
        })

        it("logs and swallows a failed initial scan", async () => {
            const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
            const store = createStore(["a"])
            store.listStackIds.mockRejectedValue(new Error("db down"))
            const job = buildJob(store, createScanner({}, {}))

            await expect(job.kickoff()).resolves.toBeUndefined()

            expect(errorSpy).toHaveBeenCalledWith("[DiskUsageJob] initial scan failed:", expect.any(Error))
            errorSpy.mockRestore()
        })
    })

    it("runs daily and never immediately on start", () => {
        const job = buildJob(createStore([]), createScanner({}, {})) as unknown as {
            cronExpression: string
            runImmediatelyOnStart: boolean
            name: string
        }

        expect(job.name).toBe("DiskUsageJob")
        expect(job.cronExpression).toBe("15 0 * * *")
        expect(job.runImmediatelyOnStart).toBe(false)
    })
})
