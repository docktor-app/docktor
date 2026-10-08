import {afterEach, describe, expect, it, vi} from "vitest";
import http from "node:http";
import type {AddressInfo} from "node:net";
import type Dockerode from "dockerode";
import {ProbeTransport, selectTargetAddress} from "../../../src/infrastructure/probe-transport.js";

const STARTED_AT = "2026-10-08T10:00:00.000000000Z";

interface SeenRequest {
    host: string | undefined;
    url: string | undefined;
}

function inspectInfo(overrides: {
    networks?: Record<string, {IPAddress: string}>;
    labels?: Record<string, string>;
} = {}): Dockerode.ContainerInspectInfo {
    return {
        State: {StartedAt: STARTED_AT},
        Config: {Labels: overrides.labels ?? {}},
        NetworkSettings: {Networks: overrides.networks ?? {app_default: {IPAddress: "127.0.0.1"}}},
    } as unknown as Dockerode.ContainerInspectInfo;
}

function fakeDocker(info: Dockerode.ContainerInspectInfo | Error) {
    return {
        inspectContainer: vi.fn(async () => {
            if (info instanceof Error) {
                throw info;
            }
            return info;
        }),
    };
}

describe("selectTargetAddress", () => {
    it("prefers the compose project's default network", () => {
        const info = inspectInfo({
            labels: {"com.docker.compose.project": "app"},
            networks: {other: {IPAddress: "10.0.0.5"}, app_default: {IPAddress: "172.18.0.2"}},
        });

        expect(selectTargetAddress(info)).toBe("172.18.0.2");
    });

    it("falls back to the first network that has an address", () => {
        const info = inspectInfo({networks: {empty: {IPAddress: ""}, shared: {IPAddress: "10.1.2.3"}}});

        expect(selectTargetAddress(info)).toBe("10.1.2.3");
    });

    it("returns null when no network has an address", () => {
        expect(selectTargetAddress(inspectInfo({networks: {none: {IPAddress: ""}}}))).toBeNull();
        expect(selectTargetAddress(inspectInfo({networks: {}}))).toBeNull();
    });
});

