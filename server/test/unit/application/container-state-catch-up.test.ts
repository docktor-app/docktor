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

    function givenStack(status: string, serviceNames: string[]): void {
        repo.findByComposeProject.mockResolvedValue({
            id: "my-app",
            status,
            services: serviceNames.map((serviceName) => ({serviceName})),
        });
    }

    function givenRunningWebAndDb(): void {
        givenStack("RUNNING", ["web", "db"]);
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
});
