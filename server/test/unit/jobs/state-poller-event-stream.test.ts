import {PassThrough} from "node:stream";

import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

import {InMemoryEventBus} from "../../../src/infrastructure/event-bus.js";
import {StatePoller} from "../../../src/jobs/state-poller.js";

// G-18-23-stop-ui: the Docker event stream is newline-delimited JSON whose
// chunking is unrelated to event boundaries, and one project's events must be
// handled in the order Docker sent them.

interface ContainerStateChanged {
    serviceName: string
    containerState: string
    stackStatus: string
}

interface ServiceRow {
    serviceName: string
    containerId: string | null
    containerState: string | null
    healthStatus: string | null
}

function dockerEvent(project: string, action: string, serviceName: string, containerId: string): string {
    return JSON.stringify({
        Type: "container",
        Action: action,
        Actor: {
            ID: containerId,
            Attributes: {
                "com.docker.compose.project": project,
                "com.docker.compose.service": serviceName,
            },
        },
    }) + "\n";
}

function deferred<T>(): {promise: Promise<T>; resolve: (value: T) => void} {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
        resolve = res;
    });
    return {promise, resolve};
}

function nextIoTurn(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
}

const running = {State: {Status: "running"}};
const exited = {State: {Status: "exited"}};

/** In-memory repository: one stack per project, rows written by updateServiceState. */
function createRepo(projects: Record<string, string[]>) {
    const stacks = new Map<string, {id: string; status: string; services: ServiceRow[]}>();
    for (const [project, serviceNames] of Object.entries(projects)) {
        stacks.set(project, {
            id: project,
            status: "RUNNING",
            services: serviceNames.map((serviceName) => ({
                serviceName,
                containerId: null,
                containerState: "running",
                healthStatus: null,
            })),
        });
    }
    const statuses: string[] = [];
    return {
        statuses,
        findByComposeProject: vi.fn(async (project: string) => {
            const stack = stacks.get(project);
            return stack ? {...stack, services: stack.services.map((s) => ({...s}))} : null;
        }),
        findAll: vi.fn(async () => []),
        updateServiceState: vi.fn(async (data: {
            stackId: string; serviceName: string; containerId: string; containerState: string; healthStatus: string | null
        }) => {
            const row = stacks.get(data.stackId)?.services.find((s) => s.serviceName === data.serviceName);
            if (row) {
                row.containerId = data.containerId;
                row.containerState = data.containerState;
                row.healthStatus = data.healthStatus;
            }
        }),
        updateStackStatus: vi.fn(async (stackId: string, status: string) => {
            statuses.push(status);
            const stack = stacks.get(stackId);
            if (stack) stack.status = status;
            return null;
        }),
    };
}

