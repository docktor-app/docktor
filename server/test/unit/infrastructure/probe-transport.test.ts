import {afterEach, describe, expect, it, vi} from "vitest";
import http from "node:http";
import type {AddressInfo} from "node:net";
import type Dockerode from "dockerode";
import {
    PROBE_ENDPOINT_ALIAS,
    ProbeTransport,
    selectTargetAddress,
    type SelfContainer,
} from "../../../src/infrastructure/probe-transport.js";

const STARTED_AT = "2026-10-08T10:00:00.000000000Z";

interface SeenRequest {
    host: string | undefined;
    url: string | undefined;
}

interface TestNetwork {
    IPAddress: string;
    NetworkID?: string;
    Aliases?: string[];
}

function inspectInfo(overrides: {
    networks?: Record<string, TestNetwork>;
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
        inspectContainer: vi.fn(async (_containerId: string) => {
            if (info instanceof Error) {
                throw info;
            }
            return info;
        }),
        connectNetwork: vi.fn(async (_networkId: string, _containerId: string, _aliases: readonly string[]) => {}),
        disconnectNetwork: vi.fn(async (_networkId: string, _containerId: string) => {}),
    };
}

const SELF_ID = "self1";
const SELF: SelfContainer = {containerId: async () => SELF_ID};

// Answers the target container's inspect and, separately, Docktor's own.
function scriptedDocker(target: Dockerode.ContainerInspectInfo, self: Dockerode.ContainerInspectInfo | Error) {
    const docker = fakeDocker(target);
    docker.inspectContainer.mockImplementation(async (containerId: string) => {
        if (containerId !== SELF_ID) return target;
        if (self instanceof Error) throw self;
        return self;
    });
    return docker;
}

const DOCKTOR_ONLY = inspectInfo({
    networks: {docktor_default: {IPAddress: "172.20.0.2", NetworkID: "n-docktor", Aliases: ["docktor"]}},
});

// The unit-test host is not Docktor's container, whatever /.dockerenv says.
const NOT_CONTAINERIZED: SelfContainer = {containerId: async () => null};

