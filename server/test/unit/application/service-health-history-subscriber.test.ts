import {afterEach, describe, expect, it, vi} from "vitest";
import {InMemoryEventBus} from "../../../src/infrastructure/event-bus.js";
import {subscribeServiceHealthHistory} from "../../../src/application/subscribers/service-health-history-subscriber.js";
import type {ServiceHealthChangedEvent} from "../../../src/domain/events.js";

const PAYLOAD: ServiceHealthChangedEvent = {
    stackId: "app",
    serviceName: "web",
    fromStatus: "starting",
    toStatus: "healthy",
    source: "docker-healthcheck",
};

describe("subscribeServiceHealthHistory", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("records one row per service.health_changed event with the payload fields", async () => {
        const bus = new InMemoryEventBus();
        const repo = {record: vi.fn().mockResolvedValue(undefined)};
        subscribeServiceHealthHistory(bus, repo);

        bus.emit("service.health_changed", PAYLOAD);

        await vi.waitFor(() => expect(repo.record).toHaveBeenCalledTimes(1));
        expect(repo.record).toHaveBeenCalledWith({
            stackId: "app",
            serviceName: "web",
            fromStatus: "starting",
            toStatus: "healthy",
            source: "docker-healthcheck",
            message: undefined,
        });
    });

    it("forwards the optional message", async () => {
        const bus = new InMemoryEventBus();
        const repo = {record: vi.fn().mockResolvedValue(undefined)};
        subscribeServiceHealthHistory(bus, repo);

        bus.emit("service.health_changed", {...PAYLOAD, message: "probe timed out"});

        await vi.waitFor(() => expect(repo.record).toHaveBeenCalledTimes(1));
        expect(repo.record).toHaveBeenCalledWith(expect.objectContaining({message: "probe timed out"}));
    });

    it("logs the stack/service pair and resolves when the write rejects", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const handlers: Array<(p: ServiceHealthChangedEvent) => void | Promise<void>> = [];
        const bus = {
            subscribe: vi.fn((_event: string, handler: (p: ServiceHealthChangedEvent) => void | Promise<void>) => {
                handlers.push(handler);
                return () => undefined;
            }),
        };
        const repo = {record: vi.fn().mockRejectedValue(new Error("db down"))};
        subscribeServiceHealthHistory(bus as never, repo);

        await expect(handlers[0]?.(PAYLOAD)).resolves.toBeUndefined();

        expect(consoleError).toHaveBeenCalledTimes(1);
        const [message] = consoleError.mock.calls[0] ?? [];
        expect(message).toContain("service-health-history-subscriber");
        expect(message).toContain("app/web");
    });

    it("stops recording once the disposer has run", async () => {
        const bus = new InMemoryEventBus();
        const repo = {record: vi.fn().mockResolvedValue(undefined)};
        const dispose = subscribeServiceHealthHistory(bus, repo);

        dispose();
        bus.emit("service.health_changed", PAYLOAD);

        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(repo.record).not.toHaveBeenCalled();
    });
});
