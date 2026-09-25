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

    describe("reconcile (OBS-04)", () => {
        function mockOneContainerStack(overrides: {stackStatus?: string} = {}) {
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
                services: [{serviceName: "nginx"}],
            });
            mockStackRepo.updateServiceState.mockResolvedValue(undefined);
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
