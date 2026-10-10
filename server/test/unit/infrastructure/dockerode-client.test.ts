import Dockerode from "dockerode";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {DOCKER_REQUEST_TIMEOUT_MS, DockerodeClient} from "../../../../src/infrastructure/dockerode-client.js";

// Mock dockerode module so constructor injection is not needed
const mockDocker = {
    getEvents: vi.fn(),
    getContainer: vi.fn(),
    listContainers: vi.fn(),
    getNetwork: vi.fn(),
};

vi.mock("dockerode", () => ({
    default: vi.fn(() => mockDocker),
}));

describe("DockerodeClient", () => {
    let client: DockerodeClient;

    beforeEach(() => {
        vi.clearAllMocks();
        client = new DockerodeClient();
    });

    describe("getEventStream (OBS-01, OBS-06)", () => {
        it("calls docker.getEvents with filters for container events [start, stop, die, kill, health_status]", async () => {
            const mockStream = {on: vi.fn(), pipe: vi.fn()};
            mockDocker.getEvents.mockResolvedValue(mockStream);

            const stream = await client.getEventStream();

            expect(mockDocker.getEvents).toHaveBeenCalledWith(
                expect.objectContaining({
                    filters: expect.objectContaining({
                        type: expect.arrayContaining(["container"]),
                        event: expect.arrayContaining(["start", "stop", "die", "kill", "health_status"]),
                    }),
                }),
            );
            expect(stream).toBe(mockStream);
        });

        it("passes AbortSignal through to the underlying call when provided", async () => {
            const mockStream = {on: vi.fn()};
            mockDocker.getEvents.mockResolvedValue(mockStream);
            const controller = new AbortController();

            await client.getEventStream(controller.signal);

            expect(mockDocker.getEvents).toHaveBeenCalledOnce();
        });
    });

    describe("getLogStream (OBS-06)", () => {
        it("returns stream with stdout, stderr, follow:true, tail:100, timestamps:true options", async () => {
            const mockContainer = {logs: vi.fn()};
            const mockStream = {on: vi.fn()};
            mockDocker.getContainer.mockReturnValue(mockContainer);
            mockContainer.logs.mockResolvedValue(mockStream);

            const stream = await client.getLogStream("container-abc");

            expect(mockDocker.getContainer).toHaveBeenCalledWith("container-abc");
            expect(mockContainer.logs).toHaveBeenCalledWith(
                expect.objectContaining({
                    stdout: true,
                    stderr: true,
                    follow: true,
                    tail: 100,
                    timestamps: true,
                }),
            );
            expect(stream).toBe(mockStream);
        });
    });

    describe("inspectContainer (OBS-01)", () => {
        it("returns ContainerInspectInfo from docker.getContainer(id).inspect()", async () => {
            const mockInspectData = {Id: "container-abc", Name: "/my-container", State: {Status: "running"}};
            const mockContainer = {inspect: vi.fn().mockResolvedValue(mockInspectData)};
            mockDocker.getContainer.mockReturnValue(mockContainer);

            const result = await client.inspectContainer("container-abc");

            expect(mockDocker.getContainer).toHaveBeenCalledWith("container-abc");
            expect(mockContainer.inspect).toHaveBeenCalledOnce();
            expect(result).toEqual(mockInspectData);
        });

        it("forwards an abort signal as dockerode's abortSignal option", async () => {
            const mockContainer = {inspect: vi.fn().mockResolvedValue({})};
            mockDocker.getContainer.mockReturnValue(mockContainer);
            const controller = new AbortController();

            await client.inspectContainer("container-abc", controller.signal);

            expect(mockContainer.inspect).toHaveBeenCalledExactlyOnceWith({abortSignal: controller.signal});
        });

        it("sends no abortSignal option without a signal", async () => {
            const mockContainer = {inspect: vi.fn().mockResolvedValue({})};
            mockDocker.getContainer.mockReturnValue(mockContainer);

            await client.inspectContainer("container-abc");

            expect(mockContainer.inspect).toHaveBeenCalledExactlyOnceWith(undefined);
        });
    });

    describe("connectNetwork / disconnectNetwork (amended D-05)", () => {
        it("connects a container to the network under the given endpoint aliases", async () => {
            const network = {connect: vi.fn().mockResolvedValue(undefined)};
            mockDocker.getNetwork.mockReturnValue(network);

            await client.connectNetwork("n1", "self1", ["docktor-health-probe"]);

            expect(mockDocker.getNetwork).toHaveBeenCalledWith("n1");
            expect(network.connect).toHaveBeenCalledExactlyOnceWith({
                Container: "self1",
                EndpointConfig: {Aliases: ["docktor-health-probe"]},
            });
        });

        it("disconnects a container from the network without forcing", async () => {
            const network = {disconnect: vi.fn().mockResolvedValue(undefined)};
            mockDocker.getNetwork.mockReturnValue(network);

            await client.disconnectNetwork("n1", "self1");

            expect(mockDocker.getNetwork).toHaveBeenCalledWith("n1");
            expect(network.disconnect).toHaveBeenCalledExactlyOnceWith({Container: "self1", Force: false});
        });

        it("forwards an abort signal to connect and disconnect as dockerode's abortSignal option", async () => {
            const network = {connect: vi.fn().mockResolvedValue(undefined), disconnect: vi.fn().mockResolvedValue(undefined)};
            mockDocker.getNetwork.mockReturnValue(network);
            const controller = new AbortController();

            await client.connectNetwork("n1", "self1", ["docktor-health-probe"], controller.signal);
            await client.disconnectNetwork("n1", "self1", controller.signal);

            expect(network.connect).toHaveBeenCalledExactlyOnceWith({
                Container: "self1",
                EndpointConfig: {Aliases: ["docktor-health-probe"]},
                abortSignal: controller.signal,
            });
            expect(network.disconnect).toHaveBeenCalledExactlyOnceWith({
                Container: "self1",
                Force: false,
                abortSignal: controller.signal,
            });
        });

        it("lets the daemon's error through so the caller can classify it", async () => {
            const failure = Object.assign(new Error("already exists in network"), {statusCode: 403});
            mockDocker.getNetwork.mockReturnValue({connect: vi.fn().mockRejectedValue(failure)});

            await expect(client.connectNetwork("n1", "self1", [])).rejects.toBe(failure);
        });
    });

    describe("listContainers (OBS-01)", () => {
        it("calls docker.listContainers with {all:true} when all=true", async () => {
            const mockContainers = [{Id: "abc", Names: ["/web"]}];
            mockDocker.listContainers.mockResolvedValue(mockContainers);

            const result = await client.listContainers(true);

            expect(mockDocker.listContainers).toHaveBeenCalledWith({all: true});
            expect(result).toEqual(mockContainers);
        });
    });
});

