import {beforeEach, describe, expect, it, vi} from "vitest";
import {
    ContainerStateCatchUp,
    type ContainerStateCatchUpRepo,
} from "../../../src/application/container-state-catch-up.js";
import {
    ServiceHealthService,
    type ServiceHealthServiceRepo,
    type ServiceHealthServiceRow,
} from "../../../src/application/service-health-service.js";
import type {ServiceProbeCompletedEvent} from "../../../src/domain/events.js";
import type {ProbeOutcome} from "../../../src/domain/health-probe.js";

const STACK_ID = "my-app";
const PROJECT_LABEL = "com.docker.compose.project";
const SERVICE_LABEL = "com.docker.compose.service";
const FAIL_503: ProbeOutcome = {ok: false, reason: {kind: "http-status", status: 503}};
const OK_200: ProbeOutcome = {ok: true, status: 200};

function container(id: string, service: string, state = "running") {
    return {Id: id, State: state, Labels: {[PROJECT_LABEL]: STACK_ID, [SERVICE_LABEL]: service}};
}

type EmitCall = [string, Record<string, unknown>];

/**
 * An in-memory stand-in for the stack repository shared by the real catch-up
 * and the real ServiceHealthService: every write is visible to the next read,
 * and updateServiceState persists the container id, state and health like the
 * real repository does.
 */
function createWorld(status: string, rows: ServiceHealthServiceRow[]) {
    const world = {status, rows};
    const stackStatusWrites: string[] = [];
    const repo = {
        findByComposeProject: vi.fn(async () => ({
            id: STACK_ID,
            status: world.status,
            services: world.rows.map((row) => ({...row})),
        })),
        updateServiceState: vi.fn(
            async (data: {
                serviceName: string;
                containerId: string | null;
                containerState: string;
                healthStatus: string | null;
            }) => {
                const row = world.rows.find((candidate) => candidate.serviceName === data.serviceName);
                if (row) {
                    row.containerId = data.containerId;
                    row.containerState = data.containerState;
                    row.healthStatus = data.healthStatus;
                }
            },
        ),
        updateStackStatus: vi.fn(async (_stackId: string, next: string) => {
            stackStatusWrites.push(next);
            if (next === world.status) {
                return null;
            }
            const fromStatus = world.status;
            world.status = next;
            return {id: "log-1", fromStatus, toStatus: next, message: null, createdAt: new Date()};
        }),
    };
    return {world, repo, stackStatusWrites};
}

function healthChanges(bus: {emit: {mock: {calls: unknown[][]}}}): Record<string, unknown>[] {
    return (bus.emit.mock.calls as EmitCall[])
        .filter(([name]) => name === "service.health_changed")
        .map(([, payload]) => payload);
}

