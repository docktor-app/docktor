import {beforeEach, describe, expect, it, vi} from "vitest";
import {StatePoller} from "../../../src/jobs/state-poller.js";
import {InMemoryEventBus} from "../../../src/infrastructure/event-bus.js";

// Container identity for probe-owned services (D-08, WR-05, WR-11). The
// existing probe-owned (D-07) cases stay in state-poller.test.ts.

const PROJECT = "my-stack";
const OWNED = {
    isProbeOwned: (stackId: string, serviceName: string) => stackId === PROJECT && serviceName === "web",
};

function createMockDocker() {
    return {
        getEventStream: vi.fn(),
        inspectContainer: vi.fn(),
        listContainers: vi.fn(),
    };
}

function createMockRepo() {
    return {
        findByComposeProject: vi.fn(),
        findAll: vi.fn(),
        updateServiceState: vi.fn().mockResolvedValue(undefined),
        updateStackStatus: vi.fn().mockResolvedValue(null),
    };
}

function dockerEvent(action: string, serviceName: string, containerId: string) {
    return {
        Type: "container",
        Action: action,
        Actor: {
            ID: containerId,
            Attributes: {
                "com.docker.compose.project": PROJECT,
                "com.docker.compose.service": serviceName,
            },
        },
    };
}

function listed(containerId: string, serviceName: string, state = "running") {
    return {
        Id: containerId,
        State: state,
        Labels: {"com.docker.compose.project": PROJECT, "com.docker.compose.service": serviceName},
    };
}

