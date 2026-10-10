import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {
    OUTBOX_CAPACITY,
    OUTBOX_RETRY_INTERVAL_MS,
    ServiceHealthHistoryOutbox,
    type ServiceHealthHistoryRecordInput,
} from "../../../src/application/subscribers/service-health-history-outbox.js";
import {subscribeServiceHealthHistory} from "../../../src/application/subscribers/service-health-history-subscriber.js";
import {InMemoryEventBus} from "../../../src/infrastructure/event-bus.js";

const T0 = new Date("2026-10-08T12:00:00.000Z");

function input(overrides: Partial<ServiceHealthHistoryRecordInput> = {}): ServiceHealthHistoryRecordInput {
    return {
        stackId: "app",
        serviceName: "web",
        fromStatus: "healthy",
        toStatus: "unhealthy",
        source: "http-probe",
        message: "Responded with HTTP 503 after 3 failed checks",
        ...overrides,
    };
}

describe("ServiceHealthHistoryOutbox", () => {
    let consoleError: ReturnType<typeof vi.spyOn>;
    let consoleWarn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(T0);
        consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
        consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("writes straight through with exactly the given fields when the database answers", async () => {
        const repo = {record: vi.fn().mockResolvedValue(undefined)};
        const outbox = new ServiceHealthHistoryOutbox(repo);

        await outbox.record(input());

        expect(repo.record).toHaveBeenCalledExactlyOnceWith(input());
        expect(vi.getTimerCount()).toBe(0);
        outbox.dispose();
    });

    it("queues a rejected write, logs it once and never rejects", async () => {
        const repo = {record: vi.fn().mockRejectedValue(new Error("db down"))};
        const outbox = new ServiceHealthHistoryOutbox(repo);

        await expect(outbox.record(input())).resolves.toBeUndefined();

        expect(consoleError).toHaveBeenCalledTimes(1);
        const [message] = consoleError.mock.calls[0] as [string];
        expect(message).toContain("service-health-history-subscriber");
        expect(message).toContain("app/web");
        expect(message).toContain("queued for retry");
        expect(outbox.size).toBe(1);
        outbox.dispose();
    });

    it("retries after the interval with the time the event was handled as createdAt", async () => {
        const repo = {record: vi.fn().mockRejectedValueOnce(new Error("db down")).mockResolvedValue(undefined)};
        const outbox = new ServiceHealthHistoryOutbox(repo);
        await outbox.record(input());
        repo.record.mockClear();

        await vi.advanceTimersByTimeAsync(OUTBOX_RETRY_INTERVAL_MS);

        expect(repo.record).toHaveBeenCalledExactlyOnceWith({...input(), createdAt: T0});
        expect(outbox.size).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
        outbox.dispose();
    });

    it("re-arms the timer when the retry fails too", async () => {
        const repo = {record: vi.fn().mockRejectedValue(new Error("db down"))};
        const outbox = new ServiceHealthHistoryOutbox(repo);
        await outbox.record(input());

        await vi.advanceTimersByTimeAsync(OUTBOX_RETRY_INTERVAL_MS);

        expect(repo.record).toHaveBeenCalledTimes(2);
        expect(outbox.size).toBe(1);
        expect(vi.getTimerCount()).toBe(1);

        await vi.advanceTimersByTimeAsync(OUTBOX_RETRY_INTERVAL_MS);

        expect(repo.record).toHaveBeenCalledTimes(3);
        outbox.dispose();
    });

    it("queues a new event behind a pending one and flushes both in order once the database answers", async () => {
        const repo = {record: vi.fn().mockRejectedValueOnce(new Error("db down")).mockResolvedValue(undefined)};
        const outbox = new ServiceHealthHistoryOutbox(repo);
        await outbox.record(input({serviceName: "first"}));
        repo.record.mockClear();
        vi.setSystemTime(new Date(T0.getTime() + 5_000));

        await outbox.record(input({serviceName: "second"}));

        expect(repo.record.mock.calls.map(([arg]) => (arg as ServiceHealthHistoryRecordInput).serviceName)).toEqual([
            "first",
            "second",
        ]);
        expect(repo.record).toHaveBeenNthCalledWith(1, {...input({serviceName: "first"}), createdAt: T0});
        expect(repo.record).toHaveBeenNthCalledWith(2, {
            ...input({serviceName: "second"}),
            createdAt: new Date(T0.getTime() + 5_000),
        });
        expect(outbox.size).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
        outbox.dispose();
    });

    it("stops a flush at the first failure and keeps the order", async () => {
        const repo = {record: vi.fn().mockRejectedValue(new Error("db down"))};
        const outbox = new ServiceHealthHistoryOutbox(repo);
        await outbox.record(input({serviceName: "first"}));
        await outbox.record(input({serviceName: "second"}));
        repo.record.mockClear();
        repo.record.mockResolvedValueOnce(undefined).mockRejectedValue(new Error("db down"));

        await vi.advanceTimersByTimeAsync(OUTBOX_RETRY_INTERVAL_MS);

        expect(repo.record.mock.calls.map(([arg]) => (arg as ServiceHealthHistoryRecordInput).serviceName)).toEqual([
            "first",
            "second",
        ]);
        expect(outbox.size).toBe(1);
        outbox.dispose();
    });

    it("drops the oldest entry with a warning naming it when the queue is full", async () => {
        const repo = {record: vi.fn().mockRejectedValue(new Error("db down"))};
        const outbox = new ServiceHealthHistoryOutbox(repo);
        for (let i = 0; i < OUTBOX_CAPACITY; i++) {
            await outbox.record(input({serviceName: `svc-${i}`}));
        }
        expect(outbox.size).toBe(OUTBOX_CAPACITY);
        expect(consoleWarn).not.toHaveBeenCalled();

        await outbox.record(input({serviceName: "overflow"}));

        expect(outbox.size).toBe(OUTBOX_CAPACITY);
        expect(consoleWarn).toHaveBeenCalledTimes(1);
        const [message] = consoleWarn.mock.calls[0] as [string];
        expect(message).toContain("app/svc-0");
        outbox.dispose();
    });

    it("clears the retry timer on dispose so no retry happens afterwards", async () => {
        const repo = {record: vi.fn().mockRejectedValue(new Error("db down"))};
        const outbox = new ServiceHealthHistoryOutbox(repo);
        await outbox.record(input());
        repo.record.mockClear();

        outbox.dispose();
        await vi.advanceTimersByTimeAsync(OUTBOX_RETRY_INTERVAL_MS * 3);

        expect(repo.record).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it("unrefs the retry timer so it never keeps the process alive", async () => {
        const unref = vi.fn();
        const realSetTimeout = globalThis.setTimeout;
        const spy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((...args: Parameters<typeof setTimeout>) => {
            const handle = realSetTimeout(...args);
            return Object.assign(handle, {unref});
        }) as typeof setTimeout);
        const repo = {record: vi.fn().mockRejectedValue(new Error("db down"))};
        const outbox = new ServiceHealthHistoryOutbox(repo);

        await outbox.record(input());

        expect(unref).toHaveBeenCalled();
        outbox.dispose();
        spy.mockRestore();
    });
});

describe("subscribeServiceHealthHistory with a database that fails first", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(T0);
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("records the row with the original createdAt after the retry timer fires", async () => {
        const bus = new InMemoryEventBus();
        const repo = {record: vi.fn().mockRejectedValueOnce(new Error("db down")).mockResolvedValue(undefined)};
        const dispose = subscribeServiceHealthHistory(bus, repo);

        bus.emit("service.health_changed", {
            stackId: "app",
            serviceName: "web",
            fromStatus: "healthy",
            toStatus: "unhealthy",
            source: "http-probe",
            message: "Docktor couldn't reach the container's network after 3 failed checks",
        });
        await vi.advanceTimersByTimeAsync(0);
        expect(repo.record).toHaveBeenCalledTimes(1);

        vi.setSystemTime(new Date(T0.getTime() + OUTBOX_RETRY_INTERVAL_MS));
        await vi.advanceTimersByTimeAsync(OUTBOX_RETRY_INTERVAL_MS);

        expect(repo.record).toHaveBeenCalledTimes(2);
        expect(repo.record).toHaveBeenLastCalledWith({
            stackId: "app",
            serviceName: "web",
            fromStatus: "healthy",
            toStatus: "unhealthy",
            source: "http-probe",
            message: "Docktor couldn't reach the container's network after 3 failed checks",
            createdAt: T0,
        });
        dispose();
    });
});
