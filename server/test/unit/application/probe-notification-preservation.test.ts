import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {NotificationWatcher} from "../../../src/jobs/notification-watcher.js";
import {InMemoryEventBus} from "../../../src/infrastructure/event-bus.js";
import {
    ServiceHealthService,
    type ServiceHealthServiceRepo,
    type ServiceHealthServiceRow,
} from "../../../src/application/service-health-service.js";
import {subscribeProbeResults} from "../../../src/application/subscribers/probe-result-subscriber.js";
import type {ProbeOutcome} from "../../../src/domain/health-probe.js";
import type {ServiceProbeCompletedEvent} from "../../../src/domain/events.js";

// The watcher is a WatcherJob without a reconcile schedule; the mock only keeps
// node-cron from being loaded (same as notification-watcher.test.ts).
vi.mock("node-cron", () => ({
    default: {schedule: vi.fn().mockReturnValue({stop: vi.fn()})},
}));

const STACK_ID = "app";
const UNHEALTHY_TIMER_MS = 120_000;
const FAIL_503: ProbeOutcome = {ok: false, reason: {kind: "http-status", status: 503}};
const OK_200: ProbeOutcome = {ok: true, status: 200};

/** An in-memory stand-in for the stack repository whose writes the next read sees. */
function createWorld() {
    const world = {
        status: "HEALTHY",
        rows: [
            {serviceName: "web", containerId: "c1", containerState: "running", healthStatus: "healthy"},
        ] as ServiceHealthServiceRow[],
    };
    const repo = {
        findByComposeProject: vi.fn(async () => ({
            id: STACK_ID,
            status: world.status,
            services: world.rows.map((row) => ({...row})),
        })),
        updateServiceState: vi.fn(async (data: {serviceName: string; healthStatus: string | null}) => {
            const row = world.rows.find((candidate) => candidate.serviceName === data.serviceName);
            if (row) {
                row.healthStatus = data.healthStatus;
            }
        }),
        updateStackStatus: vi.fn(async (_stackId: string, status: string) => {
            if (status === world.status) {
                return null;
            }
            const fromStatus = world.status;
            world.status = status;
            return {id: "log-1", fromStatus, toStatus: status, message: null, createdAt: new Date()};
        }),
    };
    return {world, repo: repo as unknown as ServiceHealthServiceRepo};
}

describe("probe-driven health reaches NotificationWatcher like Docker-driven health (#23 criterion 4)", () => {
    let bus: InMemoryEventBus;
    let world: ReturnType<typeof createWorld>["world"];
    let notify: ReturnType<typeof vi.fn>;
    let watcher: NotificationWatcher;
    let dispose: () => void;
    let consoleLog: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.useFakeTimers();
        consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
        bus = new InMemoryEventBus();
        const created = createWorld();
        world = created.world;
        notify = vi.fn().mockResolvedValue(undefined);

        watcher = new NotificationWatcher({notify}, bus);
        void watcher.start();
        const service = new ServiceHealthService(created.repo, bus, {inspectContainer: vi.fn()});
        dispose = subscribeProbeResults(bus, service);
    });

    afterEach(() => {
        dispose();
        watcher.stop();
        consoleLog.mockRestore();
        vi.useRealTimers();
    });

    function probe(outcome: ProbeOutcome): void {
        const event: ServiceProbeCompletedEvent = {
            stackId: STACK_ID,
            serviceName: "web",
            containerId: "c1",
            // Started long before, so no startup grace swallows the failures.
            containerStartedAt: new Date(Date.now() - 60 * 60_000).toISOString(),
            outcome,
        };
        bus.emit("service.probe_completed", event);
    }

    // Bus handlers are not awaited by emit and the fake repository only
    // resolves promises, so a bounded run of microtask turns is enough. This
    // is not vi.waitFor, which would advance the fake clock while it polls.
    async function until(condition: () => boolean): Promise<void> {
        for (let turn = 0; turn < 200 && !condition(); turn++) {
            await Promise.resolve();
        }
        expect(condition()).toBe(true);
    }

    async function failThreeTimes(): Promise<void> {
        for (let i = 0; i < 3; i++) {
            probe(FAIL_503);
        }
        await until(() => world.status === "UNHEALTHY");
        // The watcher handles the same event on its own subscription.
        await vi.advanceTimersByTimeAsync(0);
    }

    it("sends exactly one stack_unhealthy notification once the stack has been unhealthy for 120 seconds", async () => {
        await failThreeTimes();

        await vi.advanceTimersByTimeAsync(UNHEALTHY_TIMER_MS - 1);
        expect(notify).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify).toHaveBeenCalledWith(expect.objectContaining({type: "stack_unhealthy", stackId: STACK_ID}));

        await vi.advanceTimersByTimeAsync(10 * UNHEALTHY_TIMER_MS);
        expect(notify).toHaveBeenCalledTimes(1);
    });

    it("cancels the pending notification when a successful probe recovers the stack in time", async () => {
        await failThreeTimes();
        await vi.advanceTimersByTimeAsync(UNHEALTHY_TIMER_MS / 2);

        probe(OK_200);
        await until(() => world.status === "HEALTHY");
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(10 * UNHEALTHY_TIMER_MS);

        expect(notify).not.toHaveBeenCalled();
    });
});
