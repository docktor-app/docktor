import {beforeEach, describe, expect, it, vi} from "vitest"
import {InMemoryEventBus} from "../../../src/infrastructure/event-bus.js"
import {subscribeStateBroadcast} from "../../../src/application/subscribers/state-broadcast-subscriber.js"

function createMockBroadcaster() {
    return {
        publish: vi.fn(),
    }
}

describe("subscribeStateBroadcast", () => {
    let bus: InMemoryEventBus
    let broadcaster: ReturnType<typeof createMockBroadcaster>

    beforeEach(() => {
        bus = new InMemoryEventBus()
        broadcaster = createMockBroadcaster()
    })

    it("translates stack.status_changed into a stack_status live-state event", () => {
        subscribeStateBroadcast(bus, broadcaster)

        bus.emit("stack.status_changed", {stackId: "my-app", status: "RUNNING"})

        expect(broadcaster.publish).toHaveBeenCalledWith({
            type: "stack_status",
            stackId: "my-app",
            stackStatus: "RUNNING",
        })
    })

    it("translates stack.container_state_changed into a container_state live-state event, with statusLog present", () => {
        subscribeStateBroadcast(bus, broadcaster)

        bus.emit("stack.container_state_changed", {
            stackId: "my-app",
            serviceName: "web",
            containerState: "running",
            healthStatus: "healthy",
            stackStatus: "RUNNING",
            statusLog: {
                id: "log-1",
                fromStatus: "DEPLOYING",
                toStatus: "RUNNING",
                message: "Deployment succeeded",
                createdAt: "2026-09-24T00:00:00.000Z",
            },
        })

        expect(broadcaster.publish).toHaveBeenCalledWith({
            type: "container_state",
            stackId: "my-app",
            serviceName: "web",
            containerState: "running",
            healthStatus: "healthy",
            stackStatus: "RUNNING",
            statusLog: {
                id: "log-1",
                fromStatus: "DEPLOYING",
                toStatus: "RUNNING",
                message: "Deployment succeeded",
                createdAt: "2026-09-24T00:00:00.000Z",
            },
        })
    })

    it("translates stack.container_state_changed into a container_state live-state event, with statusLog absent", () => {
        subscribeStateBroadcast(bus, broadcaster)

        bus.emit("stack.container_state_changed", {
            stackId: "my-app",
            serviceName: "web",
            containerState: "exited",
            healthStatus: null,
            stackStatus: "STOPPED",
        })

        expect(broadcaster.publish).toHaveBeenCalledWith({
            type: "container_state",
            stackId: "my-app",
            serviceName: "web",
            containerState: "exited",
            healthStatus: null,
            stackStatus: "STOPPED",
        })
        const published = broadcaster.publish.mock.calls[0]?.[0]
        expect(published).not.toHaveProperty("statusLog")
    })

    it("translates stack.config_changed into a config_changed live-state event", () => {
        subscribeStateBroadcast(bus, broadcaster)

        bus.emit("stack.config_changed", {stackId: "my-app", newHash: "abc123", source: "app"})

        expect(broadcaster.publish).toHaveBeenCalledWith({
            type: "config_changed",
            stackId: "my-app",
            newHash: "abc123",
            source: "app",
        })
    })

    it("translates stack.config_error into a config_error live-state event", () => {
        subscribeStateBroadcast(bus, broadcaster)

        bus.emit("stack.config_error", {stackId: "my-app", message: "invalid YAML"})

        expect(broadcaster.publish).toHaveBeenCalledWith({
            type: "config_error",
            stackId: "my-app",
            message: "invalid YAML",
        })
    })

    it("translates stack.update_available into an update_available live-state event", () => {
        subscribeStateBroadcast(bus, broadcaster)

        bus.emit("stack.update_available", {
            stackId: "my-app",
            imageRef: "nginx:1.27",
            latestTag: "1.28",
            hasUpdate: true,
        })

        expect(broadcaster.publish).toHaveBeenCalledWith({
            type: "update_available",
            stackId: "my-app",
            imageRef: "nginx:1.27",
            latestTag: "1.28",
            hasUpdate: true,
        })
    })

    it("translates notification.created into a notification_created live-state event", () => {
        subscribeStateBroadcast(bus, broadcaster)

        bus.emit("notification.created", {notificationId: "notif-1"})

        expect(broadcaster.publish).toHaveBeenCalledWith({
            type: "notification_created",
            notificationId: "notif-1",
        })
    })

    it("translates proxy.cert_status_changed into a proxy_cert_status live-state event, with message present", () => {
        subscribeStateBroadcast(bus, broadcaster)

        bus.emit("proxy.cert_status_changed", {
            proxyConfigId: "pc-1",
            stackId: "docktor-proxy",
            domain: "app.example.com",
            status: "failed",
            message: "certificate expired",
        })

        expect(broadcaster.publish).toHaveBeenCalledWith({
            type: "proxy_cert_status",
            proxyConfigId: "pc-1",
            stackId: "docktor-proxy",
            domain: "app.example.com",
            status: "failed",
            message: "certificate expired",
        })
    })

    it("translates proxy.cert_status_changed into a proxy_cert_status live-state event, with message absent", () => {
        subscribeStateBroadcast(bus, broadcaster)

        bus.emit("proxy.cert_status_changed", {
            proxyConfigId: "pc-2",
            stackId: "docktor-proxy",
            domain: "app2.example.com",
            status: "issued",
        })

        expect(broadcaster.publish).toHaveBeenCalledWith({
            type: "proxy_cert_status",
            proxyConfigId: "pc-2",
            stackId: "docktor-proxy",
            domain: "app2.example.com",
            status: "issued",
        })
        const published = broadcaster.publish.mock.calls[0]?.[0]
        expect(published).not.toHaveProperty("message")
    })

    it("returns a disposer that detaches every subscription", () => {
        const dispose = subscribeStateBroadcast(bus, broadcaster)

        dispose()

        bus.emit("stack.status_changed", {stackId: "my-app", status: "RUNNING"})
        bus.emit("stack.container_state_changed", {
            stackId: "my-app",
            serviceName: "web",
            containerState: "running",
            healthStatus: null,
            stackStatus: "RUNNING",
        })
        bus.emit("stack.config_changed", {stackId: "my-app", newHash: "abc123", source: "app"})
        bus.emit("stack.config_error", {stackId: "my-app", message: "bad yaml"})
        bus.emit("stack.update_available", {
            stackId: "my-app",
            imageRef: "nginx:1.27",
            latestTag: null,
            hasUpdate: false,
        })
        bus.emit("notification.created", {notificationId: "notif-1"})
        bus.emit("proxy.cert_status_changed", {
            proxyConfigId: "pc-1",
            stackId: "docktor-proxy",
            domain: "app.example.com",
            status: "pending",
        })

        expect(broadcaster.publish).not.toHaveBeenCalled()
    })

    it("does not let a broadcaster whose publish throws propagate out of emit", () => {
        subscribeStateBroadcast(bus, broadcaster)
        broadcaster.publish.mockImplementation(() => {
            throw new Error("broadcaster exploded")
        })
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

        expect(() =>
            bus.emit("stack.status_changed", {stackId: "my-app", status: "RUNNING"}),
        ).not.toThrow()

        consoleErrorSpy.mockRestore()
    })

    it("delivers two events emitted in sequence to the broadcaster in that same sequence, synchronously", () => {
        subscribeStateBroadcast(bus, broadcaster)

        bus.emit("stack.status_changed", {stackId: "my-app", status: "DEPLOYING"})
        bus.emit("stack.status_changed", {stackId: "my-app", status: "RUNNING"})

        expect(broadcaster.publish).toHaveBeenNthCalledWith(1, {
            type: "stack_status",
            stackId: "my-app",
            stackStatus: "DEPLOYING",
        })
        expect(broadcaster.publish).toHaveBeenNthCalledWith(2, {
            type: "stack_status",
            stackId: "my-app",
            stackStatus: "RUNNING",
        })
    })
})
