import {describe, expect, it, vi} from "vitest";
import {InMemoryEventBus} from "../../../src/infrastructure/event-bus.js";
import {subscribeProbeResults} from "../../../src/application/subscribers/probe-result-subscriber.js";
import type {ServiceProbeCompletedEvent} from "../../../src/domain/events.js";

const EVENT: ServiceProbeCompletedEvent = {
    stackId: "app",
    serviceName: "web",
    containerId: "c1",
    containerStartedAt: null,
    outcome: {ok: true, status: 200},
};

describe("subscribeProbeResults", () => {
    it("hands every service.probe_completed payload to the handler", () => {
        const bus = new InMemoryEventBus();
        const handler = {handleProbeCompleted: vi.fn().mockResolvedValue(undefined)};
        subscribeProbeResults(bus, handler);

        bus.emit("service.probe_completed", EVENT);

        expect(handler.handleProbeCompleted).toHaveBeenCalledExactlyOnceWith(EVENT);
    });

    it("stops delivering once disposed", () => {
        const bus = new InMemoryEventBus();
        const handler = {handleProbeCompleted: vi.fn().mockResolvedValue(undefined)};
        const dispose = subscribeProbeResults(bus, handler);

        dispose();
        bus.emit("service.probe_completed", EVENT);

        expect(handler.handleProbeCompleted).not.toHaveBeenCalled();
    });

    it("ignores other events", () => {
        const bus = new InMemoryEventBus();
        const handler = {handleProbeCompleted: vi.fn().mockResolvedValue(undefined)};
        subscribeProbeResults(bus, handler);

        bus.emit("service.probe_cleared", {stackId: "app", serviceName: "web", reason: "probe-removed"});

        expect(handler.handleProbeCompleted).not.toHaveBeenCalled();
    });
});
