import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {
    ServiceHealthService,
    type ServiceHealthServiceRepo,
    type ServiceHealthServiceRow,
} from "../../../src/application/service-health-service.js";
import type {ProbeOutcome} from "../../../src/domain/health-probe.js";
import type {ServiceProbeClearedEvent, ServiceProbeCompletedEvent} from "../../../src/domain/events.js";

const STACK_ID = "app";
const NOW = Date.parse("2026-10-08T12:00:00.000Z");
const FAIL_503: ProbeOutcome = {ok: false, reason: {kind: "http-status", status: 503}};
const OK_200: ProbeOutcome = {ok: true, status: 200};

function startedAgo(ms: number): string {
    return new Date(NOW - ms).toISOString();
}

function probeEvent(overrides: Partial<ServiceProbeCompletedEvent> = {}): ServiceProbeCompletedEvent {
    return {
        stackId: STACK_ID,
        serviceName: "web",
        containerId: "c1",
        containerStartedAt: startedAgo(10 * 60_000),
        outcome: OK_200,
        ...overrides,
    };
}

/**
 * An in-memory stand-in for the stack repository: updateServiceState and
 * updateStackStatus mutate the world the next findByComposeProject reads, as
 * the real repository does.
 */
function createWorld(options: {
    status?: string;
    rows?: ServiceHealthServiceRow[];
} = {}) {
    const world = {
        status: options.status ?? "RUNNING",
        rows: options.rows ?? [{serviceName: "web", containerId: "c1", containerState: "running", healthStatus: null}],
    };
    const repo = {
        findByComposeProject: vi.fn(async () => ({
            id: STACK_ID,
            status: world.status,
            services: world.rows.map((row) => ({...row})),
        })),
        updateServiceState: vi.fn(async (data: {serviceName: string; containerId: string | null; healthStatus: string | null}) => {
            const row = world.rows.find((candidate) => candidate.serviceName === data.serviceName);
            if (row) {
                row.containerId = data.containerId;
                row.healthStatus = data.healthStatus;
            }
        }),
        updateStackStatus: vi.fn(async (_stackId: string, status: string) => {
            if (status === world.status) {
                return null;
            }
            const fromStatus = world.status;
            world.status = status;
            return {id: "log-1", fromStatus, toStatus: status, message: "Status detected via container events", createdAt: new Date(NOW)};
        }),
    };
    return {world, repo: repo as unknown as ServiceHealthServiceRepo & typeof repo};
}

function createService(repo: ServiceHealthServiceRepo) {
    const bus = {emit: vi.fn()};
    const docker = {inspectContainer: vi.fn()};
    const clock = {now: NOW};
    const service = new ServiceHealthService(repo, bus, docker, () => clock.now);
    return {service, bus, docker, clock};
}

function emitted(bus: {emit: ReturnType<typeof vi.fn>}, name: string): unknown[] {
    return bus.emit.mock.calls.filter((call) => call[0] === name).map((call) => call[1]);
}

