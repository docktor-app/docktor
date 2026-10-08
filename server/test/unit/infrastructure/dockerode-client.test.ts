import {beforeEach, describe, expect, it, vi} from "vitest";
import {DockerodeClient} from "../../../../src/infrastructure/dockerode-client.js";

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