function newTransport(docker: ReturnType<typeof fakeDocker>, self: SelfContainer = NOT_CONTAINERIZED): ProbeTransport {
    return new ProbeTransport(docker, self);
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

        const result = await newTransport(docker).probe({
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

        await newTransport(fakeDocker(inspectInfo())).probe({
            containerId: "c1",
            url: `http://localhost:${port}/health?full=1`,
            timeoutMs: 2000,
        });

        expect(seen[0]?.url).toBe("/health?full=1");
    });

    it("does not follow a redirect and counts the 3xx as success (D-02)", async () => {
        const {port, seen} = await startServer((_req, res) => res.writeHead(302, {location: "/login"}).end());

        const result = await newTransport(fakeDocker(inspectInfo())).probe({
            containerId: "c1",
            url: `http://localhost:${port}/`,
            timeoutMs: 2000,
        });

        expect(result.outcome).toEqual({ok: true, status: 302});
        expect(seen).toHaveLength(1);
    });

    it("reports a 404 as an http-status failure", async () => {
        const {port} = await startServer((_req, res) => res.writeHead(404).end());

        const result = await newTransport(fakeDocker(inspectInfo())).probe({
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

        const result = await newTransport(fakeDocker(inspectInfo())).probe({
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

        const result = await newTransport(fakeDocker(inspectInfo())).probe({
            containerId: "c1",
            url: `http://localhost:${port}/`,
            timeoutMs: 5000,
        });

        expect(result.outcome).toEqual({ok: false, reason: {kind: "refused"}});
    }, 10_000);

    it("connects to the container address even when the URL host is an IP literal", async () => {
        const {port, seen} = await startServer((_req, res) => res.writeHead(200).end(), "127.0.0.2");
        const info = inspectInfo({networks: {app_default: {IPAddress: "127.0.0.2"}}});

        const result = await newTransport(fakeDocker(info)).probe({
            containerId: "c1",
            url: `http://127.0.0.1:${port}/`,
            timeoutMs: 2000,
        });

        expect(result.outcome).toEqual({ok: true, status: 200});
        expect(seen).toEqual([{host: `127.0.0.1:${port}`, url: "/"}]);
    });

    it("reports an unreadable container as having no address", async () => {
        const result = await newTransport(fakeDocker(new Error("No such container"))).probe({
            containerId: "gone",
            url: "http://localhost:8080/",
            timeoutMs: 1000,
        });

        expect(result).toEqual({containerStartedAt: null, outcome: {ok: false, reason: {kind: "no-address"}}});
    });

    it("reports a container without a network address, keeping its start time", async () => {
        const info = inspectInfo({networks: {app_default: {IPAddress: ""}}});

        const result = await newTransport(fakeDocker(info)).probe({
            containerId: "c1",
            url: "http://localhost:8080/",
            timeoutMs: 1000,
        });

        expect(result).toEqual({containerStartedAt: STARTED_AT, outcome: {ok: false, reason: {kind: "no-address"}}});
    });

    it("rejects a host outside the allow-list without inspecting or requesting anything (T-14-36)", async () => {
        const {port, seen} = await startServer((_req, res) => res.writeHead(200).end());
        const docker = fakeDocker(inspectInfo());

        const result = await newTransport(docker).probe({
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
        const transport = newTransport(docker);

        const withUserinfo = await transport.probe({containerId: "c1", url: "http://user:pw@localhost/", timeoutMs: 1000});
        const ftp = await transport.probe({containerId: "c1", url: "ftp://localhost/", timeoutMs: 1000});

        expect(withUserinfo.outcome).toMatchObject({ok: false, reason: {kind: "invalid-config"}});
        expect(ftp.outcome).toMatchObject({ok: false, reason: {kind: "invalid-config"}});
        expect(docker.inspectContainer).not.toHaveBeenCalled();
    });

    describe("reachability across Docker networks (amended D-05)", () => {
        const targetOn = (networks: Record<string, TestNetwork>, project?: string) =>
            inspectInfo({networks, ...(project !== undefined && {labels: {"com.docker.compose.project": project}})});

        it("attaches Docktor to the target's network for the request only, with the probe alias", async () => {
            const calls: string[] = [];
            const {port} = await startServer((_req, res) => {
                calls.push("request");
                res.writeHead(200).end();
            });
            const docker = scriptedDocker(targetOn({app_default: {IPAddress: "127.0.0.1", NetworkID: "n1"}}, "app"), DOCKTOR_ONLY);
            docker.connectNetwork.mockImplementation(async () => {
                calls.push("connect");
            });
            docker.disconnectNetwork.mockImplementation(async () => {
                calls.push("disconnect");
            });

            const result = await newTransport(docker, SELF).probe({
                containerId: "c1",
                url: `http://localhost:${port}/`,
                timeoutMs: 2000,
            });

            expect(result).toEqual({containerStartedAt: STARTED_AT, outcome: {ok: true, status: 200}});
            expect(calls).toEqual(["connect", "request", "disconnect"]);
            expect(docker.connectNetwork).toHaveBeenCalledWith("n1", SELF_ID, [PROBE_ENDPOINT_ALIAS]);
            expect(docker.disconnectNetwork).toHaveBeenCalledWith("n1", SELF_ID);
        });

        it("uses a network Docktor already holds without any attach, even when the stack default network exists", async () => {
            const {port} = await startServer((_req, res) => res.writeHead(200).end());
            const target = targetOn(
                {
                    app_default: {IPAddress: "10.255.255.1", NetworkID: "n-app"},
                    shared: {IPAddress: "127.0.0.1", NetworkID: "n-shared"},
                },
                "app",
            );
            const self = inspectInfo({
                networks: {shared: {IPAddress: "172.30.0.2", NetworkID: "n-shared", Aliases: ["docktor"]}},
            });
            const docker = scriptedDocker(target, self);

            const result = await newTransport(docker, SELF).probe({
                containerId: "c1",
                url: `http://localhost:${port}/`,
                timeoutMs: 2000,
            });

            expect(result.outcome).toEqual({ok: true, status: 200});
            expect(docker.connectNetwork).not.toHaveBeenCalled();
            expect(docker.disconnectNetwork).not.toHaveBeenCalled();
        });

        it("shares one attachment between concurrent probes on a network and detaches after the last", async () => {
            let handled = 0;
            const {port} = await startServer((_req, res) => {
                handled++;
                setTimeout(() => res.writeHead(200).end(), 50);
            });
            const docker = scriptedDocker(targetOn({app_default: {IPAddress: "127.0.0.1", NetworkID: "n1"}}, "app"), DOCKTOR_ONLY);
            let handledAtDisconnect = -1;
            docker.disconnectNetwork.mockImplementation(async () => {
                handledAtDisconnect = handled;
            });
            const transport = newTransport(docker, SELF);
            const request = {containerId: "c1", url: `http://localhost:${port}/`, timeoutMs: 2000};

            const results = await Promise.all([transport.probe(request), transport.probe(request)]);

            expect(results.map((r) => r.outcome)).toEqual([{ok: true, status: 200}, {ok: true, status: 200}]);
            expect(docker.connectNetwork).toHaveBeenCalledTimes(1);
            expect(docker.disconnectNetwork).toHaveBeenCalledTimes(1);
            expect(handledAtDisconnect).toBe(2);
        });

        it("attaches again for a later probe once the previous attachment was released", async () => {
            const {port} = await startServer((_req, res) => res.writeHead(200).end());
            const docker = scriptedDocker(targetOn({app_default: {IPAddress: "127.0.0.1", NetworkID: "n1"}}, "app"), DOCKTOR_ONLY);
            const transport = newTransport(docker, SELF);
            const request = {containerId: "c1", url: `http://localhost:${port}/`, timeoutMs: 2000};

            await transport.probe(request);
            await transport.probe(request);

            expect(docker.connectNetwork).toHaveBeenCalledTimes(2);
            expect(docker.disconnectNetwork).toHaveBeenCalledTimes(2);
        });

        it("prefers the stack's default network, then the first network with an address", async () => {
            const {port} = await startServer((_req, res) => res.writeHead(200).end());
            const preferred = scriptedDocker(
                targetOn(
                    {
                        other: {IPAddress: "127.0.0.1", NetworkID: "n-other"},
                        app_default: {IPAddress: "127.0.0.1", NetworkID: "n-app"},
                    },
                    "app",
                ),
                DOCKTOR_ONLY,
            );
            const first = scriptedDocker(
                targetOn({empty: {IPAddress: "", NetworkID: "n-empty"}, second: {IPAddress: "127.0.0.1", NetworkID: "n-second"}}),
                DOCKTOR_ONLY,
            );
            const request = {containerId: "c1", url: `http://localhost:${port}/`, timeoutMs: 2000};

            await newTransport(preferred, SELF).probe(request);
            await newTransport(first, SELF).probe(request);

            expect(preferred.connectNetwork).toHaveBeenCalledWith("n-app", SELF_ID, [PROBE_ENDPOINT_ALIAS]);
            expect(first.connectNetwork).toHaveBeenCalledWith("n-second", SELF_ID, [PROBE_ENDPOINT_ALIAS]);
        });

        it("fails closed without a request or a detach when the connect fails", async () => {
            const {port, seen} = await startServer((_req, res) => res.writeHead(200).end());
            const docker = scriptedDocker(targetOn({app_default: {IPAddress: "127.0.0.1", NetworkID: "n1"}}, "app"), DOCKTOR_ONLY);
            docker.connectNetwork.mockRejectedValue(Object.assign(new Error("boom"), {statusCode: 500}));

            const result = await newTransport(docker, SELF).probe({
                containerId: "c1",
                url: `http://localhost:${port}/`,
                timeoutMs: 2000,
            });

            expect(result.outcome).toEqual({ok: false, reason: {kind: "network-unreachable"}});
            expect(seen).toHaveLength(0);
            expect(docker.disconnectNetwork).not.toHaveBeenCalled();
        });

        it("retries the attach on the next probe after a failed connect", async () => {
            const {port} = await startServer((_req, res) => res.writeHead(200).end());
            const docker = scriptedDocker(targetOn({app_default: {IPAddress: "127.0.0.1", NetworkID: "n1"}}, "app"), DOCKTOR_ONLY);
            docker.connectNetwork.mockRejectedValueOnce(new Error("transient"));
            const transport = newTransport(docker, SELF);
            const request = {containerId: "c1", url: `http://localhost:${port}/`, timeoutMs: 2000};

            const failed = await transport.probe(request);
            const recovered = await transport.probe(request);

            expect(failed.outcome).toMatchObject({ok: false});
            expect(recovered.outcome).toEqual({ok: true, status: 200});
        });

        it("treats an already-connected endpoint (HTTP 403) as attached and still detaches afterwards", async () => {
            const {port} = await startServer((_req, res) => res.writeHead(200).end());
            const docker = scriptedDocker(targetOn({app_default: {IPAddress: "127.0.0.1", NetworkID: "n1"}}, "app"), DOCKTOR_ONLY);
            docker.connectNetwork.mockRejectedValue(
                Object.assign(new Error("endpoint with name docktor already exists in network app_default"), {statusCode: 403}),
            );

            const result = await newTransport(docker, SELF).probe({
                containerId: "c1",
                url: `http://localhost:${port}/`,
                timeoutMs: 2000,
            });

            expect(result.outcome).toEqual({ok: true, status: 200});
            expect(docker.disconnectNetwork).toHaveBeenCalledWith("n1", SELF_ID);
        });

        it("keeps the outcome and warns once, naming the network, when the detach fails", async () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
            try {
                const {port} = await startServer((_req, res) => res.writeHead(200).end());
                const docker = scriptedDocker(targetOn({app_default: {IPAddress: "127.0.0.1", NetworkID: "n1"}}, "app"), DOCKTOR_ONLY);
                docker.disconnectNetwork.mockRejectedValue(new Error("daemon busy"));

                const result = await newTransport(docker, SELF).probe({
                    containerId: "c1",
                    url: `http://localhost:${port}/`,
                    timeoutMs: 2000,
                });

                expect(result.outcome).toEqual({ok: true, status: 200});
                expect(warn).toHaveBeenCalledTimes(1);
                expect(warn).toHaveBeenCalledWith(expect.stringContaining("n1"), expect.any(Error));
            } finally {
                warn.mockRestore();
            }
        });

        it("fails closed when Docktor's own container cannot be inspected", async () => {
            const docker = scriptedDocker(
                targetOn({app_default: {IPAddress: "127.0.0.1", NetworkID: "n1"}}, "app"),
                new Error("No such container"),
            );

            const result = await newTransport(docker, SELF).probe({
                containerId: "c1",
                url: "http://localhost:8080/",
                timeoutMs: 1000,
            });

            expect(result.outcome).toEqual({ok: false, reason: {kind: "network-unreachable"}});
            expect(docker.connectNetwork).not.toHaveBeenCalled();
        });

        it("reports no address for host or none networking, where no network has an address", async () => {
            const docker = scriptedDocker(targetOn({host: {IPAddress: "", NetworkID: "n-host"}}), DOCKTOR_ONLY);

            const result = await newTransport(docker, SELF).probe({
                containerId: "c1",
                url: "http://localhost:8080/",
                timeoutMs: 1000,
            });

            expect(result.outcome).toEqual({ok: false, reason: {kind: "no-address"}});
            expect(docker.connectNetwork).not.toHaveBeenCalled();
        });

        it("requests the container address directly, without inspecting itself, when Docktor is not containerized", async () => {
            const {port} = await startServer((_req, res) => res.writeHead(200).end());
            const docker = fakeDocker(targetOn({app_default: {IPAddress: "127.0.0.1", NetworkID: "n1"}}, "app"));

            const result = await newTransport(docker, NOT_CONTAINERIZED).probe({
                containerId: "c1",
                url: `http://localhost:${port}/`,
                timeoutMs: 2000,
            });

            expect(result.outcome).toEqual({ok: true, status: 200});
            expect(docker.inspectContainer).toHaveBeenCalledExactlyOnceWith("c1");
            expect(docker.connectNetwork).not.toHaveBeenCalled();
            expect(docker.disconnectNetwork).not.toHaveBeenCalled();
        });
    });

    describe("sweepStaleAttachments (amended D-05, T-14-43)", () => {
        const selfWith = (networks: Record<string, TestNetwork>) => inspectInfo({networks});

        it("disconnects only the endpoints carrying the probe alias and resolves their count", async () => {
            const docker = fakeDocker(
                selfWith({
                    a: {IPAddress: "10.0.0.2", NetworkID: "na", Aliases: [PROBE_ENDPOINT_ALIAS, "x"]},
                    b: {IPAddress: "10.0.1.2", NetworkID: "nb", Aliases: ["docktor"]},
                }),
            );

            const removed = await newTransport(docker, SELF).sweepStaleAttachments();

            expect(removed).toBe(1);
            expect(docker.inspectContainer).toHaveBeenCalledWith(SELF_ID);
            expect(docker.disconnectNetwork).toHaveBeenCalledExactlyOnceWith("na", SELF_ID);
        });

        it("makes no Docker call and resolves 0 when Docktor is not containerized", async () => {
            const docker = fakeDocker(selfWith({}));

            const removed = await newTransport(docker, NOT_CONTAINERIZED).sweepStaleAttachments();

            expect(removed).toBe(0);
            expect(docker.inspectContainer).not.toHaveBeenCalled();
            expect(docker.disconnectNetwork).not.toHaveBeenCalled();
        });

        it("logs a failed disconnect, does not count it and carries on with the next endpoint", async () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
            try {
                const docker = fakeDocker(
                    selfWith({
                        a: {IPAddress: "10.0.0.2", NetworkID: "na", Aliases: [PROBE_ENDPOINT_ALIAS]},
                        b: {IPAddress: "10.0.1.2", NetworkID: "nb", Aliases: [PROBE_ENDPOINT_ALIAS]},
                    }),
                );
                docker.disconnectNetwork.mockRejectedValueOnce(new Error("busy"));

                const removed = await newTransport(docker, SELF).sweepStaleAttachments();

                expect(removed).toBe(1);
                expect(docker.disconnectNetwork).toHaveBeenCalledTimes(2);
                expect(warn).toHaveBeenCalledWith(expect.stringContaining('"a"'), expect.any(Error));
            } finally {
                warn.mockRestore();
            }
        });

        it("never rejects when the inspect of its own container fails", async () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
            try {
                const docker = fakeDocker(new Error("daemon down"));

                await expect(newTransport(docker, SELF).sweepStaleAttachments()).resolves.toBe(0);
                expect(warn).toHaveBeenCalled();
            } finally {
                warn.mockRestore();
            }
        });
    });
});