describe("ServiceHealthService.handleProbeCompleted", () => {
    let consoleError: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleError.mockRestore();
    });

    it("starts a never-seen service as `starting` inside the grace and writes before it emits", async () => {
        const {repo} = createWorld();
        const {service, bus} = createService(repo);

        await service.handleProbeCompleted(probeEvent({containerStartedAt: startedAgo(30_000), outcome: FAIL_503}));

        expect(repo.updateServiceState).toHaveBeenCalledWith({
            stackId: STACK_ID,
            serviceName: "web",
            containerId: "c1",
            containerState: "running",
            healthStatus: "starting",
        });
        expect(emitted(bus, "service.health_changed")).toEqual([
            {stackId: STACK_ID, serviceName: "web", fromStatus: null, toStatus: "starting", source: "http-probe"},
        ]);
        expect(emitted(bus, "stack.container_state_changed")).toEqual([
            {
                stackId: STACK_ID,
                serviceName: "web",
                containerState: "running",
                healthStatus: "starting",
                stackStatus: "RUNNING",
            },
        ]);

        const write = repo.updateServiceState.mock.invocationCallOrder[0] as number;
        const healthChanged = bus.emit.mock.invocationCallOrder[0] as number;
        const statusUpdate = repo.updateStackStatus.mock.invocationCallOrder[0] as number;
        const containerState = bus.emit.mock.invocationCallOrder[1] as number;
        expect([write, healthChanged, statusUpdate, containerState]).toEqual(
            [write, healthChanged, statusUpdate, containerState].sort((a, b) => a - b),
        );
    });

    it("turns healthy on a success and records the status in the message", async () => {
        const {repo, world} = createWorld();
        const {service, bus} = createService(repo);

        await service.handleProbeCompleted(probeEvent({outcome: {ok: true, status: 204}}));

        expect(world.rows[0]?.healthStatus).toBe("healthy");
        expect(emitted(bus, "service.health_changed")).toEqual([
            {
                stackId: STACK_ID,
                serviceName: "web",
                fromStatus: null,
                toStatus: "healthy",
                source: "http-probe",
                message: "Responded with HTTP 204",
            },
        ]);
        expect(world.status).toBe("HEALTHY");
    });

    it("writes `unhealthy` once after three failed checks and attaches the status log", async () => {
        const {repo, world} = createWorld();
        const {service, bus} = createService(repo);
        await service.handleProbeCompleted(probeEvent());
        bus.emit.mockClear();
        repo.updateServiceState.mockClear();

        for (let i = 0; i < 3; i++) {
            await service.handleProbeCompleted(probeEvent({outcome: FAIL_503}));
        }

        expect(repo.updateServiceState).toHaveBeenCalledTimes(1);
        expect(world.rows[0]?.healthStatus).toBe("unhealthy");
        expect(emitted(bus, "service.health_changed")).toEqual([
            {
                stackId: STACK_ID,
                serviceName: "web",
                fromStatus: "healthy",
                toStatus: "unhealthy",
                source: "http-probe",
                message: "Responded with HTTP 503 after 3 failed checks",
            },
        ]);
        expect(emitted(bus, "stack.container_state_changed")).toEqual([
            {
                stackId: STACK_ID,
                serviceName: "web",
                containerState: "running",
                healthStatus: "unhealthy",
                stackStatus: "UNHEALTHY",
                statusLog: {
                    id: "log-1",
                    fromStatus: "HEALTHY",
                    toStatus: "UNHEALTHY",
                    message: "Status detected via container events",
                    createdAt: new Date(NOW).toISOString(),
                },
            },
        ]);
    });

    it("does not write or emit when the outcome leaves the health unchanged", async () => {
        const {repo} = createWorld({rows: [{serviceName: "web", containerId: "c1", containerState: "running", healthStatus: "healthy"}]});
        const {service, bus} = createService(repo);

        await service.handleProbeCompleted(probeEvent());
        await service.handleProbeCompleted(probeEvent({outcome: FAIL_503}));

        expect(repo.updateServiceState).not.toHaveBeenCalled();
        expect(repo.updateStackStatus).not.toHaveBeenCalled();
        expect(bus.emit).not.toHaveBeenCalled();
    });

    it("starts over as `starting` when the container was recreated", async () => {
        const {repo, world} = createWorld();
        const {service, bus} = createService(repo);
        await service.handleProbeCompleted(probeEvent());
        bus.emit.mockClear();

        await service.handleProbeCompleted(
            probeEvent({containerStartedAt: startedAgo(2_000), outcome: FAIL_503}),
        );

        expect(world.rows[0]?.healthStatus).toBe("starting");
        expect(emitted(bus, "service.health_changed")).toEqual([
            {stackId: STACK_ID, serviceName: "web", fromStatus: "healthy", toStatus: "starting", source: "http-probe"},
        ]);
    });

    it("starts over as `starting` when the container id changed", async () => {
        const {repo, world} = createWorld();
        const {service} = createService(repo);
        await service.handleProbeCompleted(probeEvent());
        // An observer recorded the new container before its first result arrived.
        world.rows[0]!.containerId = "c2";

        await service.handleProbeCompleted(probeEvent({containerId: "c2", outcome: FAIL_503, containerStartedAt: startedAgo(1_000)}));

        expect(world.rows[0]?.healthStatus).toBe("starting");
    });

    it("does not mistake an unreadable start time for a new container", async () => {
        const {repo, world} = createWorld();
        const {service} = createService(repo);
        await service.handleProbeCompleted(probeEvent());

        await service.handleProbeCompleted(probeEvent({containerStartedAt: null, outcome: FAIL_503}));

        expect(world.rows[0]?.healthStatus).toBe("healthy");
    });

    it("drops a result for a container the row no longer describes (WR-01)", async () => {
        const {repo, world} = createWorld({
            rows: [{serviceName: "web", containerId: "c-new", containerState: "running", healthStatus: "starting"}],
        });
        const {service, bus} = createService(repo);

        await service.handleProbeCompleted(probeEvent({containerId: "c-old", outcome: FAIL_503}));

        expect(repo.updateServiceState).not.toHaveBeenCalled();
        expect(repo.updateStackStatus).not.toHaveBeenCalled();
        expect(bus.emit).not.toHaveBeenCalled();
        expect(world.rows[0]?.healthStatus).toBe("starting");
    });

    it("drops a successful result for a replaced container instead of turning the new one healthy", async () => {
        const {repo, world} = createWorld({
            rows: [{serviceName: "web", containerId: "c-new", containerState: "running", healthStatus: "starting"}],
        });
        const {service, bus} = createService(repo);

        await service.handleProbeCompleted(probeEvent({containerId: "c-old", outcome: OK_200}));

        expect(repo.updateServiceState).not.toHaveBeenCalled();
        expect(bus.emit).not.toHaveBeenCalled();
        expect(world.rows[0]).toMatchObject({containerId: "c-new", healthStatus: "starting"});
    });

    it("drops a result when the row has no container id", async () => {
        const {repo} = createWorld({
            rows: [{serviceName: "web", containerId: null, containerState: "running", healthStatus: null}],
        });
        const {service, bus} = createService(repo);

        await service.handleProbeCompleted(probeEvent());

        expect(repo.updateServiceState).not.toHaveBeenCalled();
        expect(bus.emit).not.toHaveBeenCalled();
    });

    it("continues from the row, not from remembered state, after an observer reset it on a same-id restart", async () => {
        const {repo, world} = createWorld();
        const {service} = createService(repo);
        await service.handleProbeCompleted(probeEvent());
        expect(world.rows[0]?.healthStatus).toBe("healthy");
        repo.updateServiceState.mockClear();
        // Docker's start event for the same container: an observer reset the row.
        world.rows[0]!.healthStatus = "starting";

        await service.handleProbeCompleted(probeEvent({containerStartedAt: null, outcome: FAIL_503}));

        expect(repo.updateServiceState).not.toHaveBeenCalled();
        expect(world.rows[0]?.healthStatus).toBe("starting");

        await service.handleProbeCompleted(probeEvent());

        expect(world.rows[0]?.healthStatus).toBe("healthy");
    });

    it("continues from the stored health after a Docktor restart instead of resetting it", async () => {
        const {repo} = createWorld({rows: [{serviceName: "web", containerId: "c1", containerState: "running", healthStatus: "unhealthy"}]});
        const {service, bus} = createService(repo);

        await service.handleProbeCompleted(probeEvent({outcome: FAIL_503}));

        expect(repo.updateServiceState).not.toHaveBeenCalled();
        expect(bus.emit).not.toHaveBeenCalled();
    });

    it.each([
        ["a stack in a transitional status", () => createWorld({status: "DEPLOYING"})],
        ["a service that is no longer running", () => createWorld({rows: [{serviceName: "web", containerId: "c-web", containerState: "exited", healthStatus: null}]})],
        ["a service without a row", () => createWorld({rows: [{serviceName: "db", containerId: "c-db", containerState: "running", healthStatus: null}]})],
    ])("ignores a result for %s", async (_label, build) => {
        const {repo} = build();
        const {service, bus} = createService(repo);

        await service.handleProbeCompleted(probeEvent());

        expect(repo.updateServiceState).not.toHaveBeenCalled();
        expect(bus.emit).not.toHaveBeenCalled();
    });

    it("ignores a result for an unknown stack", async () => {
        const {repo} = createWorld();
        repo.findByComposeProject.mockResolvedValueOnce(null as never);
        const {service, bus} = createService(repo);

        await service.handleProbeCompleted(probeEvent());

        expect(repo.updateServiceState).not.toHaveBeenCalled();
        expect(bus.emit).not.toHaveBeenCalled();
    });

    it("derives the stack status from every service, not just the probed one", async () => {
        const {repo, world} = createWorld({
            rows: [
                {serviceName: "web", containerId: "c1", containerState: "running", healthStatus: null},
                {serviceName: "db", containerId: "c-db", containerState: "running", healthStatus: "unhealthy"},
            ],
            status: "UNHEALTHY",
        });
        const {service} = createService(repo);

        await service.handleProbeCompleted(probeEvent());

        expect(world.status).toBe("UNHEALTHY");
    });

    it("serialises results for one stack so the second sees the first's write", async () => {
        const {repo, world} = createWorld({
            rows: [
                {serviceName: "web", containerId: "cw", containerState: "running", healthStatus: null},
                {serviceName: "db", containerId: "cd", containerState: "running", healthStatus: null},
            ],
        });
        const {service} = createService(repo);

        await Promise.all([
            service.handleProbeCompleted(probeEvent({serviceName: "web", containerId: "cw"})),
            service.handleProbeCompleted(probeEvent({serviceName: "db", containerId: "cd"})),
        ]);

        expect(world.rows.map((row) => row.healthStatus)).toEqual(["healthy", "healthy"]);
        expect(world.status).toBe("HEALTHY");
        // The second result reads the stack only after the first finished writing.
        const firstStatusUpdate = repo.updateStackStatus.mock.invocationCallOrder[0] as number;
        const secondRead = repo.findByComposeProject.mock.invocationCallOrder[1] as number;
        expect(secondRead).toBeGreaterThan(firstStatusUpdate);
    });

    it("logs a failed write with the stack and service, resolves, and emits nothing", async () => {
        const {repo} = createWorld();
        repo.updateServiceState.mockRejectedValueOnce(new Error("db down"));
        const {service, bus} = createService(repo);

        await expect(service.handleProbeCompleted(probeEvent())).resolves.toBeUndefined();

        expect(consoleError).toHaveBeenCalledTimes(1);
        const [message] = consoleError.mock.calls[0] as [string];
        expect(message).toContain("ServiceHealthService");
        expect(message).toContain("app/web");
        expect(bus.emit).not.toHaveBeenCalled();
    });
});

