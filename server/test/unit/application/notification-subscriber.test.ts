import {beforeEach, describe, expect, it, vi} from "vitest"
import {InMemoryEventBus} from "../../../src/infrastructure/event-bus.js"
import {subscribeNotifications} from "../../../src/application/subscribers/notification-subscriber.js"

function createMockNotificationService() {
    return {
        notify: vi.fn().mockResolvedValue(undefined),
    }
}

describe("subscribeNotifications", () => {
    let bus: InMemoryEventBus
    let notificationService: ReturnType<typeof createMockNotificationService>

    beforeEach(() => {
        bus = new InMemoryEventBus()
        notificationService = createMockNotificationService()
    })

    it("composes a backup.failed event with a repo type into the exact backup-failure template", () => {
        subscribeNotifications(bus, notificationService)

        bus.emit("backup.failed", {
            stackId: "my-app",
            displayName: "My App",
            repoType: "local",
            errorMessage: "restic failed",
        })

        expect(notificationService.notify).toHaveBeenCalledWith({
            type: "backup_failure",
            stackId: "my-app",
            subject: "Backup failed: My App",
            message: `Backup failed for stack "My App" (repo: local). Error: restic failed`,
        })
    })

    it("composes a backup.failed event with no repo type (abortBackup) omitting the repo clause, falling back to the stack id when displayName is absent", () => {
        subscribeNotifications(bus, notificationService)

        bus.emit("backup.failed", {
            stackId: "my-app",
            errorMessage: "boom",
        })

        expect(notificationService.notify).toHaveBeenCalledWith({
            type: "backup_failure",
            stackId: "my-app",
            subject: "Backup failed: my-app",
            message: `Backup failed for stack "my-app". Error: boom`,
        })
    })

    it("composes a restore.started event into the exact restore-started template, reusing the backup_failure type value", () => {
        subscribeNotifications(bus, notificationService)

        bus.emit("restore.started", {
            stackId: "my-app",
            displayName: "My App",
            snapshotId: "abc123def456",
        })

        expect(notificationService.notify).toHaveBeenCalledWith({
            type: "backup_failure",
            stackId: "my-app",
            subject: "Restore started: My App",
            message: `Restore started for stack "My App" from snapshot abc123def456`,
        })
    })

    it("composes a restore.completed event into the exact restore-completed template, reusing the backup_failure type value", () => {
        subscribeNotifications(bus, notificationService)

        bus.emit("restore.completed", {
            stackId: "my-app",
            displayName: "My App",
            snapshotId: "abc123def456",
        })

        expect(notificationService.notify).toHaveBeenCalledWith({
            type: "backup_failure",
            stackId: "my-app",
            subject: "Restore completed: My App",
            message: `Restore completed successfully for stack "My App" from snapshot abc123def456`,
        })
    })

    it("composes a restore.failed event into the exact restore-failed template, reusing the backup_failure type value", () => {
        subscribeNotifications(bus, notificationService)

        bus.emit("restore.failed", {
            stackId: "my-app",
            displayName: "My App",
            snapshotId: "abc123def456",
            errorMessage: "restore: corrupted data",
        })

        expect(notificationService.notify).toHaveBeenCalledWith({
            type: "backup_failure",
            stackId: "my-app",
            subject: "Restore failed: My App",
            message: `Restore failed for stack "My App". Snapshot: abc123def456. Error: restore: corrupted data`,
        })
    })

    it("composes a disk.threshold_crossed event into the exact multi-line disk-warning template, with no stack id", () => {
        subscribeNotifications(bus, notificationService)

        bus.emit("disk.threshold_crossed", {
            monitorPath: "/var/lib/docker",
            freeBytes: 1n * 1024n * 1024n * 1024n,
            totalBytes: 100n * 1024n * 1024n * 1024n,
            freePercent: 1,
            thresholdDescription: "below 10%",
        })

        expect(notificationService.notify).toHaveBeenCalledWith({
            type: "disk_warning",
            subject: "Disk space warning",
            message: [
                `Disk space warning on /var/lib/docker`,
                ``,
                `Free space: 1024 MB (1%) of 102400 MB total`,
                `Threshold crossed: below 10%`,
                ``,
                `This notification will not repeat until disk space recovers above the threshold.`,
            ].join("\n"),
        })
    })

    it("passes an absent stack identifier through unchanged — the disk event's composed notification carries no stackId key", () => {
        subscribeNotifications(bus, notificationService)

        bus.emit("disk.threshold_crossed", {
            monitorPath: "/var/lib/docker",
            freeBytes: 1n * 1024n * 1024n * 1024n,
            totalBytes: 100n * 1024n * 1024n * 1024n,
            freePercent: 1,
            thresholdDescription: "below 10%",
        })

        const composed = notificationService.notify.mock.calls[0]?.[0]
        expect(composed).not.toHaveProperty("stackId")
    })

    it("does not let a rejecting notify() propagate out of emit", () => {
        subscribeNotifications(bus, notificationService)
        notificationService.notify.mockRejectedValue(new Error("smtp down"))
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

        expect(() =>
            bus.emit("backup.failed", {stackId: "my-app", errorMessage: "boom"}),
        ).not.toThrow()

        consoleErrorSpy.mockRestore()
    })

    it("does not let a rejecting notify() from one subscriber prevent a second subscriber for the same event from running", async () => {
        subscribeNotifications(bus, notificationService)
        notificationService.notify.mockRejectedValue(new Error("smtp down"))
        const secondSubscriber = vi.fn()
        bus.subscribe("backup.failed", secondSubscriber)
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

        bus.emit("backup.failed", {stackId: "my-app", errorMessage: "boom"})

        expect(secondSubscriber).toHaveBeenCalledTimes(1)
        consoleErrorSpy.mockRestore()
    })

    it("returns a disposer that detaches every subscription", () => {
        const dispose = subscribeNotifications(bus, notificationService)

        dispose()

        bus.emit("backup.failed", {stackId: "my-app", errorMessage: "boom"})
        bus.emit("restore.started", {stackId: "my-app", snapshotId: "abc"})
        bus.emit("restore.completed", {stackId: "my-app", snapshotId: "abc"})
        bus.emit("restore.failed", {stackId: "my-app", snapshotId: "abc", errorMessage: "boom"})
        bus.emit("disk.threshold_crossed", {
            monitorPath: "/var/lib/docker",
            freeBytes: 1n,
            totalBytes: 100n,
            freePercent: 1,
            thresholdDescription: "below 10%",
        })

        expect(notificationService.notify).not.toHaveBeenCalled()
    })
})