describe("StatePoller container identity for probe-owned services", () => {
    let docker: ReturnType<typeof createMockDocker>;
    let repo: ReturnType<typeof createMockRepo>;
    let healthListener: ReturnType<typeof vi.fn>;
    let stateListener: ReturnType<typeof vi.fn>;
    let statusListener: ReturnType<typeof vi.fn>;
    let poller: StatePoller;

    beforeEach(() => {
        vi.spyOn(console, "log").mockImplementation(() => undefined);
        docker = createMockDocker();
        repo = createMockRepo();
        const bus = new InMemoryEventBus();
        healthListener = vi.fn();
        stateListener = vi.fn();
        statusListener = vi.fn();
        bus.subscribe("service.health_changed", healthListener);
        bus.subscribe("stack.container_state_changed", stateListener);
        bus.subscribe("stack.status_changed", statusListener);
        poller = new StatePoller(docker as never, repo as never, bus, OWNED);
    });

    function givenWeb(status: string, containerId: string, healthStatus: string | null): void {
        repo.findByComposeProject.mockResolvedValue({
            id: PROJECT,
            status,
            services: [{serviceName: "web", containerId, containerState: "running", healthStatus}],
        });
    }

    async function callReconcile(): Promise<void> {
        // reconcile() is protected; this narrow structural cast only exposes that one method.
        await (poller as unknown as {reconcile(): Promise<void>}).reconcile();
    }

    describe("Docker start event (WR-05)", () => {
        it("resets a running probe-owned service to starting, derives RUNNING and records an http-probe transition after the write", async () => {
            givenWeb("HEALTHY", "c1", "healthy");
            docker.inspectContainer.mockResolvedValue({
                Id: "c1",
                State: {Status: "running", Health: {Status: "healthy"}},
            });

            await poller.handleEvent(dockerEvent("start", "web", "c1"));

            expect(repo.updateServiceState).toHaveBeenCalledWith({
                stackId: PROJECT,
                serviceName: "web",
                containerId: "c1",
                containerState: "running",
                healthStatus: "starting",
            });
            expect(repo.updateStackStatus).toHaveBeenCalledWith(PROJECT, "RUNNING");
            expect(healthListener).toHaveBeenCalledExactlyOnceWith({
                stackId: PROJECT,
                serviceName: "web",
                fromStatus: "healthy",
                toStatus: "starting",
                source: "http-probe",
            });
            expect(stateListener).toHaveBeenCalledWith(
                expect.objectContaining({serviceName: "web", healthStatus: "starting", stackStatus: "RUNNING"}),
            );
            const write = repo.updateServiceState.mock.invocationCallOrder[0] as number;
            const emitted = healthListener.mock.invocationCallOrder[0] as number;
            expect(emitted).toBeGreaterThan(write);
        });

        it("writes null with an http-probe transition when the started container is not running", async () => {
            givenWeb("HEALTHY", "c1", "healthy");
            docker.inspectContainer.mockResolvedValue({Id: "c1", State: {Status: "exited"}});

            await poller.handleEvent(dockerEvent("start", "web", "c1"));

            expect(repo.updateServiceState).toHaveBeenCalledWith(
                expect.objectContaining({containerState: "exited", healthStatus: null}),
            );
            expect(healthListener).toHaveBeenCalledExactlyOnceWith({
                stackId: PROJECT,
                serviceName: "web",
                fromStatus: "healthy",
                toStatus: null,
                source: "http-probe",
            });
        });

        it("keeps the stored probe health on a health_status event for the same container (D-07)", async () => {
            givenWeb("HEALTHY", "c1", "healthy");
            docker.inspectContainer.mockResolvedValue({
                Id: "c1",
                State: {Status: "running", Health: {Status: "unhealthy"}},
            });

            await poller.handleEvent(dockerEvent("health_status: unhealthy", "web", "c1"));

            expect(repo.updateServiceState).toHaveBeenCalledWith(
                expect.objectContaining({serviceName: "web", healthStatus: "healthy"}),
            );
            expect(healthListener).not.toHaveBeenCalled();
        });

        it("gives a non-owned service Docker's health and a docker-healthcheck transition on start", async () => {
            repo.findByComposeProject.mockResolvedValue({
                id: PROJECT,
                status: "RUNNING",
                services: [{serviceName: "db", containerId: "c-db", containerState: "running", healthStatus: "unhealthy"}],
            });
            docker.inspectContainer.mockResolvedValue({
                Id: "c-db",
                State: {Status: "running", Health: {Status: "healthy"}},
            });

            await poller.handleEvent(dockerEvent("start", "db", "c-db"));

            expect(repo.updateServiceState).toHaveBeenCalledWith(
                expect.objectContaining({serviceName: "db", healthStatus: "healthy"}),
            );
            expect(healthListener).toHaveBeenCalledExactlyOnceWith({
                stackId: PROJECT,
                serviceName: "db",
                fromStatus: "unhealthy",
                toStatus: "healthy",
                source: "docker-healthcheck",
            });
        });
    });

    describe("reconcile (WR-05)", () => {
        it("resets a probe-owned service whose single container was replaced to starting and re-derives the stack", async () => {
            givenWeb("UNHEALTHY", "c1", "unhealthy");
            docker.listContainers.mockResolvedValue([listed("c2", "web")]);
            docker.inspectContainer.mockResolvedValue({
                Id: "c2",
                State: {Status: "running", Health: {Status: "unhealthy"}},
            });
            repo.updateStackStatus.mockResolvedValue({
                id: "log-1",
                fromStatus: "UNHEALTHY",
                toStatus: "RUNNING",
                message: null,
                createdAt: new Date(),
            });

            await callReconcile();

            expect(repo.updateServiceState).toHaveBeenCalledWith({
                stackId: PROJECT,
                serviceName: "web",
                containerId: "c2",
                containerState: "running",
                healthStatus: "starting",
            });
            expect(repo.updateStackStatus).toHaveBeenCalledWith(PROJECT, "RUNNING");
            expect(statusListener).toHaveBeenCalledWith({stackId: PROJECT, status: "RUNNING"});
            expect(healthListener).toHaveBeenCalledExactlyOnceWith({
                stackId: PROJECT,
                serviceName: "web",
                fromStatus: "unhealthy",
                toStatus: "starting",
                source: "http-probe",
            });
        });

        it("resets from the list state when inspect fails for a replaced container", async () => {
            givenWeb("UNHEALTHY", "c1", "unhealthy");
            docker.listContainers.mockResolvedValue([listed("c2", "web")]);
            docker.inspectContainer.mockRejectedValue(new Error("inspect failed"));

            await callReconcile();

            expect(repo.updateServiceState).toHaveBeenCalledWith(
                expect.objectContaining({containerId: "c2", containerState: "running", healthStatus: "starting"}),
            );
        });

        it("keeps the stored health for a scaled service whose stored id matches neither container", async () => {
            givenWeb("UNHEALTHY", "c-old", "unhealthy");
            docker.listContainers.mockResolvedValue([listed("c-a", "web"), listed("c-b", "web")]);
            docker.inspectContainer.mockResolvedValue({Id: "c-a", State: {Status: "running"}});

            await callReconcile();

            for (const call of repo.updateServiceState.mock.calls) {
                expect(call[0]).toMatchObject({serviceName: "web", healthStatus: "unhealthy"});
            }
            expect(healthListener).not.toHaveBeenCalled();
        });

        it("keeps the stored health when the container id is unchanged", async () => {
            givenWeb("UNHEALTHY", "c1", "unhealthy");
            docker.listContainers.mockResolvedValue([listed("c1", "web")]);
            docker.inspectContainer.mockResolvedValue({
                Id: "c1",
                State: {Status: "running", Health: {Status: "healthy"}},
            });

            await callReconcile();

            expect(repo.updateServiceState).toHaveBeenCalledWith(
                expect.objectContaining({serviceName: "web", healthStatus: "unhealthy"}),
            );
            expect(healthListener).not.toHaveBeenCalled();
        });
    });

    describe("container gone (WR-11)", () => {
        const gone = () => Object.assign(new Error("gone"), {statusCode: 404});

        it("attributes the clear of a probe-owned service to the probe", async () => {
            givenWeb("HEALTHY", "c1", "healthy");
            docker.inspectContainer.mockRejectedValue(gone());

            await poller.handleEvent(dockerEvent("destroy", "web", "c1"));

            expect(repo.updateServiceState).toHaveBeenCalledWith(
                expect.objectContaining({containerState: "exited", healthStatus: null}),
            );
            expect(healthListener).toHaveBeenCalledExactlyOnceWith({
                stackId: PROJECT,
                serviceName: "web",
                fromStatus: "healthy",
                toStatus: null,
                source: "http-probe",
            });
        });

        it("keeps docker-healthcheck as the source for a non-owned service", async () => {
            repo.findByComposeProject.mockResolvedValue({
                id: PROJECT,
                status: "HEALTHY",
                services: [{serviceName: "db", containerId: "c-db", containerState: "running", healthStatus: "healthy"}],
            });
            docker.inspectContainer.mockRejectedValue(gone());

            await poller.handleEvent(dockerEvent("destroy", "db", "c-db"));

            expect(healthListener).toHaveBeenCalledExactlyOnceWith({
                stackId: PROJECT,
                serviceName: "db",
                fromStatus: "healthy",
                toStatus: null,
                source: "docker-healthcheck",
            });
        });
    });
});