function clearedEvent(overrides: Partial<ServiceProbeClearedEvent> = {}): ServiceProbeClearedEvent {
    return {stackId: STACK_ID, serviceName: "web", reason: "probe-removed", ...overrides};
}

function inspectResult(healthStatus?: string) {
    return {State: healthStatus === undefined ? {} : {Health: {Status: healthStatus}}} as never;
}

describe("ServiceHealthService.handleProbeCleared", () => {
    let consoleError: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleError.mockRestore();
    });

    const unhealthyExited = (): ServiceHealthServiceRow[] => [
        {serviceName: "web", containerId: "c1", containerState: "exited", healthStatus: "unhealthy"},
    ];
    const unhealthyRunning = (): ServiceHealthServiceRow[] => [
        {serviceName: "web", containerId: "c1", containerState: "running", healthStatus: "unhealthy"},
    ];

    it("clears the probe health of a service whose container stopped and re-derives the stack", async () => {
        const {repo, world} = createWorld({rows: unhealthyExited(), status: "UNHEALTHY"});
        const {service, bus, docker} = createService(repo);

        await service.handleProbeCleared(clearedEvent({reason: "container-not-running"}));

        expect(repo.updateServiceState).toHaveBeenCalledExactlyOnceWith({
            stackId: STACK_ID,
            serviceName: "web",
            containerId: "c1",
            containerState: "exited",
            healthStatus: null,
        });
        expect(emitted(bus, "service.health_changed")).toEqual([
            {stackId: STACK_ID, serviceName: "web", fromStatus: "unhealthy", toStatus: null, source: "http-probe"},
        ]);
        expect(emitted(bus, "stack.container_state_changed")).toHaveLength(1);
        expect(world.status).toBe("STOPPED");
        expect(docker.inspectContainer).not.toHaveBeenCalled();
    });

    it("restores Docker's own health when the probe block was removed from a running container", async () => {
        const {repo, world} = createWorld({rows: unhealthyRunning(), status: "UNHEALTHY"});
        const {service, bus, docker} = createService(repo);
        docker.inspectContainer.mockResolvedValue(inspectResult("healthy"));

        await service.handleProbeCleared(clearedEvent());

        expect(docker.inspectContainer).toHaveBeenCalledExactlyOnceWith("c1");
        expect(world.rows[0]?.healthStatus).toBe("healthy");
        expect(emitted(bus, "service.health_changed")).toEqual([
            {
                stackId: STACK_ID,
                serviceName: "web",
                fromStatus: "unhealthy",
                toStatus: "healthy",
                source: "docker-healthcheck",
                message: "HTTP probe removed",
            },
        ]);
        expect(world.status).toBe("HEALTHY");
    });

    it("clears to null when the container has no healthcheck of its own", async () => {
        const {repo, world} = createWorld({rows: unhealthyRunning(), status: "UNHEALTHY"});
        const {service, bus, docker} = createService(repo);
        docker.inspectContainer.mockResolvedValue(inspectResult());

        await service.handleProbeCleared(clearedEvent());

        expect(world.rows[0]?.healthStatus).toBeNull();
        expect(emitted(bus, "service.health_changed")).toEqual([
            {
                stackId: STACK_ID,
                serviceName: "web",
                fromStatus: "unhealthy",
                toStatus: null,
                source: "docker-healthcheck",
                message: "HTTP probe removed",
            },
        ]);
        expect(world.status).toBe("RUNNING");
    });

    it("clears to null when the container cannot be inspected", async () => {
        const {repo, world} = createWorld({rows: unhealthyRunning(), status: "UNHEALTHY"});
        const {service, docker} = createService(repo);
        docker.inspectContainer.mockRejectedValue(new Error("no such container"));

        await service.handleProbeCleared(clearedEvent());

        expect(world.rows[0]?.healthStatus).toBeNull();
    });

    it("writes and emits nothing when the stored health already equals the target", async () => {
        const {repo} = createWorld({
            rows: [{serviceName: "web", containerId: "c1", containerState: "running", healthStatus: "healthy"}],
        });
        const {service, bus, docker} = createService(repo);
        docker.inspectContainer.mockResolvedValue(inspectResult("healthy"));

        await service.handleProbeCleared(clearedEvent());

        expect(repo.updateServiceState).not.toHaveBeenCalled();
        expect(bus.emit).not.toHaveBeenCalled();
    });

    it("leaves the health alone when the container is running again after a stop was observed", async () => {
        const {repo} = createWorld({rows: unhealthyRunning(), status: "UNHEALTHY"});
        const {service, bus, docker} = createService(repo);

        await service.handleProbeCleared(clearedEvent({reason: "container-not-running"}));

        expect(repo.updateServiceState).not.toHaveBeenCalled();
        expect(docker.inspectContainer).not.toHaveBeenCalled();
        expect(bus.emit).not.toHaveBeenCalled();
    });

    it.each([
        ["a stack in a transitional status", () => createWorld({status: "DEPLOYING", rows: unhealthyExited()})],
        [
            "a service without a row",
            () => createWorld({rows: [{serviceName: "db", containerId: null, containerState: "exited", healthStatus: "unhealthy"}]}),
        ],
    ])("ignores a clear for %s", async (_label, build) => {
        const {repo} = build();
        const {service, bus} = createService(repo);

        await service.handleProbeCleared(clearedEvent({reason: "container-not-running"}));

        expect(repo.updateServiceState).not.toHaveBeenCalled();
        expect(bus.emit).not.toHaveBeenCalled();
    });

    it("ignores a clear for an unknown stack", async () => {
        const {repo} = createWorld();
        repo.findByComposeProject.mockResolvedValueOnce(null as never);
        const {service, bus} = createService(repo);

        await service.handleProbeCleared(clearedEvent());

        expect(bus.emit).not.toHaveBeenCalled();
    });

    it("drops the in-memory probe state so a later probe seeds again from the stored health", async () => {
        const {repo, world} = createWorld();
        const {service, docker} = createService(repo);
        docker.inspectContainer.mockResolvedValue(inspectResult("healthy"));
        await service.handleProbeCompleted(probeEvent());
        for (let i = 0; i < 2; i++) {
            await service.handleProbeCompleted(probeEvent({outcome: FAIL_503}));
        }
        expect(world.rows[0]?.healthStatus).toBe("healthy");

        // Two failures are remembered. Without the clear, one more would make
        // it unhealthy; after the clear the next probe starts over.
        await service.handleProbeCleared(clearedEvent());
        await service.handleProbeCompleted(probeEvent({outcome: FAIL_503}));

        expect(world.rows[0]?.healthStatus).toBe("healthy");
    });

    it("logs a failed write with the stack and service, and resolves", async () => {
        const {repo} = createWorld({rows: unhealthyExited()});
        repo.updateServiceState.mockRejectedValueOnce(new Error("db down"));
        const {service, bus} = createService(repo);

        await expect(service.handleProbeCleared(clearedEvent({reason: "container-not-running"}))).resolves.toBeUndefined();

        expect(consoleError).toHaveBeenCalledTimes(1);
        const [message] = consoleError.mock.calls[0] as [string];
        expect(message).toContain("app/web");
        expect(bus.emit).not.toHaveBeenCalled();
    });
});