describe("StatePoller event stream (G-18-23-stop-ui)", () => {
    let poller: StatePoller;
    let stream: PassThrough;
    let collected: ContainerStateChanged[];
    let docker: {
        getEventStream: ReturnType<typeof vi.fn>
        inspectContainer: ReturnType<typeof vi.fn>
        listContainers: ReturnType<typeof vi.fn>
    };
    let repo: ReturnType<typeof createRepo>;

    async function startPoller(projects: Record<string, string[]>): Promise<void> {
        repo = createRepo(projects);
        const bus = new InMemoryEventBus();
        collected = [];
        bus.subscribe("stack.container_state_changed", (payload) => {
            collected.push(payload);
        });
        poller = new StatePoller(docker as never, repo as never, bus);
        await poller.start();
    }

    beforeEach(() => {
        vi.spyOn(console, "log").mockImplementation(() => undefined);
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        stream = new PassThrough();
        docker = {
            getEventStream: vi.fn().mockResolvedValue(stream),
            inspectContainer: vi.fn(),
            listContainers: vi.fn().mockResolvedValue([]),
        };
    });

    afterEach(async () => {
        await poller.stop();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("handles kill, die and stop in event order", async () => {
        let calls = 0;
        docker.inspectContainer.mockImplementation(async () => {
            calls += 1;
            if (calls === 1) {
                // The kill handler inspects while the container is still running.
                await new Promise((resolve) => setTimeout(resolve, 20));
                return running;
            }
            return exited;
        });
        await startPoller({"my-stack": ["web"]});

        stream.write(Buffer.from(
            dockerEvent("my-stack", "kill", "web", "c1")
            + dockerEvent("my-stack", "die", "web", "c1")
            + dockerEvent("my-stack", "stop", "web", "c1"),
        ));

        await vi.waitFor(() => {
            expect(docker.inspectContainer).toHaveBeenCalledTimes(3);
            expect(repo.statuses).toHaveLength(3);
        });
        const lastWrite = repo.updateServiceState.mock.calls.at(-1)?.[0];
        expect(lastWrite?.containerState).toBe("exited");
        expect(repo.statuses.at(-1)).toBe("STOPPED");
        expect(collected.at(-1)).toMatchObject({containerState: "exited", stackStatus: "STOPPED"});
    });

    it("handles two events delivered in one chunk", async () => {
        docker.inspectContainer.mockResolvedValue(running);
        await startPoller({"my-stack": ["web", "db"]});

        stream.write(Buffer.from(
            dockerEvent("my-stack", "start", "web", "c1") + dockerEvent("my-stack", "start", "db", "c2"),
        ));

        await vi.waitFor(() => {
            expect(docker.inspectContainer).toHaveBeenCalledTimes(2);
            expect(repo.updateServiceState).toHaveBeenCalledTimes(2);
        });
    });

    it("does not block other projects", async () => {
        const slowA = deferred<typeof running>();
        docker.inspectContainer.mockImplementation((containerId: string) =>
            containerId === "ca" ? slowA.promise : Promise.resolve(running));
        await startPoller({a: ["web"], b: ["web"]});

        stream.write(Buffer.from(dockerEvent("a", "start", "web", "ca")));
        await vi.waitFor(() => expect(docker.inspectContainer).toHaveBeenCalledWith("ca"));
        stream.write(Buffer.from(dockerEvent("b", "start", "web", "cb")));

        await vi.waitFor(() => expect(repo.updateServiceState).toHaveBeenCalledTimes(1));
        expect(repo.updateServiceState.mock.calls[0]?.[0].stackId).toBe("b");

        slowA.resolve(running);
        await vi.waitFor(() => expect(repo.updateServiceState).toHaveBeenCalledTimes(2));
    });

    it("keeps going after a failed handler", async () => {
        const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
        docker.inspectContainer
            .mockRejectedValueOnce(new Error("docker unreachable"))
            .mockResolvedValue(exited);
        await startPoller({"my-stack": ["web"]});

        stream.write(Buffer.from(dockerEvent("my-stack", "die", "web", "c1")));
        stream.write(Buffer.from(dockerEvent("my-stack", "stop", "web", "c1")));

        await vi.waitFor(() => expect(repo.updateServiceState).toHaveBeenCalledTimes(1));
        expect(errorLog).toHaveBeenCalledWith("[StatePoller] handleEvent error:", expect.any(Error));
        expect(repo.statuses.at(-1)).toBe("STOPPED");
    });

    it("reconciles a project after its in-flight events", async () => {
        const slowEvent = deferred<typeof running>();
        docker.inspectContainer
            .mockReturnValueOnce(slowEvent.promise)
            .mockResolvedValue(exited);
        docker.listContainers.mockResolvedValue([{
            Id: "c1",
            State: "exited",
            Labels: {"com.docker.compose.project": "my-stack", "com.docker.compose.service": "web"},
        }]);
        await startPoller({"my-stack": ["web"]});

        stream.write(Buffer.from(dockerEvent("my-stack", "start", "web", "c1")));
        await vi.waitFor(() => expect(docker.inspectContainer).toHaveBeenCalledTimes(1));

        // reconcile() is protected; this narrow structural cast drives it the way the cron does.
        const reconciling = (poller as unknown as {reconcile(): Promise<void>}).reconcile();
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(repo.updateServiceState).not.toHaveBeenCalled();

        slowEvent.resolve(running);
        await reconciling;

        expect(repo.updateServiceState).toHaveBeenCalledTimes(2);
        const [eventWrite, reconcileWrite] = repo.updateServiceState.mock.calls.map((call) => call[0].containerState);
        expect([eventWrite, reconcileWrite]).toEqual(["running", "exited"]);
    });

    it("decodes a reconnected stream from scratch", async () => {
        vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout"]});
        const reconnected = new PassThrough();
        docker.getEventStream.mockResolvedValueOnce(stream).mockResolvedValueOnce(reconnected);
        docker.inspectContainer.mockResolvedValue(running);
        await startPoller({"my-stack": ["web"]});

        stream.write('{"Type":"cont');
        stream.end();
        await nextIoTurn(); // setImmediate is not faked: lets the stream emit "end" and arm the reconnect timer
        await vi.advanceTimersByTimeAsync(2000);
        expect(docker.getEventStream).toHaveBeenCalledTimes(2);

        reconnected.write(dockerEvent("my-stack", "start", "web", "c1"));
        await nextIoTurn();
        await nextIoTurn();

        expect(repo.updateServiceState).toHaveBeenCalledTimes(1);
        expect(docker.inspectContainer).toHaveBeenCalledTimes(1);
    });
});
