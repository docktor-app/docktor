import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {ServiceHealthService, type ServiceHealthServiceRepo} from "../../../src/application/service-health-service.js";
import {subscribeServiceHealthHistory} from "../../../src/application/subscribers/service-health-history-subscriber.js";
import type {ServiceProbeCompletedEvent} from "../../../src/domain/events.js";
import type {ProbeOutcome} from "../../../src/domain/health-probe.js";
import {InMemoryEventBus} from "../../../src/infrastructure/event-bus.js";

const NOW = Date.parse("2026-10-08T12:00:00.000Z");
const STALLED: ProbeOutcome = {ok: false, reason: {kind: "http-status", status: 503}};
const OK_200: ProbeOutcome = {ok: true, status: 200};

function probeEvent(outcome: ProbeOutcome): ServiceProbeCompletedEvent {
    return {
        stackId: "app",
        serviceName: "web",
        containerId: "c1",
        containerStartedAt: new Date(NOW - 10 * 60_000).toISOString(),
        outcome,
    };
}

/** UAT G-14-1: the database is unreachable for part of a Docker daemon stall. */
describe("a stalled Docker daemon over a flaky database", () => {
    beforeEach(() => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("records exactly one healthy -> unhealthy history row after three failed probes", async () => {
        const row = {serviceName: "web", containerId: "c1", containerState: "running", healthStatus: null as string | null};
        const repo = {
            findByComposeProject: vi.fn(async () => ({id: "app", status: "RUNNING", services: [{...row}]})),
            updateServiceState: vi.fn(async (data: {healthStatus: string | null}) => {
                row.healthStatus = data.healthStatus;
            }),
            updateStackStatus: vi.fn(async () => null),
        };
        const bus = new InMemoryEventBus();
        const history = {record: vi.fn().mockResolvedValue(undefined)};
        subscribeServiceHealthHistory(bus, history);
        const service = new ServiceHealthService(
            repo as unknown as ServiceHealthServiceRepo,
            bus,
            {inspectContainer: vi.fn()},
            () => NOW,
        );

        await service.handleProbeCompleted(probeEvent(OK_200));
        await vi.waitFor(() => expect(history.record).toHaveBeenCalledTimes(1));
        history.record.mockClear();

        await service.handleProbeCompleted(probeEvent(STALLED));
        repo.findByComposeProject.mockRejectedValueOnce(new Error("getaddrinfo EAI_AGAIN db"));
        await service.handleProbeCompleted(probeEvent(STALLED));
        repo.findByComposeProject.mockRejectedValueOnce(new Error("getaddrinfo EAI_AGAIN db"));
        await service.handleProbeCompleted(probeEvent(STALLED));
        await service.handleProbeCompleted(probeEvent(STALLED));

        await vi.waitFor(() => expect(history.record).toHaveBeenCalledTimes(1));
        expect(history.record).toHaveBeenCalledWith({
            stackId: "app",
            serviceName: "web",
            fromStatus: "healthy",
            toStatus: "unhealthy",
            source: "http-probe",
            message: "Responded with HTTP 503 after 3 failed checks",
        });
    });
});