// UAT G-14-1b: request/response calls get a socket timeout so a frozen daemon
// cannot leave them pending forever. docker-modem's timeout is an idle-socket
// timeout, so the quiet event and follow-logs streams must not use it.
describe("DockerodeClient timeouts (G-14-1b)", () => {
    const bounded = {
        getEvents: vi.fn(),
        getContainer: vi.fn(),
        listContainers: vi.fn(),
        getNetwork: vi.fn(),
    };
    const unbounded = {
        getEvents: vi.fn(),
        getContainer: vi.fn(),
        listContainers: vi.fn(),
        getNetwork: vi.fn(),
    };
    let client: DockerodeClient;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(Dockerode).mockImplementation(((options?: {timeout?: number}) =>
            options?.timeout === undefined ? unbounded : bounded) as never);
        client = new DockerodeClient();
    });

    afterEach(() => {
        vi.mocked(Dockerode).mockImplementation((() => mockDocker) as never);
    });

    it("creates one instance with the request timeout and one without any timeout", () => {
        expect(DOCKER_REQUEST_TIMEOUT_MS).toBe(30_000);
        expect(Dockerode).toHaveBeenCalledTimes(2);
        const options = vi.mocked(Dockerode).mock.calls.map(([arg]) => arg as {timeout?: number} | undefined);
        expect(options).toContainEqual({timeout: DOCKER_REQUEST_TIMEOUT_MS});
        expect(options.filter((arg) => arg?.timeout === undefined)).toHaveLength(1);
    });

    it("sends request/response calls through the bounded instance", async () => {
        const container = {inspect: vi.fn().mockResolvedValue({}), logs: vi.fn().mockResolvedValue(Buffer.alloc(0))};
        const network = {connect: vi.fn().mockResolvedValue(undefined), disconnect: vi.fn().mockResolvedValue(undefined)};
        bounded.getContainer.mockReturnValue(container);
        bounded.getNetwork.mockReturnValue(network);
        bounded.listContainers.mockResolvedValue([]);

        await client.inspectContainer("c1");
        await client.listContainers();
        await client.connectNetwork("n1", "c1", []);
        await client.disconnectNetwork("n1", "c1");
        await client.getLogTail("c1");

        expect(bounded.getContainer).toHaveBeenCalledTimes(2);
        expect(bounded.getNetwork).toHaveBeenCalledTimes(2);
        expect(bounded.listContainers).toHaveBeenCalledTimes(1);
        expect(unbounded.getContainer).not.toHaveBeenCalled();
        expect(unbounded.getNetwork).not.toHaveBeenCalled();
        expect(unbounded.listContainers).not.toHaveBeenCalled();
    });

    it("keeps the event stream and the follow-logs stream on the instance without a timeout", async () => {
        const container = {logs: vi.fn().mockResolvedValue({on: vi.fn()})};
        unbounded.getEvents.mockResolvedValue({on: vi.fn()});
        unbounded.getContainer.mockReturnValue(container);

        await client.getEventStream();
        await client.getLogStream("c1");

        expect(unbounded.getEvents).toHaveBeenCalledTimes(1);
        expect(unbounded.getContainer).toHaveBeenCalledWith("c1");
        expect(bounded.getEvents).not.toHaveBeenCalled();
        expect(bounded.getContainer).not.toHaveBeenCalled();
    });

    it("still passes the abort signal through the bounded instance", async () => {
        const inspect = vi.fn().mockResolvedValue({});
        bounded.getContainer.mockReturnValue({inspect});
        const controller = new AbortController();

        await client.inspectContainer("c1", controller.signal);

        expect(inspect).toHaveBeenCalledExactlyOnceWith({abortSignal: controller.signal});
    });
});
