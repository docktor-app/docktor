import {beforeEach, describe, expect, it, vi} from "vitest";
import {PortConflictService} from "../../../src/application/port-conflict-service.js";

function createMockStacks() {
    return {findAll: vi.fn().mockResolvedValue([])};
}

function createMockFs() {
    return {
        readCompose: vi.fn().mockResolvedValue(""),
        readEnv: vi.fn().mockResolvedValue(""),
    };
}

function createMockDocker() {
    return {listContainers: vi.fn().mockResolvedValue([])};
}

function createMockSockets() {
    return {listListeners: vi.fn().mockResolvedValue([])};
}

const COMPOSE_WITH_PORT = "services:\n  web:\n    image: nginx\n    ports:\n      - \"8080:80\"\n";
const COMPOSE_WITHOUT_PORTS = "services:\n  web:\n    image: nginx\n";

describe("PortConflictService", () => {
    let stacks: ReturnType<typeof createMockStacks>;
    let fs: ReturnType<typeof createMockFs>;
    let docker: ReturnType<typeof createMockDocker>;
    let sockets: ReturnType<typeof createMockSockets>;
    let service: PortConflictService;

    beforeEach(() => {
        stacks = createMockStacks();
        fs = createMockFs();
        docker = createMockDocker();
        sockets = createMockSockets();
        service = new PortConflictService(stacks as any, fs as any, docker as any, sockets as any);
    });

    it("flags a conflict with a running Docktor stack holding the requested port (D1/D15 tracer)", async () => {
        fs.readCompose.mockResolvedValue(COMPOSE_WITH_PORT);
        stacks.findAll.mockResolvedValue([
            {
                id: "blog",
                displayName: "Blog",
                status: "RUNNING",
                services: [{ports: JSON.stringify([{host: 8080, protocol: "tcp"}])}],
            },
        ]);

        const result = await service.check("new-app");

        expect(result).toEqual([
            {port: 8080, protocol: "tcp", serviceName: "web", holder: {kind: "stack", stackId: "blog", stackDisplayName: "Blog"}},
        ]);
    });

    it("still returns the DB-tier conflict when listContainers rejects (container tier treated as empty)", async () => {
        fs.readCompose.mockResolvedValue(COMPOSE_WITH_PORT);
        stacks.findAll.mockResolvedValue([
            {
                id: "blog",
                displayName: "Blog",
                status: "RUNNING",
                services: [{ports: JSON.stringify([{host: 8080, protocol: "tcp"}])}],
            },
        ]);
        docker.listContainers.mockRejectedValue(new Error("docker socket unreachable"));
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        const result = await service.check("new-app");

        expect(result).toEqual([
            {port: 8080, protocol: "tcp", serviceName: "web", holder: {kind: "stack", stackId: "blog", stackDisplayName: "Blog"}},
        ]);
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it("returns [] without calling listContainers or listListeners when the compose requests no host ports", async () => {
        fs.readCompose.mockResolvedValue(COMPOSE_WITHOUT_PORTS);

        const result = await service.check("new-app");

        expect(result).toEqual([]);
        expect(docker.listContainers).not.toHaveBeenCalled();
        expect(sockets.listListeners).not.toHaveBeenCalled();
    });

    it("maps dockerode container info into the container tier (name without leading slash, compose project label, published ports)", async () => {
        fs.readCompose.mockResolvedValue(COMPOSE_WITH_PORT);
        docker.listContainers.mockResolvedValue([
            {
                Names: ["/legacy-nginx"],
                Labels: {},
                Ports: [{PrivatePort: 80, PublicPort: 8080, Type: "tcp"}],
            },
        ]);

        const result = await service.check("new-app");

        expect(result).toEqual([
            {port: 8080, protocol: "tcp", serviceName: "web", holder: {kind: "container", containerName: "legacy-nginx"}},
        ]);
    });

    it("calls listContainers(false) — running containers only", async () => {
        fs.readCompose.mockResolvedValue(COMPOSE_WITH_PORT);

        await service.check("new-app");

        expect(docker.listContainers).toHaveBeenCalledWith(false);
    });

    it("falls through to the socket-listener tier when no DB or container holder matches", async () => {
        fs.readCompose.mockResolvedValue(COMPOSE_WITH_PORT);
        sockets.listListeners.mockResolvedValue([
            {port: 8080, protocol: "tcp", processName: "nginx", pid: 4242},
        ]);

        const result = await service.check("new-app");

        expect(result).toEqual([
            {port: 8080, protocol: "tcp", serviceName: "web", holder: {kind: "process", processName: "nginx", pid: 4242}},
        ]);
    });

    it("degrades to [] without throwing when the compose file cannot be read", async () => {
        fs.readCompose.mockRejectedValue(new Error("ENOENT"));
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        const result = await service.check("new-app");

        expect(result).toEqual([]);
        warnSpy.mockRestore();
    });
});
