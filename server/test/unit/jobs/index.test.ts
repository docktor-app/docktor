import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../../src/jobs/state-poller.js", () => ({
    statePoller: { name: "StatePoller", kind: "watcher", start: vi.fn(), stop: vi.fn(), setHealthReporter: vi.fn() },
}))
vi.mock("../../../src/jobs/file-watcher.js", () => ({
    fileWatcher: { name: "FileWatcher", kind: "watcher", start: vi.fn(), stop: vi.fn(), setHealthReporter: vi.fn() },
}))
vi.mock("../../../src/jobs/update-checker.js", () => ({
    updateChecker: { name: "UpdateChecker", kind: "interval", start: vi.fn(), stop: vi.fn(), setHealthReporter: vi.fn() },
}))
vi.mock("../../../src/jobs/disk-checker.js", () => ({
    diskChecker: { name: "DiskChecker", kind: "interval", start: vi.fn(), stop: vi.fn(), setHealthReporter: vi.fn() },
}))
vi.mock("../../../src/jobs/notification-watcher.js", () => ({
    notificationWatcher: { name: "NotificationWatcher", kind: "watcher", start: vi.fn(), stop: vi.fn(), setHealthReporter: vi.fn() },
}))
vi.mock("../../../src/jobs/backup-scheduler.js", () => ({
    backupScheduler: { name: "BackupScheduler", kind: "dynamic", start: vi.fn(), stop: vi.fn(), setHealthReporter: vi.fn() },
}))
vi.mock("../../../src/jobs/proxy-cert-poller.js", () => ({
    proxyCertPoller: { name: "ProxyCertPoller", kind: "interval", start: vi.fn(), stop: vi.fn(), setHealthReporter: vi.fn() },
}))
vi.mock("../../../src/application/index.js", () => ({
    backupService: { recoverInProgressBackups: vi.fn() },
}))

import { startJobs, stopJobs } from "../../../src/jobs/index.js"
import { statePoller } from "../../../src/jobs/state-poller.js"
import { fileWatcher } from "../../../src/jobs/file-watcher.js"
import { updateChecker } from "../../../src/jobs/update-checker.js"
import { diskChecker } from "../../../src/jobs/disk-checker.js"
import { notificationWatcher } from "../../../src/jobs/notification-watcher.js"
import { backupScheduler } from "../../../src/jobs/backup-scheduler.js"
import { proxyCertPoller } from "../../../src/jobs/proxy-cert-poller.js"
import { backupService } from "../../../src/application/index.js"

describe("startJobs", () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    })

    afterEach(() => {
        consoleErrorSpy.mockRestore()
    })

    it("starts every job when none fail", async () => {
        await startJobs()

        expect(backupService.recoverInProgressBackups).toHaveBeenCalledOnce()
        expect(statePoller.start).toHaveBeenCalledOnce()
        expect(fileWatcher.start).toHaveBeenCalledOnce()
        expect(updateChecker.start).toHaveBeenCalledOnce()
        expect(diskChecker.start).toHaveBeenCalledOnce()
        expect(notificationWatcher.start).toHaveBeenCalledOnce()
        expect(backupScheduler.start).toHaveBeenCalledOnce()
        expect(proxyCertPoller.start).toHaveBeenCalledOnce()
    })

    it("prints a started line naming all seven jobs, in registration order, on a successful boot (G-10-1)", async () => {
        const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined)

        await startJobs()

        const startedLines = consoleLog.mock.calls
            .map((call) => call[0])
            .filter((line): line is string => typeof line === "string" && line.startsWith("[JobRegistry] Started"))
        const startedNames = startedLines.map((line) => line.replace(/^\[JobRegistry\] Started (\S+) .*$/, "$1"))

        expect(startedNames).toEqual([
            "StatePoller",
            "FileWatcher",
            "UpdateChecker",
            "DiskChecker",
            "NotificationWatcher",
            "BackupScheduler",
            "ProxyCertPoller",
        ])

        consoleLog.mockRestore()
    })

    it("does not throw and still starts the remaining jobs when backup recovery fails (e.g. DB not ready yet on cold start)", async () => {
        vi.mocked(backupService.recoverInProgressBackups).mockRejectedValueOnce(
            new Error("ECONNREFUSED"),
        )

        await expect(startJobs()).resolves.toBeUndefined()

        expect(statePoller.start).toHaveBeenCalledOnce()
        expect(fileWatcher.start).toHaveBeenCalledOnce()
        expect(updateChecker.start).toHaveBeenCalledOnce()
        expect(diskChecker.start).toHaveBeenCalledOnce()
        expect(notificationWatcher.start).toHaveBeenCalledOnce()
        expect(backupScheduler.start).toHaveBeenCalledOnce()
        expect(proxyCertPoller.start).toHaveBeenCalledOnce()
        expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it("isolates a single job failure so every other job still starts", async () => {
        vi.mocked(fileWatcher.start).mockRejectedValueOnce(new Error("boom"))

        await expect(startJobs()).resolves.toBeUndefined()

        expect(backupService.recoverInProgressBackups).toHaveBeenCalledOnce()
        expect(statePoller.start).toHaveBeenCalledOnce()
        expect(updateChecker.start).toHaveBeenCalledOnce()
        expect(diskChecker.start).toHaveBeenCalledOnce()
        expect(notificationWatcher.start).toHaveBeenCalledOnce()
        expect(backupScheduler.start).toHaveBeenCalledOnce()
        expect(proxyCertPoller.start).toHaveBeenCalledOnce()
    })
})

describe("stopJobs", () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.clearAllMocks()
        consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    })

    afterEach(() => {
        consoleErrorSpy.mockRestore()
    })

    it("stops every job", async () => {
        await stopJobs()

        expect(statePoller.stop).toHaveBeenCalledOnce()
        expect(fileWatcher.stop).toHaveBeenCalledOnce()
        expect(updateChecker.stop).toHaveBeenCalledOnce()
        expect(diskChecker.stop).toHaveBeenCalledOnce()
        expect(notificationWatcher.stop).toHaveBeenCalledOnce()
        expect(backupScheduler.stop).toHaveBeenCalledOnce()
        expect(proxyCertPoller.stop).toHaveBeenCalledOnce()
    })

    it("isolates a single job's stop() failure so a later job's stop() still runs — closes the pre-10-07 shutdown-leak gap (10-RESEARCH.md Pitfall 4)", async () => {
        vi.mocked(fileWatcher.stop).mockRejectedValueOnce(new Error("stop boom"))

        await expect(stopJobs()).resolves.toBeUndefined()

        expect(fileWatcher.stop).toHaveBeenCalledOnce()
        // updateChecker is registered immediately after fileWatcher — proves
        // a throwing stop() does not abort the remaining stops.
        expect(updateChecker.stop).toHaveBeenCalledOnce()
        expect(diskChecker.stop).toHaveBeenCalledOnce()
        expect(notificationWatcher.stop).toHaveBeenCalledOnce()
        expect(backupScheduler.stop).toHaveBeenCalledOnce()
        expect(proxyCertPoller.stop).toHaveBeenCalledOnce()
        expect(consoleErrorSpy).toHaveBeenCalled()
    })
})
