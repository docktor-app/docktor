import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {ImageUpdateCheckPruner} from "../../../src/jobs/image-update-check-pruner.js"

function createStore(overrides: {tracked?: string[]; deleted?: number} = {}) {
    return {
        findTrackedImageRefs: vi.fn().mockResolvedValue(overrides.tracked ?? []),
        deleteAllExcept: vi.fn().mockResolvedValue(overrides.deleted ?? 0),
    }
}

function runOf(job: ImageUpdateCheckPruner): Promise<void> {
    return (job as unknown as {run(): Promise<void>}).run()
}

describe("ImageUpdateCheckPruner (Issue #29/D-10)", () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined)
    })

    afterEach(() => {
        consoleLogSpy.mockRestore()
    })

    it("passes the tracked refs unchanged to deleteAllExcept, once, after reading them", async () => {
        const tracked = ["nginx:1.27", "redis:7"]
        const store = createStore({tracked})
        const job = new ImageUpdateCheckPruner(store)

        await runOf(job)

        expect(store.deleteAllExcept).toHaveBeenCalledOnce()
        expect(store.deleteAllExcept).toHaveBeenCalledWith(tracked)
        const readOrder = store.findTrackedImageRefs.mock.invocationCallOrder[0]
        const deleteOrder = store.deleteAllExcept.mock.invocationCallOrder[0]
        expect(readOrder).toBeLessThan(deleteOrder)
    })

    it("rejects and deletes nothing when reading the tracked set fails (an error is never an empty set)", async () => {
        const store = createStore()
        const failure = new Error("db unreachable")
        store.findTrackedImageRefs.mockRejectedValue(failure)
        const job = new ImageUpdateCheckPruner(store)

        await expect(runOf(job)).rejects.toBe(failure)

        expect(store.deleteAllExcept).not.toHaveBeenCalled()
    })

    it("calls deleteAllExcept with an empty set when no service exists (every row is an orphan)", async () => {
        const store = createStore({tracked: []})
        const job = new ImageUpdateCheckPruner(store)

        await runOf(job)

        expect(store.deleteAllExcept).toHaveBeenCalledOnce()
        expect(store.deleteAllExcept).toHaveBeenCalledWith([])
    })

    it("logs nothing when no row was pruned", async () => {
        const store = createStore({tracked: ["nginx:1.27"], deleted: 0})

        await runOf(new ImageUpdateCheckPruner(store))

        expect(consoleLogSpy).not.toHaveBeenCalled()
    })

    it("logs one line with the pruned count when rows were pruned", async () => {
        const store = createStore({tracked: ["nginx:1.27"], deleted: 3})

        await runOf(new ImageUpdateCheckPruner(store))

        expect(consoleLogSpy).toHaveBeenCalledOnce()
        expect(String(consoleLogSpy.mock.calls[0][0])).toContain("pruned 3")
    })

    it("has the expected name and runs the store once immediately on start()", async () => {
        const store = createStore({tracked: ["nginx:1.27"]})
        const job = new ImageUpdateCheckPruner(store)
        expect(job.name).toBe("ImageUpdateCheckPruner")

        await job.start()
        try {
            expect(store.findTrackedImageRefs).toHaveBeenCalledOnce()
            expect(store.deleteAllExcept).toHaveBeenCalledOnce()
        } finally {
            job.stop()
        }
    })
})
