import {describe, expect, it, vi, beforeEach} from "vitest";
import {StatePoller} from "../../../../src/jobs/state-poller.js";
import {InMemoryEventBus} from "../../../../src/infrastructure/event-bus.js";
import {NotificationWatcher} from "../../../../src/jobs/notification-watcher.js";

// StatePoller accepts DockerodeClient and StackRepository via constructor for testability.
// This allows mocking without module-level vi.mock() calls.

const TRANSITIONAL_STATES = ["DEPLOYING", "UPDATING", "BACKING_UP", "RESTORING", "MIGRATING"] as const;

function createMockDockerodeClient() {
    return {
        getEventStream: vi.fn(),
        inspectContainer: vi.fn(),
        listContainers: vi.fn(),
        getLogStream: vi.fn(),
    };
}

function createMockStackRepository() {
    return {
        findByComposeProject: vi.fn(),
        findAll: vi.fn(),
        updateServiceState: vi.fn(),
        updateStackStatus: vi.fn(),
        findServiceByContainerId: vi.fn(),
    };
}

describe("StatePoller", () => {
    let poller: StatePoller;
    let mockDockerClient: ReturnType<typeof createMockDockerodeClient>;
    let mockStackRepo: ReturnType<typeof createMockStackRepository>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockDockerClient = createMockDockerodeClient();
        mockStackRepo = createMockStackRepository();
        poller = new StatePoller(mockDockerClient as any, mockStackRepo as any);
    });

    describe("handleEvent (OBS-02)", () => {
        it("calls dockerode inspectContainer for the event's container ID", async () => {
            const event = {
                Type: "container",
                Action: "start",
                Actor: {
                    ID: "container-abc",
                    Attributes: {
                        "com.docker.compose.project": "my-stack",
                        "com.docker.compose.service": "web",
                    },
                },
            };

            const inspectResult = {
                Id: "container-abc",
                State: {Status: "running", Health: {Status: "healthy"}},
            };
            mockDockerClient.inspectContainer.mockResolvedValue(inspectResult);
            mockStackRepo.findByComposeProject.mockResolvedValue({
                id: "my-stack",
                status: "RUNNING",
                services: [{serviceName: "web"}],
            });
            mockStackRepo.updateStackStatus.mockResolvedValue(null);

            await (poller as any).handleEvent(event);

            expect(mockDockerClient.inspectContainer).toHaveBeenCalledWith("container-abc");
        });

        it("updates DB service row with containerState and healthStatus from inspect result", async () => {
            const event = {
                Type: "container",
                Action: "health_status",
                Actor: {
                    ID: "container-xyz",
                    Attributes: {
                        "com.docker.compose.project": "my-stack",
                        "com.docker.compose.service": "web",
                    },
                },
            };

            const inspectResult = {
                Id: "container-xyz",
                State: {Status: "running", Health: {Status: "healthy"}},
            };
            mockDockerClient.inspectContainer.mockResolvedValue(inspectResult);
            mockStackRepo.findByComposeProject.mockResolvedValue({
                id: "my-stack",
                status: "RUNNING",
                services: [{serviceName: "web"}],
            });
            mockStackRepo.updateStackStatus.mockResolvedValue(null);

            await (poller as any).handleEvent(event);

            expect(mockStackRepo.updateServiceState).toHaveBeenCalledWith(
                expect.objectContaining({
                    containerState: "running",
                    healthStatus: "healthy",
                }),
            );
        });
    });

    describe("handleEvent — service.health_changed (#23, D-12)", () => {
        const event = {
            Type: "container",
            Action: "health_status: unhealthy",
            Actor: {
                ID: "container-web",
                Attributes: {
                    "com.docker.compose.project": "my-stack",
                    "com.docker.compose.service": "web",
                },
            },
        };

        function setup(opts: {previousHealth: string | null; nextHealth: string | null; services?: string[]}) {
            const bus = new InMemoryEventBus();
            const emitted: string[] = [];
            const healthListener = vi.fn(() => {
                emitted.push("service.health_changed");
            });
            bus.subscribe("service.health_changed", healthListener);
            bus.subscribe("stack.container_state_changed", () => {
                emitted.push("stack.container_state_changed");
            });
            const pollerWithBus = new StatePoller(mockDockerClient as any, mockStackRepo as any, bus);

            mockDockerClient.inspectContainer.mockResolvedValue({
                Id: "container-web",
                State: {
                    Status: "running",
                    ...(opts.nextHealth === null ? {} : {Health: {Status: opts.nextHealth}}),
                },
            });
            mockStackRepo.findByComposeProject.mockResolvedValue({
                id: "my-stack",
                status: "RUNNING",
                services: (opts.services ?? ["web"]).map((serviceName) => ({
                    serviceName,
                    containerState: "running",
                    healthStatus: serviceName === "web" ? opts.previousHealth : null,
                })),
            });
            mockStackRepo.updateServiceState.mockResolvedValue(undefined);
            mockStackRepo.updateStackStatus.mockResolvedValue(null);
            return {pollerWithBus, healthListener, emitted};
        }

        it("emits service.health_changed with the previous and next health after the Service row was written", async () => {
            const {pollerWithBus, healthListener} = setup({previousHealth: "healthy", nextHealth: "unhealthy"});

            await pollerWithBus.handleEvent(event);

            expect(healthListener).toHaveBeenCalledTimes(1);
            expect(healthListener).toHaveBeenCalledWith({
                stackId: "my-stack",
                serviceName: "web",
                fromStatus: "healthy",
                toStatus: "unhealthy",
                source: "docker-healthcheck",
            });
            const writeOrder = mockStackRepo.updateServiceState.mock.invocationCallOrder[0] ?? Infinity;
            const healthOrder = healthListener.mock.invocationCallOrder[0] ?? -Infinity;
            expect(writeOrder).toBeLessThan(healthOrder);
        });

        it("emits the health event before the existing container_state_changed event", async () => {
            const {pollerWithBus, emitted} = setup({previousHealth: "healthy", nextHealth: "unhealthy"});

            await pollerWithBus.handleEvent(event);

            expect(emitted).toEqual(["service.health_changed", "stack.container_state_changed"]);
        });

        it("records a transition to null when the health check clears", async () => {
            const {pollerWithBus, healthListener} = setup({previousHealth: "healthy", nextHealth: null});

            await pollerWithBus.handleEvent(event);

            expect(healthListener).toHaveBeenCalledWith(
                expect.objectContaining({fromStatus: "healthy", toStatus: null}),
            );
        });

        it("emits no health event when the health value is unchanged", async () => {
            const {pollerWithBus, healthListener, emitted} = setup({previousHealth: "healthy", nextHealth: "healthy"});

            await pollerWithBus.handleEvent(event);

            expect(healthListener).not.toHaveBeenCalled();
            expect(emitted).toEqual(["stack.container_state_changed"]);
        });

        it("emits no health event when the container's service has no Service row", async () => {
            const {pollerWithBus, healthListener, emitted} = setup({
                previousHealth: null,
                nextHealth: "healthy",
                services: ["db"],
            });

            await pollerWithBus.handleEvent(event);

            expect(healthListener).not.toHaveBeenCalled();
            expect(emitted).toEqual(["stack.container_state_changed"]);
        });
    });

    describe("handleEvent — skip conditions (OBS-03)", () => {
        it.each(TRANSITIONAL_STATES)(
            "skips update when stack.status is '%s' (transitional state)",
            async (transitionalStatus) => {
                const event = {
                    Type: "container",
                    Action: "start",
                    Actor: {
                        ID: "container-abc",
                        Attributes: {
                            "com.docker.compose.project": "my-stack",
                            "com.docker.compose.service": "web",
                        },
                    },
                };

                mockStackRepo.findByComposeProject.mockResolvedValue({
                    id: "my-stack",
                    status: transitionalStatus,
                    services: [],
                });

                await (poller as any).handleEvent(event);

                expect(mockDockerClient.inspectContainer).not.toHaveBeenCalled();
                expect(mockStackRepo.updateServiceState).not.toHaveBeenCalled();
            },
        );

        it("skips when container has no com.docker.compose.project label", async () => {
            const event = {
                Type: "container",
                Action: "start",
                Actor: {
                    ID: "container-abc",
                    // No compose labels — unmanaged container
                    Attributes: {},
                },
            };

            await (poller as any).handleEvent(event);

            expect(mockDockerClient.inspectContainer).not.toHaveBeenCalled();
            expect(mockStackRepo.updateServiceState).not.toHaveBeenCalled();
        });
    });

    describe("handleEvent — 404 path clears health (#23, D-12)", () => {
        const destroyEvent = {
            Type: "container",
            Action: "destroy",
            Actor: {
                ID: "container-web",
                Attributes: {
                    "com.docker.compose.project": "my-stack",
                    "com.docker.compose.service": "web",
                },
            },
        };

        function setupGone(storedHealth: string | null) {
            const bus = new InMemoryEventBus();
            const healthListener = vi.fn();
            bus.subscribe("service.health_changed", healthListener);
            const pollerWithBus = new StatePoller(mockDockerClient as any, mockStackRepo as any, bus);

            mockDockerClient.inspectContainer.mockRejectedValue(Object.assign(new Error("gone"), {statusCode: 404}));
            mockStackRepo.findByComposeProject.mockResolvedValue({
                id: "my-stack",
                status: "RUNNING",
                services: [{serviceName: "web", containerState: "running", healthStatus: storedHealth}],
            });
            mockStackRepo.updateServiceState.mockResolvedValue(undefined);
            mockStackRepo.updateStackStatus.mockResolvedValue(null);
            return {pollerWithBus, healthListener};
        }

        it("emits service.health_changed to null after the write when the stored health was non-null", async () => {
            const {pollerWithBus, healthListener} = setupGone("healthy");

            await pollerWithBus.handleEvent(destroyEvent);

            expect(healthListener).toHaveBeenCalledTimes(1);
            expect(healthListener).toHaveBeenCalledWith({
                stackId: "my-stack",
                serviceName: "web",
                fromStatus: "healthy",
                toStatus: null,
                source: "docker-healthcheck",
            });
            const writeOrder = mockStackRepo.updateServiceState.mock.invocationCallOrder[0] ?? Infinity;
            const healthOrder = healthListener.mock.invocationCallOrder[0] ?? -Infinity;
            expect(writeOrder).toBeLessThan(healthOrder);
        });

        it("emits nothing when the stored health was already null", async () => {
            const {pollerWithBus, healthListener} = setupGone(null);

            await pollerWithBus.handleEvent(destroyEvent);

            expect(healthListener).not.toHaveBeenCalled();
        });
    });

    describe("reconcile (OBS-04)", () => {
        function mockOneContainerStack(overrides: {stackStatus?: string; storedHealth?: string | null} = {}) {
            mockDockerClient.listContainers.mockResolvedValue([
                {
                    Id: "c1",
                    State: "running",
                    Labels: {
                        "com.docker.compose.project": "docktor-proxy",
                        "com.docker.compose.service": "nginx",
                    },
                },
            ]);
            mockStackRepo.findByComposeProject.mockResolvedValue({
                id: "docktor-proxy",
                status: overrides.stackStatus ?? "RUNNING",
                services: [{serviceName: "nginx", containerState: "running", healthStatus: overrides.storedHealth ?? null}],
            });
            mockStackRepo.updateServiceState.mockResolvedValue(undefined);
            // Default: a running container with no healthcheck.
            mockDockerClient.inspectContainer.mockResolvedValue({Id: "c1", State: {Status: "running"}});
        }

        function inspectedWithHealth(health: string) {
            mockDockerClient.inspectContainer.mockResolvedValue({
                Id: "c1",
                State: {Status: "running", Health: {Status: health}},
            });
        }

        // reconcile() is protected — invoked through a narrow structural cast
        // (not `as any`) per CLAUDE.md's cast-comment rule, since the test
        // only needs the one method it calls.
        async function callReconcile(p: StatePoller): Promise<void> {
            await (p as unknown as {reconcile(): Promise<void>}).reconcile();
        }

        it("calls dockerode.listContainers and updates all matched services in DB", async () => {
            mockOneContainerStack();
            mockStackRepo.updateStackStatus.mockResolvedValue(null);

            await callReconcile(poller);

            expect(mockDockerClient.listContainers).toHaveBeenCalledTimes(1);
            expect(mockDockerClient.listContainers).toHaveBeenCalledWith(true);
            expect(mockStackRepo.updateServiceState).toHaveBeenCalledTimes(1);
            expect(mockStackRepo.updateServiceState).toHaveBeenCalledWith({
                stackId: "docktor-proxy",
                serviceName: "nginx",
                containerId: "c1",
                containerState: "running",
                healthStatus: null,
            });
        });

        it.each(TRANSITIONAL_STATES)(
            "does not update stacks in transitional states (%s)",
            async (transitionalStatus) => {
                mockOneContainerStack({stackStatus: transitionalStatus});

                await callReconcile(poller);

                expect(mockStackRepo.updateServiceState).not.toHaveBeenCalled();
                expect(mockStackRepo.updateStackStatus).not.toHaveBeenCalled();
            },
        );

        it("emits stack.status_changed exactly once end-to-end, and NotificationWatcher logs it exactly once, across a real transition followed by a steady-state tick", async () => {
            const bus = new InMemoryEventBus();
            const watcher = new NotificationWatcher(
                {notify: vi.fn().mockResolvedValue(undefined)},
                bus,
            );
            await watcher.start();

            const pollerWithBus = new StatePoller(mockDockerClient as any, mockStackRepo as any, bus);
            mockOneContainerStack();

            const statusLogFixture = {
                id: "log-1",
                fromStatus: "STOPPED" as const,
                toStatus: "RUNNING" as const,
                message: "Status detected via container events",
                createdAt: new Date("2026-01-01T00:00:00Z"),
            };

            const listener = vi.fn();
            bus.subscribe("stack.status_changed", listener);

            const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);

            try {
                // Tick 1: a real STOPPED -> RUNNING transition.
                mockStackRepo.updateStackStatus.mockResolvedValueOnce(statusLogFixture);
                await callReconcile(pollerWithBus);

                // Tick 2: unchanged — the repository returns null.
                mockStackRepo.updateStackStatus.mockResolvedValueOnce(null);
                await callReconcile(pollerWithBus);

                const receivedLines = consoleLog.mock.calls.filter(
                    (call) => typeof call[0] === "string" && call[0].includes("Received status change"),
                );
                expect(receivedLines).toHaveLength(1);

                expect(listener).toHaveBeenCalledTimes(1);
                expect(listener).toHaveBeenCalledWith({stackId: "docktor-proxy", status: "RUNNING"});
            } finally {
                consoleLog.mockRestore();
                await watcher.stop();
            }
        });

        describe("real Docker health (#23, RESEARCH Finding 4)", () => {
            function busWithHealthListener() {
                const bus = new InMemoryEventBus();
                const healthListener = vi.fn();
                bus.subscribe("service.health_changed", healthListener);
                return {bus, healthListener, pollerWithBus: new StatePoller(mockDockerClient as any, mockStackRepo as any, bus)};
            }

            it("writes the inspected health and derives HEALTHY, with no event when health is unchanged", async () => {
                const {healthListener, pollerWithBus} = busWithHealthListener();
                mockOneContainerStack({storedHealth: "healthy"});
                inspectedWithHealth("healthy");
                mockStackRepo.updateStackStatus.mockResolvedValue(null);

                await callReconcile(pollerWithBus);

                expect(mockDockerClient.inspectContainer).toHaveBeenCalledWith("c1");
                expect(mockStackRepo.updateServiceState).toHaveBeenCalledWith({
                    stackId: "docktor-proxy",
                    serviceName: "nginx",
                    containerId: "c1",
                    containerState: "running",
                    healthStatus: "healthy",
                });
                expect(mockStackRepo.updateStackStatus).toHaveBeenCalledWith("docktor-proxy", "HEALTHY");
                expect(healthListener).not.toHaveBeenCalled();
            });

            it("emits service.health_changed after the write when the inspected health changed, and derives UNHEALTHY", async () => {
                const {healthListener, pollerWithBus} = busWithHealthListener();
                mockOneContainerStack({storedHealth: "healthy"});
                inspectedWithHealth("unhealthy");
                mockStackRepo.updateStackStatus.mockResolvedValue(null);

                await callReconcile(pollerWithBus);

                expect(mockStackRepo.updateServiceState).toHaveBeenCalledWith(
                    expect.objectContaining({healthStatus: "unhealthy"}),
                );
                expect(mockStackRepo.updateStackStatus).toHaveBeenCalledWith("docktor-proxy", "UNHEALTHY");
                expect(healthListener).toHaveBeenCalledTimes(1);
                expect(healthListener).toHaveBeenCalledWith({
                    stackId: "docktor-proxy",
                    serviceName: "nginx",
                    fromStatus: "healthy",
                    toStatus: "unhealthy",
                    source: "docker-healthcheck",
                });
                const writeOrder = mockStackRepo.updateServiceState.mock.invocationCallOrder[0] ?? Infinity;
                const healthOrder = healthListener.mock.invocationCallOrder[0] ?? -Infinity;
                expect(writeOrder).toBeLessThan(healthOrder);
            });

            it("keeps the stored health, emits nothing and continues with the next project when inspect rejects", async () => {
                const {healthListener, pollerWithBus} = busWithHealthListener();
                mockDockerClient.listContainers.mockResolvedValue([
                    {
                        Id: "c1",
                        State: "running",
                        Labels: {"com.docker.compose.project": "first", "com.docker.compose.service": "nginx"},
                    },
                    {
                        Id: "c2",
                        State: "running",
                        Labels: {"com.docker.compose.project": "second", "com.docker.compose.service": "api"},
                    },
                ]);
                mockStackRepo.findByComposeProject.mockImplementation(async (project: string) =>
                    project === "first"
                        ? {id: "first", status: "RUNNING", services: [{serviceName: "nginx", containerState: "running", healthStatus: "healthy"}]}
                        : {id: "second", status: "RUNNING", services: [{serviceName: "api", containerState: "running", healthStatus: null}]},
                );
                mockDockerClient.inspectContainer.mockImplementation(async (id: string) => {
                    if (id === "c1") throw new Error("docker hiccup");
                    return {Id: id, State: {Status: "running"}};
                });
                mockStackRepo.updateServiceState.mockResolvedValue(undefined);
                mockStackRepo.updateStackStatus.mockResolvedValue(null);

                await callReconcile(pollerWithBus);

                expect(mockStackRepo.updateServiceState).toHaveBeenCalledWith({
                    stackId: "first",
                    serviceName: "nginx",
                    containerId: "c1",
                    containerState: "running",
                    healthStatus: "healthy",
                });
                expect(mockStackRepo.updateStackStatus).toHaveBeenCalledWith("first", "HEALTHY");
                expect(mockStackRepo.updateServiceState).toHaveBeenCalledWith(
                    expect.objectContaining({stackId: "second", serviceName: "api"}),
                );
                expect(healthListener).not.toHaveBeenCalled();
            });

            it("emits no stack.status_changed for a steady UNHEALTHY stack, so NotificationWatcher's timer is not cancelled", async () => {
                const bus = new InMemoryEventBus();
                const emitSpy = vi.spyOn(bus, "emit");
                const pollerWithBus = new StatePoller(mockDockerClient as any, mockStackRepo as any, bus);
                mockOneContainerStack({stackStatus: "UNHEALTHY", storedHealth: "unhealthy"});
                inspectedWithHealth("unhealthy");
                // The repository reports no change: the stack is already UNHEALTHY.
                mockStackRepo.updateStackStatus.mockResolvedValue(null);

                await callReconcile(pollerWithBus);

                expect(mockStackRepo.updateStackStatus).toHaveBeenCalledWith("docktor-proxy", "UNHEALTHY");
                expect(emitSpy).not.toHaveBeenCalledWith("stack.status_changed", expect.anything());
                expect(emitSpy).not.toHaveBeenCalledWith("service.health_changed", expect.anything());
            });

            it("keeps the exited/null default for a service with no container", async () => {
                mockOneContainerStack();
                inspectedWithHealth("healthy");
                mockStackRepo.findByComposeProject.mockResolvedValue({
                    id: "docktor-proxy",
                    status: "RUNNING",
                    services: [
                        {serviceName: "nginx", containerState: "running", healthStatus: "healthy"},
                        {serviceName: "worker", containerState: "running", healthStatus: "unhealthy"},
                    ],
                });
                mockStackRepo.updateStackStatus.mockResolvedValue(null);

                await callReconcile(poller);

                // worker has no container: it is derived as exited with null health, so its
                // stale stored "unhealthy" does not leak into the derived stack status.
                expect(mockStackRepo.updateServiceState).toHaveBeenCalledTimes(1);
                expect(mockStackRepo.updateStackStatus).toHaveBeenCalledWith("docktor-proxy", "HEALTHY");
            });
        });

        it("emits nothing on stack.status_changed when a tick's status is unchanged, but still updates the service row", async () => {
            const bus = new InMemoryEventBus();
            const pollerWithBus = new StatePoller(mockDockerClient as any, mockStackRepo as any, bus);
            mockOneContainerStack();
            mockStackRepo.updateStackStatus.mockResolvedValue(null);

            const listener = vi.fn();
            bus.subscribe("stack.status_changed", listener);

            await callReconcile(pollerWithBus);

            expect(listener).not.toHaveBeenCalled();
            expect(mockStackRepo.updateServiceState).toHaveBeenCalledTimes(1);
        });
    });
});
