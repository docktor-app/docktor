import {beforeEach, describe, expect, it, vi} from "vitest";
import {
    ContainerStateCatchUp,
    type ContainerStateCatchUpRepo,
} from "../../../src/application/container-state-catch-up.js";

const PROJECT_LABEL = "com.docker.compose.project";
const SERVICE_LABEL = "com.docker.compose.service";

function container(id: string, project: string, service: string, state = "running") {
    return {Id: id, State: state, Labels: {[PROJECT_LABEL]: project, [SERVICE_LABEL]: service}};
}

function createMockDocker() {
    return {
        listContainers: vi.fn(),
        inspectContainer: vi.fn(),
    };
}

function createMockRepo() {
    return {
        findByComposeProject: vi.fn(),
        updateServiceState: vi.fn().mockResolvedValue(undefined),
        updateStackStatus: vi.fn().mockResolvedValue(null),
    };
}

function createMockBus() {
    return {emit: vi.fn()};
}

describe("ContainerStateCatchUp", () => {
    let docker: ReturnType<typeof createMockDocker>;
    let repo: ReturnType<typeof createMockRepo>;
    let bus: ReturnType<typeof createMockBus>;
    let catchUp: ContainerStateCatchUp;

    beforeEach(() => {
        docker = createMockDocker();
        repo = createMockRepo();
        bus = createMockBus();
        catchUp = new ContainerStateCatchUp(
            docker,
            repo as unknown as ContainerStateCatchUpRepo,
            bus,
        );
    });

    function givenStack(
        status: string,
        serviceNames: string[],
        storedHealth: Record<string, string | null> = {},
    ): void {
        repo.findByComposeProject.mockResolvedValue({
            id: "my-app",
            status,
            services: serviceNames.map((serviceName) => ({
                serviceName,
                healthStatus: storedHealth[serviceName] ?? null,
            })),
        });
    }

    function givenRunningWebAndDb(): void {
        // web's stored health already matches what inspect reports, so the
        // happy path observes no health transition.
        givenStack("RUNNING", ["web", "db"], {web: "healthy"});
        docker.listContainers.mockResolvedValue([
            container("c-web", "my-app", "web"),
            container("c-db", "my-app", "db"),
            container("c-other", "other", "other-svc"),
        ]);
        docker.inspectContainer.mockImplementation(async (id: string) =>
            id === "c-web"
                ? {Id: id, State: {Status: "running", Health: {Status: "healthy"}}}
                : {Id: id, State: {Status: "running"}},
        );
    }

    describe("happy path", () => {
        it("lists all containers and inspects only those of the stack's compose project", async () => {
            givenRunningWebAndDb();

            await catchUp.catchUp("my-app");

            expect(docker.listContainers).toHaveBeenCalledWith(true);
            expect(docker.inspectContainer).toHaveBeenCalledTimes(2);
            expect(docker.inspectContainer).toHaveBeenCalledWith("c-web");
            expect(docker.inspectContainer).toHaveBeenCalledWith("c-db");
        });

        it("writes each service's real container state and health", async () => {
            givenRunningWebAndDb();

            await catchUp.catchUp("my-app");

            expect(repo.updateServiceState).toHaveBeenCalledTimes(2);
            expect(repo.updateServiceState).toHaveBeenCalledWith({
                stackId: "my-app",
                serviceName: "web",
                containerId: "c-web",
                containerState: "running",
                healthStatus: "healthy",
            });
            expect(repo.updateServiceState).toHaveBeenCalledWith({
                stackId: "my-app",
                serviceName: "db",
                containerId: "c-db",
                containerState: "running",
                healthStatus: null,
            });
        });

        it("derives the stack status once with the shared rule", async () => {
            givenRunningWebAndDb();

            await catchUp.catchUp("my-app");

            expect(repo.updateStackStatus).toHaveBeenCalledTimes(1);
            expect(repo.updateStackStatus).toHaveBeenCalledWith("my-app", "HEALTHY");
        });

        it("emits one container_state_changed per Service row in row order, each carrying the derived stack status", async () => {
            givenRunningWebAndDb();

            await catchUp.catchUp("my-app");

            expect(bus.emit).toHaveBeenCalledTimes(2);
            expect(bus.emit).toHaveBeenNthCalledWith(1, "stack.container_state_changed", {
                stackId: "my-app",
                serviceName: "web",
                containerState: "running",
                healthStatus: "healthy",
                stackStatus: "HEALTHY",
            });
            expect(bus.emit).toHaveBeenNthCalledWith(2, "stack.container_state_changed", {
                stackId: "my-app",
                serviceName: "db",
                containerState: "running",
                healthStatus: null,
                stackStatus: "HEALTHY",
            });
        });

        it("attaches the status-log entry to the first event only, with an ISO createdAt", async () => {
            givenRunningWebAndDb();
            const createdAt = new Date("2026-01-02T03:04:05.000Z");
            repo.updateStackStatus.mockResolvedValue({
                id: "log-1",
                fromStatus: "RUNNING",
                toStatus: "HEALTHY",
                message: "Status detected via container events",
                createdAt,
            });

            await catchUp.catchUp("my-app");

            const [first, second] = bus.emit.mock.calls.map((call) => call[1]);
            expect(first.statusLog).toEqual({
                id: "log-1",
                fromStatus: "RUNNING",
                toStatus: "HEALTHY",
                message: "Status detected via container events",
                createdAt: "2026-01-02T03:04:05.000Z",
            });
            expect(second).not.toHaveProperty("statusLog");
        });

        it("emits only after every database write has completed", async () => {
            givenRunningWebAndDb();

            await catchUp.catchUp("my-app");

            const lastWrite = Math.max(
                ...repo.updateServiceState.mock.invocationCallOrder,
                ...repo.updateStackStatus.mock.invocationCallOrder,
            );
            const firstEmit = Math.min(...bus.emit.mock.invocationCallOrder);
            expect(firstEmit).toBeGreaterThan(lastWrite);
        });
    });

    describe("services without a usable container", () => {
        it("writes a service with no matching container as exited with no container id, and still emits for it", async () => {
            givenStack("RUNNING", ["web", "worker"]);
            docker.listContainers.mockResolvedValue([container("c-web", "my-app", "web")]);
            docker.inspectContainer.mockResolvedValue({Id: "c-web", State: {Status: "running"}});

            await catchUp.catchUp("my-app");

            expect(repo.updateServiceState).toHaveBeenCalledWith({
                stackId: "my-app",
                serviceName: "worker",
                containerId: null,
                containerState: "exited",
                healthStatus: null,
            });
            expect(bus.emit).toHaveBeenCalledTimes(2);
            expect(bus.emit).toHaveBeenNthCalledWith(
                2,
                "stack.container_state_changed",
                expect.objectContaining({serviceName: "worker", containerState: "exited", healthStatus: null}),
            );
            expect(repo.updateStackStatus).toHaveBeenCalledWith("my-app", "RUNNING");
        });

        it("never invents a running state: a stack whose containers are all missing is STOPPED", async () => {
            givenStack("RUNNING", ["web"]);
            docker.listContainers.mockResolvedValue([]);

            await catchUp.catchUp("my-app");

            expect(repo.updateStackStatus).toHaveBeenCalledWith("my-app", "STOPPED");
            expect(docker.inspectContainer).not.toHaveBeenCalled();
        });

        it("falls back to the list summary state with no health when inspecting a container fails", async () => {
            givenStack("RUNNING", ["web"]);
            docker.listContainers.mockResolvedValue([container("c-web", "my-app", "web", "restarting")]);
            docker.inspectContainer.mockRejectedValue(new Error("No such container"));

            await catchUp.catchUp("my-app");

            expect(repo.updateServiceState).toHaveBeenCalledWith({
                stackId: "my-app",
                serviceName: "web",
                containerId: "c-web",
                containerState: "restarting",
                healthStatus: null,
            });
            expect(repo.updateStackStatus).toHaveBeenCalledWith("my-app", "ERROR");
        });
    });

    describe("health transitions (#23, D-12)", () => {
        function healthEvents(): Array<Record<string, unknown>> {
            return bus.emit.mock.calls
                .filter((call) => call[0] === "service.health_changed")
                .map((call) => call[1]);
        }

        it("keeps the stored health, and emits no health event, when inspecting a container fails", async () => {
            givenStack("RUNNING", ["web"], {web: "healthy"});
            docker.listContainers.mockResolvedValue([container("c-web", "my-app", "web", "running")]);
            docker.inspectContainer.mockRejectedValue(new Error("No such container"));

            await catchUp.catchUp("my-app");

            expect(repo.updateServiceState).toHaveBeenCalledWith({
                stackId: "my-app",
                serviceName: "web",
                containerId: "c-web",
                containerState: "running",
                healthStatus: "healthy",
            });
            expect(healthEvents()).toEqual([]);
        });

        it("writes the new health and emits one service.health_changed after all writes, before container_state_changed", async () => {
            givenStack("RUNNING", ["web", "db"], {web: "healthy"});
            docker.listContainers.mockResolvedValue([
                container("c-web", "my-app", "web"),
                container("c-db", "my-app", "db"),
            ]);
            docker.inspectContainer.mockImplementation(async (id: string) =>
                id === "c-web"
                    ? {Id: id, State: {Status: "running", Health: {Status: "unhealthy"}}}
                    : {Id: id, State: {Status: "running"}},
            );

            await catchUp.catchUp("my-app");

            expect(repo.updateServiceState).toHaveBeenCalledWith(
                expect.objectContaining({serviceName: "web", healthStatus: "unhealthy"}),
            );
            expect(healthEvents()).toEqual([
                {
                    stackId: "my-app",
                    serviceName: "web",
                    fromStatus: "healthy",
                    toStatus: "unhealthy",
                    source: "docker-healthcheck",
                },
            ]);

            const lastWrite = Math.max(
                ...repo.updateServiceState.mock.invocationCallOrder,
                ...repo.updateStackStatus.mock.invocationCallOrder,
            );
            const healthIndex = bus.emit.mock.calls.findIndex((call) => call[0] === "service.health_changed");
            const stateIndex = bus.emit.mock.calls.findIndex((call) => call[0] === "stack.container_state_changed");
            expect(bus.emit.mock.invocationCallOrder[healthIndex]).toBeGreaterThan(lastWrite);
            expect(healthIndex).toBeLessThan(stateIndex);
        });

        it("clears health to null and emits healthy -> null when the container is missing", async () => {
            givenStack("RUNNING", ["web"], {web: "healthy"});
            docker.listContainers.mockResolvedValue([]);

            await catchUp.catchUp("my-app");

            expect(repo.updateServiceState).toHaveBeenCalledWith({
                stackId: "my-app",
                serviceName: "web",
                containerId: null,
                containerState: "exited",
                healthStatus: null,
            });
            expect(healthEvents()).toEqual([
                {
                    stackId: "my-app",
                    serviceName: "web",
                    fromStatus: "healthy",
                    toStatus: null,
                    source: "docker-healthcheck",
                },
            ]);
        });

        it("emits no health event when no service's health changed", async () => {
            givenRunningWebAndDb();

            await catchUp.catchUp("my-app");

            expect(healthEvents()).toEqual([]);
        });
    });

    describe("guards", () => {
        it("does nothing for a stack that is no longer found", async () => {
            repo.findByComposeProject.mockResolvedValue(null);

            await catchUp.catchUp("my-app");

            expect(docker.listContainers).not.toHaveBeenCalled();
            expect(repo.updateServiceState).not.toHaveBeenCalled();
            expect(repo.updateStackStatus).not.toHaveBeenCalled();
            expect(bus.emit).not.toHaveBeenCalled();
        });

        it.each(["DEPLOYING", "UPDATING", "BACKING_UP", "RESTORING", "MIGRATING"])(
            "writes and emits nothing when another operation has moved the stack to %s",
            async (status) => {
                givenStack(status, ["web"]);

                await catchUp.catchUp("my-app");

                expect(docker.listContainers).not.toHaveBeenCalled();
                expect(repo.updateServiceState).not.toHaveBeenCalled();
                expect(repo.updateStackStatus).not.toHaveBeenCalled();
                expect(bus.emit).not.toHaveBeenCalled();
            },
        );

        it("does nothing for a stack with zero Service rows", async () => {
            givenStack("RUNNING", []);

            await catchUp.catchUp("my-app");

            expect(docker.listContainers).not.toHaveBeenCalled();
            expect(repo.updateServiceState).not.toHaveBeenCalled();
            expect(repo.updateStackStatus).not.toHaveBeenCalled();
            expect(bus.emit).not.toHaveBeenCalled();
        });
    });

    describe("never rejects", () => {
        it("logs and resolves without writes or events when listing containers fails", async () => {
            const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
            givenStack("RUNNING", ["web"]);
            docker.listContainers.mockRejectedValue(new Error("docker socket gone"));

            await expect(catchUp.catchUp("my-app")).resolves.toBeUndefined();

            expect(repo.updateServiceState).not.toHaveBeenCalled();
            expect(bus.emit).not.toHaveBeenCalled();
            expect(consoleErrorSpy).toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
        });

        it("logs and resolves without emitting when a service write fails", async () => {
            const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
            givenRunningWebAndDb();
            repo.updateServiceState.mockRejectedValue(new Error("DB unavailable"));

            await expect(catchUp.catchUp("my-app")).resolves.toBeUndefined();

            expect(bus.emit).not.toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
        });

        it("logs and resolves when reading the stack fails", async () => {
            const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
            repo.findByComposeProject.mockRejectedValue(new Error("DB unavailable"));

            await expect(catchUp.catchUp("my-app")).resolves.toBeUndefined();

            expect(consoleErrorSpy).toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
        });
    });

    describe("failure branch and idempotency", () => {
        it("replaces a just-set ERROR with the status derived from real containers", async () => {
            givenStack("ERROR", ["web", "db"]);
            docker.listContainers.mockResolvedValue([
                container("c-web", "my-app", "web"),
                container("c-db", "my-app", "db"),
            ]);
            docker.inspectContainer.mockResolvedValue({State: {Status: "running"}});

            await catchUp.catchUp("my-app");

            expect(repo.updateStackStatus).toHaveBeenCalledWith("my-app", "RUNNING");
        });

        it("on a second run against unchanged containers writes the same rows and emits identical payloads minus the status log", async () => {
            givenRunningWebAndDb();
            repo.updateStackStatus
                .mockResolvedValueOnce({
                    id: "log-1",
                    fromStatus: "RUNNING",
                    toStatus: "HEALTHY",
                    message: null,
                    createdAt: new Date("2026-01-02T03:04:05.000Z"),
                })
                .mockResolvedValueOnce(null);

            await catchUp.catchUp("my-app");
            const firstWrites = repo.updateServiceState.mock.calls.map((call) => call[0]);
            const firstEvents = bus.emit.mock.calls.map((call) => call[1]);
            repo.updateServiceState.mockClear();
            bus.emit.mockClear();

            await catchUp.catchUp("my-app");
            const secondWrites = repo.updateServiceState.mock.calls.map((call) => call[0]);
            const secondEvents = bus.emit.mock.calls.map((call) => call[1]);

            expect(secondWrites).toEqual(firstWrites);
            expect(firstEvents[0]).toHaveProperty("statusLog");
            expect(secondEvents).toEqual(
                firstEvents.map(({statusLog: _statusLog, ...rest}) => rest),
            );
        });
    });
});
