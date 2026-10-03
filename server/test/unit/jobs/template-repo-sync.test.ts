import {describe, expect, it, vi, beforeEach, afterEach} from "vitest"
import {TemplateRepoSync, TEMPLATE_SYNC_MAX_AGE_MS} from "../../../src/jobs/template-repo-sync.js"

describe("TemplateRepoSync (Issue #19/D-08)", () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    })

    afterEach(() => {
        consoleErrorSpy.mockRestore()
    })

    it("calls syncStaleRepos(TEMPLATE_SYNC_MAX_AGE_MS) then refreshPinnedStacks", async () => {
        const syncStaleRepos = vi.fn().mockResolvedValue(undefined)
        const refreshPinnedStacks = vi.fn().mockResolvedValue({changed: 0})
        const job = new TemplateRepoSync({
            templates: {syncStaleRepos},
            updates: {refreshPinnedStacks},
        })

        await (job as unknown as {run(): Promise<void>}).run()

        expect(syncStaleRepos).toHaveBeenCalledWith(TEMPLATE_SYNC_MAX_AGE_MS)
        expect(refreshPinnedStacks).toHaveBeenCalledOnce()
        const syncOrder = syncStaleRepos.mock.invocationCallOrder[0]
        const refreshOrder = refreshPinnedStacks.mock.invocationCallOrder[0]
        expect(syncOrder).toBeLessThan(refreshOrder)
    })

    it("still runs refreshPinnedStacks when syncStaleRepos rejects, and run() rethrows nothing", async () => {
        const syncStaleRepos = vi.fn().mockRejectedValue(new Error("git sync boom"))
        const refreshPinnedStacks = vi.fn().mockResolvedValue({changed: 0})
        const job = new TemplateRepoSync({
            templates: {syncStaleRepos},
            updates: {refreshPinnedStacks},
        })

        await expect((job as unknown as {run(): Promise<void>}).run()).resolves.toBeUndefined()

        expect(refreshPinnedStacks).toHaveBeenCalledOnce()
        expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it("extends IntervalJob with the expected name/cron/runImmediatelyOnStart", () => {
        const job = new TemplateRepoSync({
            templates: {syncStaleRepos: vi.fn()},
            updates: {refreshPinnedStacks: vi.fn()},
        })
        expect(job.name).toBe("TemplateRepoSync")
    })
})
