import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NotificationWatcher } from "../../../src/jobs/notification-watcher.js"
import { InMemoryEventBus } from "../../../src/infrastructure/event-bus.js"

vi.mock("node-cron", () => ({
    default: { schedule: vi.fn().mockReturnValue({ stop: vi.fn() }) },
}))

import cron from "node-cron"

function createMockNotificationService() {
    return {
        notify: vi.fn().mockResolvedValue(undefined),
    }
}

function emitContainerState(bus: InMemoryEventBus, overrides: Partial<{
    stackId: string
    serviceName: string
    containerState: string
    healthStatus: string | null
    stackStatus: string
}> = {}) {
    bus.emit("stack.container_state_changed", {
        stackId: "my-stack",
        serviceName: "web",
        containerState: "exited",
        healthStatus: null,
        stackStatus: "ERROR",
        ...overrides,
    })
}

describe("NotificationWatcher", () => {
    let watcher: NotificationWatcher
    let notificationService: ReturnType<typeof createMockNotificationService>
    let bus: InMemoryEventBus

    beforeEach(() => {
        vi.useFakeTimers()
        vi.clearAllMocks()
        notificationService = createMockNotificationService()
        bus = new InMemoryEventBus()
        watcher = new NotificationWatcher(notificationService as any, bus)
        watcher.start()
    })

    afterEach(() => {
        vi.useRealTimers()
        watcher.stop()
    })

    it("fires notification on ERROR transition", async () => {
        emitContainerState(bus, { stackStatus: "ERROR" })

        expect(notificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({ type: "stack_error", stackId: "my-stack" }),
        )
    })

    it("fires notification on ERROR transition delivered via stack.status_changed, whose field is named status (not stackStatus)", async () => {
        bus.emit("stack.status_changed", { stackId: "my-stack", status: "ERROR" })

        expect(notificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({ type: "stack_error", stackId: "my-stack" }),
        )
    })

    it("suppresses duplicate ERROR for same stack", async () => {
        emitContainerState(bus, { stackStatus: "ERROR" })
        emitContainerState(bus, { stackStatus: "ERROR" })

        expect(notificationService.notify).toHaveBeenCalledTimes(1)
    })

    it("fires notification after UNHEALTHY grace period", async () => {
        emitContainerState(bus, {
            containerState: "running",
            healthStatus: "unhealthy",
            stackStatus: "UNHEALTHY",
        })

        // No notification yet — within grace period
        expect(notificationService.notify).not.toHaveBeenCalled()

        // Advance timers by 2 minutes
        await vi.advanceTimersByTimeAsync(2 * 60 * 1000)

        expect(notificationService.notify).toHaveBeenCalledWith(
            expect.objectContaining({ type: "stack_unhealthy", stackId: "my-stack" }),
        )
    })

    it("cancels UNHEALTHY timer on recovery to RUNNING", async () => {
        emitContainerState(bus, {
            containerState: "running",
            healthStatus: "unhealthy",
            stackStatus: "UNHEALTHY",
        })

        // Recover before grace period expires
        emitContainerState(bus, {
            containerState: "running",
            healthStatus: "healthy",
            stackStatus: "RUNNING",
        })

        // Advance past grace period — notification should NOT fire
        await vi.advanceTimersByTimeAsync(2 * 60 * 1000)

        expect(notificationService.notify).not.toHaveBeenCalled()
    })

    it("clears active incidents on recovery", async () => {
        // First ERROR — should notify
        emitContainerState(bus, { stackStatus: "ERROR" })
        expect(notificationService.notify).toHaveBeenCalledTimes(1)

        // Recover — clears incident
        emitContainerState(bus, {
            containerState: "running",
            healthStatus: "healthy",
            stackStatus: "RUNNING",
        })

        // Second ERROR after recovery — should notify again
        emitContainerState(bus, { stackStatus: "ERROR" })
        expect(notificationService.notify).toHaveBeenCalledTimes(2)
    })

    it("clears timers on stop()", async () => {
        emitContainerState(bus, {
            containerState: "running",
            healthStatus: "unhealthy",
            stackStatus: "UNHEALTHY",
        })

        watcher.stop()

        // Advance past grace period — notification should NOT fire because watcher was stopped
        await vi.advanceTimersByTimeAsync(2 * 60 * 1000)

        expect(notificationService.notify).not.toHaveBeenCalled()
    })

    it("no longer receives events after stop() — both subscriptions are disposed", async () => {
        watcher.stop()

        emitContainerState(bus, { stackStatus: "ERROR" })
        bus.emit("stack.status_changed", { stackId: "my-stack", status: "ERROR" })

        expect(notificationService.notify).not.toHaveBeenCalled()
    })

    describe("reconcile schedule (D-13, PD-6)", () => {
        it("schedules no cron task because it has nothing to reconcile against", () => {
            // watcher.start() already ran in beforeEach — a missed in-process
            // broadcast leaves no queryable drift to reconcile against, unlike
            // a stale file hash or container state, so this watcher's
            // reconcileCronExpression is null and WatcherJob never calls
            // cron.schedule() for it.
            expect(vi.mocked(cron.schedule)).not.toHaveBeenCalled()
        })
    })
})
