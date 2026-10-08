import {describe, expect, it, vi} from "vitest";
import {InMemoryEventBus} from "../../../src/infrastructure/event-bus.js";
import {subscribeProbeResults} from "../../../src/application/subscribers/probe-result-subscriber.js";
import type {ServiceProbeClearedEvent, ServiceProbeCompletedEvent} from "../../../src/domain/events.js";

const EVENT: ServiceProbeCompletedEvent = {
    stackId: "app",
    serviceName: "web",
    containerId: "c1",
    containerStartedAt: null,
    outcome: {ok: true, status: 200},
};

const CLEARED: ServiceProbeClearedEvent = {stackId: "app", serviceName: "web", reason: "probe-removed"};

function createHandler() {
    return {
        handleProbeCompleted: vi.fn().mockResolvedValue(undefined),
        handleProbeCleared: vi.fn().mockResolvedValue(undefined),
    };
}

describe("subscribeProbeResults", () => {
    it("hands every service.probe_completed payload to the handler", () => {
        const bus = new InMemoryEventBus();
        const handler = createHandler();
        subscribeProbeResults(bus, handler);

        bus.emit("service.probe_completed", EVENT);

        expect(handler.handleProbeCompleted).toHaveBeenCalledExactlyOnceWith(EVENT);
        expect(handler.handleProbeCleared).not.toHaveBeenCalled();
    });

    it("routes service.probe_cleared to handleProbeCleared", () => {
        const bus = new InMemoryEventBus();
        const handler = createHandler();
        subscribeProbeResults(bus, handler);

        bus.emit("service.probe_cleared", CLEARED);

        expect(handler.handleProbeCleared).toHaveBeenCalledExactlyOnceWith(CLEARED);
        expect(handler.handleProbeCompleted).not.toHaveBeenCalled();
    });

    it("stops delivering both events once disposed", () => {
        const bus = new InMemoryEventBus();
        const handler = createHandler();
        const dispose = subscribeProbeResults(bus, handler);

        dispose();
        bus.emit("service.probe_completed", EVENT);
        bus.emit("service.probe_cleared", CLEARED);

        expect(handler.handleProbeCompleted).not.toHaveBeenCalled();
        expect(handler.handleProbeCleared).not.toHaveBeenCalled();
    });

    it("ignores unrelated events", () => {
        const bus = new InMemoryEventBus();
        const handler = createHandler();
        subscribeProbeResults(bus, handler);

        bus.emit("stack.status_changed", {stackId: "app", status: "RUNNING"});

        expect(handler.handleProbeCompleted).not.toHaveBeenCalled();
        expect(handler.handleProbeCleared).not.toHaveBeenCalled();
    });
});
