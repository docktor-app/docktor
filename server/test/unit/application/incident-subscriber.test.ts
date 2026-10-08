import {describe, expect, it, vi} from "vitest";
import {subscribeIncidentTracking} from "../../../src/application/subscribers/incident-subscriber.js";
import {InMemoryEventBus} from "../../../src/infrastructure/event-bus.js";

describe("subscribeIncidentTracking", () => {
    it("forwards the status of stack.status_changed to the tracker", async () => {
        const bus = new InMemoryEventBus();
        const tracker = {observeStackStatus: vi.fn().mockResolvedValue(undefined)};
        subscribeIncidentTracking(bus, tracker);

        bus.emit("stack.status_changed", {stackId: "a", status: "ERROR"});

        await vi.waitFor(() => expect(tracker.observeStackStatus).toHaveBeenCalledTimes(1));
        expect(tracker.observeStackStatus).toHaveBeenCalledWith("a", "ERROR");
    });

    it("forwards the stackStatus of stack.container_state_changed to the tracker", async () => {
        const bus = new InMemoryEventBus();
        const tracker = {observeStackStatus: vi.fn().mockResolvedValue(undefined)};
        subscribeIncidentTracking(bus, tracker);

        bus.emit("stack.container_state_changed", {
            stackId: "a",
            serviceName: "web",
            containerState: "running",
            healthStatus: "unhealthy",
            stackStatus: "UNHEALTHY",
        });

        await vi.waitFor(() => expect(tracker.observeStackStatus).toHaveBeenCalledTimes(1));
        expect(tracker.observeStackStatus).toHaveBeenCalledWith("a", "UNHEALTHY");
    });

    it("returns the tracker's promise from each handler", () => {
        const handlers = new Map<string, (payload: never) => unknown>();
        const bus = {
            subscribe: vi.fn((event: string, handler: (payload: never) => unknown) => {
                handlers.set(event, handler);
                return () => undefined;
            }),
        };
        const pending = Promise.resolve();
        const tracker = {observeStackStatus: vi.fn().mockReturnValue(pending)};
        subscribeIncidentTracking(bus as never, tracker);

        expect(handlers.get("stack.status_changed")?.({stackId: "a", status: "RUNNING"} as never)).toBe(pending);
        expect(handlers.get("stack.container_state_changed")?.({stackId: "a", stackStatus: "RUNNING"} as never)).toBe(
            pending,
        );
    });

    it("unsubscribes both events when the disposer runs", async () => {
        const bus = new InMemoryEventBus();
        const tracker = {observeStackStatus: vi.fn().mockResolvedValue(undefined)};
        const dispose = subscribeIncidentTracking(bus, tracker);

        dispose();
        bus.emit("stack.status_changed", {stackId: "a", status: "ERROR"});
        bus.emit("stack.container_state_changed", {
            stackId: "a",
            serviceName: "web",
            containerState: "running",
            healthStatus: null,
            stackStatus: "ERROR",
        });

        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(tracker.observeStackStatus).not.toHaveBeenCalled();
    });
});