describe("ProbeTransport (amended D-05, T-14-36)", () => {
    const servers: http.Server[] = [];

    afterEach(async () => {
        await Promise.all(
            servers.splice(0).map(
                (server) =>
                    new Promise<void>((resolve) => {
                        server.closeAllConnections();
                        server.close(() => resolve());
                    }),
            ),
        );
    });

    async function startServer(
        handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
        address = "127.0.0.1",
    ): Promise<{port: number; seen: SeenRequest[]}> {
        const seen: SeenRequest[] = [];
        const server = http.createServer((req, res) => {
            seen.push({host: req.headers.host, url: req.url});
            handler(req, res);
        });
        servers.push(server);
        await new Promise<void>((resolve) => server.listen(0, address, resolve));
        return {port: (server.address() as AddressInfo).port, seen};
    }

    it("treats a 200 as success and keeps the Host header of the compose URL", async () => {
        const {port, seen} = await startServer((_req, res) => res.writeHead(200).end("ok"));
        const docker = fakeDocker(inspectInfo());

        const result = await new ProbeTransport(docker).probe({
            containerId: "c1",
            url: `http://localhost:${port}/health`,
            timeoutMs: 2000,
        });

        expect(result).toEqual({containerStartedAt: STARTED_AT, outcome: {ok: true, status: 200}});
        expect(seen).toEqual([{host: `localhost:${port}`, url: "/health"}]);
        expect(docker.inspectContainer).toHaveBeenCalledWith("c1");
    });

    it("passes the query string through", async () => {
        const {port, seen} = await startServer((_req, res) => res.writeHead(204).end());

        await new ProbeTransport(fakeDocker(inspectInfo())).probe({
            containerId: "c1",
            url: `http://localhost:${port}/health?full=1`,
            timeoutMs: 2000,
        });

        expect(seen[0]?.url).toBe("/health?full=1");
    });

    it("does not follow a redirect and counts the 3xx as success (D-02)", async () => {
        const {port, seen} = await startServer((_req, res) => res.writeHead(302, {location: "/login"}).end());

        const result = await new ProbeTransport(fakeDocker(inspectInfo())).probe({
            containerId: "c1",
            url: `http://localhost:${port}/`,
            timeoutMs: 2000,
        });

        expect(result.outcome).toEqual({ok: true, status: 302});
        expect(seen).toHaveLength(1);
    });

    it("reports a 404 as an http-status failure", async () => {
        const {port} = await startServer((_req, res) => res.writeHead(404).end());

        const result = await new ProbeTransport(fakeDocker(inspectInfo())).probe({
            containerId: "c1",
            url: `http://localhost:${port}/`,
            timeoutMs: 2000,
        });

        expect(result.outcome).toEqual({ok: false, reason: {kind: "http-status", status: 404}});
    });

    it("reports a slow reply as a timeout", async () => {
        const {port} = await startServer((_req, res) => {
            setTimeout(() => res.writeHead(200).end(), 400);
        });

        const result = await new ProbeTransport(fakeDocker(inspectInfo())).probe({
            containerId: "c1",
            url: `http://localhost:${port}/`,
            timeoutMs: 100,
        });

        expect(result.outcome).toMatchObject({ok: false, reason: {kind: "timeout"}});
    });

    it("reports a closed port as connection refused", async () => {
        const {port} = await startServer((_req, res) => res.end());
        const [server] = servers.splice(0);
        await new Promise<void>((resolve) => server?.close(() => resolve()));

        const result = await new ProbeTransport(fakeDocker(inspectInfo())).probe({
            containerId: "c1",
            url: `http://localhost:${port}/`,
            timeoutMs: 5000,
        });

        expect(result.outcome).toEqual({ok: false, reason: {kind: "refused"}});
    }, 10_000);

    it("connects to the container address even when the URL host is an IP literal", async () => {
        const {port, seen} = await startServer((_req, res) => res.writeHead(200).end(), "127.0.0.2");
        const info = inspectInfo({networks: {app_default: {IPAddress: "127.0.0.2"}}});

        const result = await new ProbeTransport(fakeDocker(info)).probe({
            containerId: "c1",
            url: `http://127.0.0.1:${port}/`,
            timeoutMs: 2000,
        });

        expect(result.outcome).toEqual({ok: true, status: 200});
        expect(seen).toEqual([{host: `127.0.0.1:${port}`, url: "/"}]);
    });

    it("reports an unreadable container as having no address", async () => {
        const result = await new ProbeTransport(fakeDocker(new Error("No such container"))).probe({
            containerId: "gone",
            url: "http://localhost:8080/",
            timeoutMs: 1000,
        });

        expect(result).toEqual({containerStartedAt: null, outcome: {ok: false, reason: {kind: "no-address"}}});
    });

    it("reports a container without a network address, keeping its start time", async () => {
        const info = inspectInfo({networks: {app_default: {IPAddress: ""}}});

        const result = await new ProbeTransport(fakeDocker(info)).probe({
            containerId: "c1",
            url: "http://localhost:8080/",
            timeoutMs: 1000,
        });

        expect(result).toEqual({containerStartedAt: STARTED_AT, outcome: {ok: false, reason: {kind: "no-address"}}});
    });

    it("rejects a host outside the allow-list without inspecting or requesting anything (T-14-36)", async () => {
        const {port, seen} = await startServer((_req, res) => res.writeHead(200).end());
        const docker = fakeDocker(inspectInfo());

        const result = await new ProbeTransport(docker).probe({
            containerId: "c1",
            url: `http://example.com:${port}/`,
            timeoutMs: 1000,
        });

        expect(result.outcome).toMatchObject({ok: false, reason: {kind: "invalid-config"}});
        expect(docker.inspectContainer).not.toHaveBeenCalled();
        expect(seen).toHaveLength(0);
    });

    it("rejects a URL with userinfo and a non-http scheme", async () => {
        const docker = fakeDocker(inspectInfo());
        const transport = new ProbeTransport(docker);

        const withUserinfo = await transport.probe({containerId: "c1", url: "http://user:pw@localhost/", timeoutMs: 1000});
        const ftp = await transport.probe({containerId: "c1", url: "ftp://localhost/", timeoutMs: 1000});

        expect(withUserinfo.outcome).toMatchObject({ok: false, reason: {kind: "invalid-config"}});
        expect(ftp.outcome).toMatchObject({ok: false, reason: {kind: "invalid-config"}});
        expect(docker.inspectContainer).not.toHaveBeenCalled();
    });
});
