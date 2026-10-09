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

function createScanner(
    volumesByDir: Record<string, string[] | null>,
    sizes: Record<string, number>,
    realDirectories: string[] = [],
) {
    return {
        listVolumeDirectories: vi.fn(async (dir: string) => volumesByDir[dir] ?? null),
        measureBytes: vi.fn(async (p: string) => sizes[p] ?? null),
        // A listed volumes folder exists as a real directory (fixture fidelity).
        isRealDirectory: vi.fn(async (p: string) => realDirectories.includes(p) || volumesByDir[p] != null),
    }
}

function createReporter() {
    return {recordRun: vi.fn(), recordError: vi.fn()}
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

    describe("local backups (D-14 amended, Pitfall 9)", () => {
        it("measures a real <stack>/backups directory into backupSizeBytes", async () => {
            const backupsDir = path.join("stacks", "a", "backups")
            const store = createStore(["a"])
            const scanner = createScanner({}, {[backupsDir]: 4096}, [backupsDir])

            await runOf(buildJob(store, scanner))

            expect(scanner.measureBytes).toHaveBeenCalledWith(backupsDir)
            expect(store.recordStackUsage).toHaveBeenCalledWith(expect.objectContaining({stackId: "a", backupSizeBytes: 4096}))
        })

        it("leaves backupSizeBytes null and never sizes a symlinked or missing backups path", async () => {
            const backupsDir = path.join("stacks", "a", "backups")
            const store = createStore(["a"])
            const scanner = createScanner({}, {[backupsDir]: 4096}, [])

            await runOf(buildJob(store, scanner))

            expect(scanner.isRealDirectory).toHaveBeenCalledWith(backupsDir)
            expect(scanner.measureBytes).not.toHaveBeenCalledWith(backupsDir)
            expect(store.recordStackUsage).toHaveBeenCalledWith(expect.objectContaining({stackId: "a", backupSizeBytes: null}))
        })

        it("keeps the previous figures when a real backups directory cannot be sized", async () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
            const store = createStore(["a"])
            const scanner = createScanner({}, {}, [path.join("stacks", "a", "backups")])

            await runOf(buildJob(store, scanner))

            expect(store.recordStackUsage).not.toHaveBeenCalled()
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('"a"'))
            warn.mockRestore()
        })
    })

    describe("symlinked volumes folder (Pitfall 9, WR-03, T-14-66)", () => {
        it("never lists or sizes a volumes path that is not a real directory, and records 0 bytes with backups still measured", async () => {
            const volumesDir = path.join("stacks", "a", "volumes")
            const backupsDir = path.join("stacks", "a", "backups")
            const store = createStore(["a"])
            const scanner = createScanner(
                {[volumesDir]: ["outside-secret"]},
                {[path.join(volumesDir, "outside-secret")]: 999, [backupsDir]: 4096},
                [backupsDir],
            )
            scanner.isRealDirectory.mockImplementation(async (p: string) => p === backupsDir)

            await runOf(buildJob(store, scanner))

            expect(scanner.isRealDirectory).toHaveBeenCalledWith(volumesDir)
            expect(scanner.listVolumeDirectories).not.toHaveBeenCalled()
            expect(scanner.measureBytes).not.toHaveBeenCalledWith(path.join(volumesDir, "outside-secret"))
            expect(store.recordStackUsage).toHaveBeenCalledWith({
                stackId: "a",
                volumes: [],
                volumeSizeBytes: 0,
                backupSizeBytes: 4096,
                measuredAt: NOW,
            })
        })
    })

    describe("in-flight guard (WR-09, T-14-68)", () => {
        it("skips a second run while a scan is in flight, logs it, and scans again once the first finished", async () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
            const log = vi.spyOn(console, "log").mockImplementation(() => undefined)
            let release: (ids: string[]) => void = () => undefined
            const pending = new Promise<string[]>((resolve) => {
                release = resolve
            })
            const store = createStore(["a"])
            store.listStackIds.mockReturnValueOnce(pending)
            const job = buildJob(store, createScanner({}, {}))

            const first = runOf(job)
            await expect(runOf(job)).resolves.toBeUndefined()

            expect(store.listStackIds).toHaveBeenCalledOnce()
            expect(warn).toHaveBeenCalledWith(expect.stringContaining("already running"))

            release(["a"])
            await first
            await runOf(job)

            expect(store.listStackIds).toHaveBeenCalledTimes(2)
            warn.mockRestore()
            log.mockRestore()
        })

        it("clears the in-flight flag when a scan rejects, so the next run still scans", async () => {
            const store = createStore(["a"])
            store.listStackIds.mockRejectedValueOnce(new Error("db down"))
            const job = buildJob(store, createScanner({}, {}))

            await expect(runOf(job)).rejects.toThrow("db down")
            await runOf(job)

            expect(store.listStackIds).toHaveBeenCalledTimes(2)
        })
    })

    describe("per-stack isolation and skipping (Pitfalls 8/9, T-14-55, T-14-56)", () => {
        it("skips a stack whose volume cannot be sized, warns with its id, and still records the next stack", async () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
            const volumesA = path.join("stacks", "a", "volumes")
            const store = createStore(["a", "b"])
            const scanner = createScanner({[volumesA]: ["broken"]}, {})

            await runOf(buildJob(store, scanner))

            expect(store.recordStackUsage).toHaveBeenCalledOnce()
            expect(store.recordStackUsage).toHaveBeenCalledWith(expect.objectContaining({stackId: "b"}))
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('"a"'))
            warn.mockRestore()
        })

        it("logs and continues when recording one stack rejects, and run() still resolves", async () => {
            const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
            const store = createStore(["a", "b"])
            store.recordStackUsage.mockImplementation(async (input: {stackId: string}) => {
                if (input.stackId === "a") throw new Error("stack deleted mid-scan")
            })

            await expect(runOf(buildJob(store, createScanner({}, {})))).resolves.toBeUndefined()

            expect(store.recordStackUsage).toHaveBeenCalledTimes(2)
            expect(error).toHaveBeenCalledWith(expect.stringContaining('"a"'), expect.any(Error))
            error.mockRestore()
        })

        it("logs and skips a stack whose path fails the escape check, then records the rest", async () => {
            const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
            const store = createStore(["../evil", "b"])
            const resolve = (id: string): string => {
                if (id.includes("..")) throw new Error("escapes stacks dir")
                return path.join("stacks", id)
            }
            const job = new DiskUsageJob(store, createScanner({}, {}), resolve, () => NOW)

            await runOf(job)

            expect(store.recordStackUsage.mock.calls.map(([input]) => input.stackId)).toEqual(["b"])
            expect(error).toHaveBeenCalledWith(expect.stringContaining("../evil"), expect.any(Error))
            error.mockRestore()
        })

        it("ends the run with one summary line counting the recorded stacks", async () => {
            const log = vi.spyOn(console, "log").mockImplementation(() => undefined)
            const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
            const volumesC = path.join("stacks", "c", "volumes")
            const store = createStore(["a", "b", "c"])
            const scanner = createScanner({[volumesC]: ["broken"]}, {})

            await runOf(buildJob(store, scanner))

            const summaries = log.mock.calls.filter(([line]) => String(line).startsWith("[DiskUsageJob] measured"))
            expect(summaries).toEqual([["[DiskUsageJob] measured 2 stack(s)"]])
            log.mockRestore()
            warn.mockRestore()
        })
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

        it("logs and swallows a failed initial scan, reporting it like a scheduled run (WR-09)", async () => {
            const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
            const store = createStore(["a"])
            const failure = new Error("db down")
            store.listStackIds.mockRejectedValue(failure)
            const reporter = createReporter()
            const job = buildJob(store, createScanner({}, {}))
            job.setHealthReporter(reporter)

            await expect(job.kickoff()).resolves.toBeUndefined()

            expect(errorSpy).toHaveBeenCalledWith("[DiskUsageJob] run failed:", failure)
            expect(reporter.recordError).toHaveBeenCalledWith("DiskUsageJob", failure)
            expect(reporter.recordRun).not.toHaveBeenCalled()
            errorSpy.mockRestore()
        })

        it("records a successful kickoff scan on the job health reporter (WR-09)", async () => {
            const log = vi.spyOn(console, "log").mockImplementation(() => undefined)
            const reporter = createReporter()
            const job = buildJob(createStore(["a"]), createScanner({}, {}))
            job.setHealthReporter(reporter)

            await job.kickoff()

            expect(reporter.recordRun).toHaveBeenCalledWith("DiskUsageJob")
            expect(reporter.recordError).not.toHaveBeenCalled()
            log.mockRestore()
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
