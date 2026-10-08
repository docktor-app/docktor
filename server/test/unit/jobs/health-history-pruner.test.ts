import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {HealthHistoryPruner} from "../../../src/jobs/health-history-pruner.js"

const DAY = 86_400_000
const NOW = new Date("2026-10-08T12:00:00.000Z")

function createStore(overrides: {retentionDays?: number; events?: number; incidents?: number} = {}) {
    return {
        getRetentionDays: vi.fn().mockResolvedValue(overrides.retentionDays ?? 7),
        deleteHealthEventsBefore: vi.fn().mockResolvedValue(overrides.events ?? 0),
        deleteResolvedIncidentsBefore: vi.fn().mockResolvedValue(overrides.incidents ?? 0),
    }
}

function runOf(job: HealthHistoryPruner): Promise<void> {
    return (job as unknown as {run(): Promise<void>}).run()
}

describe("HealthHistoryPruner (#24, D-10)", () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined)
    })

    afterEach(() => {
        consoleLogSpy.mockRestore()
    })

    it("deletes health events and resolved incidents older than the retention window, once each", async () => {
        const store = createStore({retentionDays: 7})

        await runOf(new HealthHistoryPruner(store, () => NOW))

        const cutoff = new Date(NOW.getTime() - 7 * DAY)
        expect(store.deleteHealthEventsBefore).toHaveBeenCalledTimes(1)
        expect(store.deleteHealthEventsBefore).toHaveBeenCalledWith(cutoff)
        expect(store.deleteResolvedIncidentsBefore).toHaveBeenCalledTimes(1)
        expect(store.deleteResolvedIncidentsBefore).toHaveBeenCalledWith(cutoff)
    })

    it("uses the configured retention for the cutoff", async () => {
        const store = createStore({retentionDays: 90})

        await runOf(new HealthHistoryPruner(store, () => NOW))

        expect(store.deleteHealthEventsBefore).toHaveBeenCalledWith(new Date(NOW.getTime() - 90 * DAY))
    })

    it("logs one line with both counts when rows were pruned", async () => {
        const store = createStore({events: 3, incidents: 1})

        await runOf(new HealthHistoryPruner(store, () => NOW))

        expect(consoleLogSpy).toHaveBeenCalledTimes(1)
        const [line] = consoleLogSpy.mock.calls[0] ?? []
        expect(line).toContain("[HealthHistoryPruner]")
        expect(line).toContain("3")
        expect(line).toContain("1")
    })

    it("logs when only one table had rows to prune", async () => {
        await runOf(new HealthHistoryPruner(createStore({events: 0, incidents: 2}), () => NOW))

        expect(consoleLogSpy).toHaveBeenCalledTimes(1)
    })

    it("logs nothing when no row was pruned", async () => {
        await runOf(new HealthHistoryPruner(createStore({events: 0, incidents: 0}), () => NOW))

        expect(consoleLogSpy).not.toHaveBeenCalled()
    })

    it("rejects and deletes nothing when reading the retention window fails", async () => {
        const store = createStore()
        const failure = new Error("settings unreachable")
        store.getRetentionDays.mockRejectedValue(failure)

        await expect(runOf(new HealthHistoryPruner(store, () => NOW))).rejects.toBe(failure)

        expect(store.deleteHealthEventsBefore).not.toHaveBeenCalled()
        expect(store.deleteResolvedIncidentsBefore).not.toHaveBeenCalled()
    })

    it("is a daily job that also runs once on start", () => {
        const job = new HealthHistoryPruner(createStore(), () => NOW) as unknown as {
            name: string
            cronExpression: string
            runImmediatelyOnStart: boolean
        }

        expect(job.name).toBe("HealthHistoryPruner")
        expect(job.cronExpression).toBe("30 0 * * *")
        expect(job.runImmediatelyOnStart).toBe(true)
    })
})