describe("container identity for probe-owned health (D-08, WR-01, WR-05)", () => {
    let docker: {listContainers: ReturnType<typeof vi.fn>; inspectContainer: ReturnType<typeof vi.fn>};
    let bus: {emit: ReturnType<typeof vi.fn>};

    beforeEach(() => {
        docker = {listContainers: vi.fn(), inspectContainer: vi.fn()};
        bus = {emit: vi.fn()};
    });

    function catchUpOwning(
        repo: unknown,
        ...owned: string[]
    ): ContainerStateCatchUp {
        return new ContainerStateCatchUp(docker, repo as ContainerStateCatchUpRepo, bus, {
            isProbeOwned: (_stackId: string, serviceName: string) => owned.includes(serviceName),
        });
    }

    function givenRows(rows: ServiceHealthServiceRow[], status = "UNHEALTHY") {
        return createWorld(status, rows);
    }

    function webRow(containerId: string | null, healthStatus: string | null): ServiceHealthServiceRow {
        return {serviceName: "web", containerId, containerState: "running", healthStatus};
    }

    describe("post-deploy catch-up", () => {
        it("resets a probe-owned service on a new container to starting, derives RUNNING and records an http-probe transition", async () => {
            const {repo} = givenRows([webRow("c-old", "unhealthy")]);
            docker.listContainers.mockResolvedValue([container("c-new", "web")]);
            docker.inspectContainer.mockResolvedValue({
                Id: "c-new",
                State: {Status: "running", Health: {Status: "healthy"}},
            });

            await catchUpOwning(repo, "web").catchUp(STACK_ID);

            expect(repo.updateServiceState).toHaveBeenCalledWith({
                stackId: STACK_ID,
                serviceName: "web",
                containerId: "c-new",
                containerState: "running",
                healthStatus: "starting",
            });
            expect(repo.updateStackStatus).toHaveBeenCalledWith(STACK_ID, "RUNNING");
            expect(healthChanges(bus)).toEqual([
                {
                    stackId: STACK_ID,
                    serviceName: "web",
                    fromStatus: "unhealthy",
                    toStatus: "starting",
                    source: "http-probe",
                },
            ]);
            expect(bus.emit).toHaveBeenCalledWith(
                "stack.container_state_changed",
                expect.objectContaining({serviceName: "web", healthStatus: "starting"}),
            );
        });

        it("keeps the stored health and records nothing when the container id is unchanged", async () => {
            const {repo} = givenRows([webRow("c1", "healthy")], "HEALTHY");
            docker.listContainers.mockResolvedValue([container("c1", "web")]);
            docker.inspectContainer.mockResolvedValue({
                Id: "c1",
                State: {Status: "running", Health: {Status: "unhealthy"}},
            });

            await catchUpOwning(repo, "web").catchUp(STACK_ID);

            expect(repo.updateServiceState).toHaveBeenCalledWith(
                expect.objectContaining({serviceName: "web", healthStatus: "healthy"}),
            );
            expect(healthChanges(bus)).toEqual([]);
        });

        it("keeps the stored health when the stored container id is null (rows just recreated by a deploy)", async () => {
            const {repo} = givenRows([webRow(null, "healthy")], "HEALTHY");
            docker.listContainers.mockResolvedValue([container("c-new", "web")]);
            docker.inspectContainer.mockResolvedValue({Id: "c-new", State: {Status: "running"}});

            await catchUpOwning(repo, "web").catchUp(STACK_ID);

            expect(repo.updateServiceState).toHaveBeenCalledWith(
                expect.objectContaining({serviceName: "web", containerId: "c-new", healthStatus: "healthy"}),
            );
            expect(healthChanges(bus)).toEqual([]);
        });

        it("keeps the stored health for a scaled service with two containers", async () => {
            const {repo} = givenRows([webRow("c-old", "healthy")], "HEALTHY");
            docker.listContainers.mockResolvedValue([container("c-a", "web"), container("c-b", "web")]);
            docker.inspectContainer.mockResolvedValue({Id: "c-a", State: {Status: "running"}});

            await catchUpOwning(repo, "web").catchUp(STACK_ID);

            expect(repo.updateServiceState).toHaveBeenCalledWith(
                expect.objectContaining({serviceName: "web", healthStatus: "healthy"}),
            );
            expect(healthChanges(bus)).toEqual([]);
        });

        it("resets from the list state when inspect fails and the container id changed", async () => {
            const running = givenRows([webRow("c-old", "unhealthy")]);
            docker.listContainers.mockResolvedValue([container("c-new", "web", "running")]);
            docker.inspectContainer.mockRejectedValue(new Error("inspect failed"));

            await catchUpOwning(running.repo, "web").catchUp(STACK_ID);

            expect(running.repo.updateServiceState).toHaveBeenCalledWith(
                expect.objectContaining({serviceName: "web", containerState: "running", healthStatus: "starting"}),
            );

            const exited = givenRows([webRow("c-old", "healthy")], "HEALTHY");
            docker.listContainers.mockResolvedValue([container("c-new", "web", "exited")]);

            await catchUpOwning(exited.repo, "web").catchUp(STACK_ID);

            expect(exited.repo.updateServiceState).toHaveBeenCalledWith(
                expect.objectContaining({serviceName: "web", containerState: "exited", healthStatus: null}),
            );
        });

        it("still gives a non-owned sibling Docker's health and a docker-healthcheck transition", async () => {
            const {repo} = givenRows([
                webRow("c-old", "unhealthy"),
                {serviceName: "db", containerId: "c-db", containerState: "running", healthStatus: null},
            ]);
            docker.listContainers.mockResolvedValue([container("c-new", "web"), container("c-db", "db")]);
            docker.inspectContainer.mockImplementation(async (id: string) =>
                id === "c-db"
                    ? {Id: id, State: {Status: "running", Health: {Status: "healthy"}}}
                    : {Id: id, State: {Status: "running"}},
            );

            await catchUpOwning(repo, "web").catchUp(STACK_ID);

            expect(healthChanges(bus)).toEqual([
                expect.objectContaining({serviceName: "web", toStatus: "starting", source: "http-probe"}),
                {
                    stackId: STACK_ID,
                    serviceName: "db",
                    fromStatus: null,
                    toStatus: "healthy",
                    source: "docker-healthcheck",
                },
            ]);
        });
    });

    describe("redeploy end to end", () => {
        function probeEvent(containerId: string, outcome: ProbeOutcome): ServiceProbeCompletedEvent {
            return {
                stackId: STACK_ID,
                serviceName: "web",
                containerId,
                containerStartedAt: new Date(Date.now() - 60 * 60_000).toISOString(),
                outcome,
            };
        }

        it("never writes UNHEALTHY after the catch-up and lets the first probe of the new container decide", async () => {
            const {world, repo, stackStatusWrites} = givenRows([webRow("c-old", "unhealthy")]);
            const service = new ServiceHealthService(repo as unknown as ServiceHealthServiceRepo, bus, {
                inspectContainer: vi.fn(),
            });
            docker.listContainers.mockResolvedValue([container("c-new", "web")]);
            docker.inspectContainer.mockResolvedValue({
                Id: "c-new",
                State: {Status: "running", Health: {Status: "healthy"}},
            });

            await catchUpOwning(repo, "web").catchUp(STACK_ID);

            expect(world.rows[0]).toMatchObject({containerId: "c-new", containerState: "running", healthStatus: "starting"});
            expect(world.status).toBe("RUNNING");

            await service.handleProbeCompleted(probeEvent("c-new", OK_200));

            expect(world.rows[0]).toMatchObject({containerId: "c-new", healthStatus: "healthy"});
            expect(world.status).toBe("HEALTHY");
            expect(stackStatusWrites).not.toContain("UNHEALTHY");
            expect(healthChanges(bus)).toEqual([
                expect.objectContaining({fromStatus: "unhealthy", toStatus: "starting", source: "http-probe"}),
                expect.objectContaining({fromStatus: "starting", toStatus: "healthy", source: "http-probe"}),
            ]);
        });

        it("ignores a late result for the replaced container and then accepts the new container's", async () => {
            const {world, repo, stackStatusWrites} = givenRows([webRow("c-old", "unhealthy")]);
            const service = new ServiceHealthService(repo as unknown as ServiceHealthServiceRepo, bus, {
                inspectContainer: vi.fn(),
            });
            docker.listContainers.mockResolvedValue([container("c-new", "web")]);
            docker.inspectContainer.mockResolvedValue({Id: "c-new", State: {Status: "running"}});

            await catchUpOwning(repo, "web").catchUp(STACK_ID);
            const writesAfterCatchUp = repo.updateServiceState.mock.calls.length;
            const emitsAfterCatchUp = bus.emit.mock.calls.length;

            for (let i = 0; i < 3; i++) {
                await service.handleProbeCompleted(probeEvent("c-old", FAIL_503));
            }

            expect(repo.updateServiceState).toHaveBeenCalledTimes(writesAfterCatchUp);
            expect(bus.emit).toHaveBeenCalledTimes(emitsAfterCatchUp);
            expect(world.rows[0]).toMatchObject({containerId: "c-new", healthStatus: "starting"});
            expect(stackStatusWrites).not.toContain("UNHEALTHY");

            await service.handleProbeCompleted(probeEvent("c-new", OK_200));

            expect(world.rows[0]).toMatchObject({containerId: "c-new", healthStatus: "healthy"});
            expect(world.status).toBe("HEALTHY");
        });
    });
});
