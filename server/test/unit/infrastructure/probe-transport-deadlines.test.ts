import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import http from "node:http";
import type {AddressInfo} from "node:net";
import type Dockerode from "dockerode";
import {PROBE_DOCKER_CALL_TIMEOUT_MS} from "../../../src/domain/health-probe.js";
import {
    PROBE_ENDPOINT_ALIAS,
    ProbeTransport,
    type SelfContainer,
} from "../../../src/infrastructure/probe-transport.js";

// CR-01: no Docker call on the probe path may hang a probe, an attachment or
// the startup sweep for longer than PROBE_DOCKER_CALL_TIMEOUT_MS (D-02, D-08).

const STARTED_AT = "2026-10-08T10:00:00.000000000Z";
const SELF_ID = "self1";
const SELF: SelfContainer = {containerId: async () => SELF_ID};
const NOT_CONTAINERIZED: SelfContainer = {containerId: async () => null};
const NETWORK_UNREACHABLE = {containerStartedAt: STARTED_AT, outcome: {ok: false, reason: {kind: "network-unreachable"}}};
const NEVER = <T>(): Promise<T> => new Promise<T>(() => {});

interface TestNetwork {
    IPAddress: string;
    NetworkID?: string;
    Aliases?: string[];
}

function inspectInfo(networks: Record<string, TestNetwork>, labels: Record<string, string> = {}): Dockerode.ContainerInspectInfo {
    return {
        State: {StartedAt: STARTED_AT},
        Config: {Labels: labels},
        NetworkSettings: {Networks: networks},
    } as unknown as Dockerode.ContainerInspectInfo;
}

const TARGET = inspectInfo({app_default: {IPAddress: "127.0.0.1", NetworkID: "n1"}}, {"com.docker.compose.project": "app"});
const DOCKTOR_ONLY = inspectInfo({docktor_default: {IPAddress: "172.20.0.2", NetworkID: "n-docktor", Aliases: ["docktor"]}});

// Answers the target container's inspect and, separately, Docktor's own.
function scriptedDocker(target: Dockerode.ContainerInspectInfo, self: Dockerode.ContainerInspectInfo) {
    return {
        inspectContainer: vi.fn(async (containerId: string, _signal?: AbortSignal) =>
            containerId === SELF_ID ? self : target,
        ),
        connectNetwork: vi.fn(
            async (_networkId: string, _containerId: string, _aliases: readonly string[], _signal?: AbortSignal) => {},
        ),
        disconnectNetwork: vi.fn(async (_networkId: string, _containerId: string, _signal?: AbortSignal) => {}),
    };
}

// Lets code that only awaits fakes (no real I/O) run up to its next hung call.
const flush = (): Promise<void> => vi.advanceTimersByTimeAsync(0);
const expire = (): Promise<void> => vi.advanceTimersByTimeAsync(PROBE_DOCKER_CALL_TIMEOUT_MS);

describe("ProbeTransport Docker call deadlines (CR-01, amended D-05)", () => {
    const servers: http.Server[] = [];
    let consoleWarn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        // Only the timers the deadlines use: the real local HTTP server must keep working.
        vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout"]});
        consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    });

    afterEach(async () => {
        vi.useRealTimers();
        consoleWarn.mockRestore();
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

    async function startServer(): Promise<{url: string; seen: string[]}> {
        const seen: string[] = [];
        const server = http.createServer((req, res) => {
            seen.push(req.url ?? "");
            res.writeHead(200).end();
        });
        servers.push(server);
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        return {url: `http://localhost:${(server.address() as AddressInfo).port}/`, seen};
    }

    // timeoutMs is long so advancing fake time never trips the request's own deadline.
    const requestFor = (url: string) => ({containerId: "c1", url, timeoutMs: 30_000});

    it("aborts the signal handed to the target inspect when its deadline fires", async () => {
        const signals: AbortSignal[] = [];
        const docker = scriptedDocker(TARGET, DOCKTOR_ONLY);
        docker.inspectContainer.mockImplementation((_id: string, signal?: AbortSignal) => {
            if (signal) signals.push(signal);
            return NEVER<Dockerode.ContainerInspectInfo>();
        });

        const outcome = new ProbeTransport(docker, NOT_CONTAINERIZED).probe(requestFor("http://localhost:8080/"));
        await flush();
        expect(signals).toHaveLength(1);
        expect(signals[0]?.aborted).toBe(false);
        await expire();
        await outcome;

        expect(signals[0]?.aborted).toBe(true);
    });

    it("fails closed without a connect or a request when Docktor's own inspect never settles", async () => {
        const {url, seen} = await startServer();
        const docker = scriptedDocker(TARGET, DOCKTOR_ONLY);
        docker.inspectContainer.mockImplementation((id: string) =>
            id === SELF_ID ? NEVER<Dockerode.ContainerInspectInfo>() : Promise.resolve(TARGET),
        );

        const outcome = new ProbeTransport(docker, SELF).probe(requestFor(url));
        await flush();
        await expire();

        await expect(outcome).resolves.toEqual({containerStartedAt: STARTED_AT, outcome: NETWORK_UNREACHABLE.outcome});
        expect(docker.connectNetwork).not.toHaveBeenCalled();
        expect(seen).toHaveLength(0);
    });

    it("fails closed for the probe that hung on connect and for the one that joined its pending attachment", async () => {
        const {url, seen} = await startServer();
        const docker = scriptedDocker(TARGET, DOCKTOR_ONLY);
        docker.connectNetwork.mockImplementation(() => NEVER<void>());
        const transport = new ProbeTransport(docker, SELF);

        const first = transport.probe(requestFor(url));
        const waiter = transport.probe(requestFor(url));
        await flush();
        expect(docker.connectNetwork).toHaveBeenCalledTimes(1);
        await expire();

        await expect(first).resolves.toEqual(NETWORK_UNREACHABLE);
        await expect(waiter).resolves.toEqual(NETWORK_UNREACHABLE);
        expect(seen).toHaveLength(0);
        expect(docker.disconnectNetwork).not.toHaveBeenCalled();
    });

    it("heals a connect that succeeds only after its deadline on the next attach cycle", async () => {
        const {url, seen} = await startServer();
        const docker = scriptedDocker(TARGET, DOCKTOR_ONLY);
        let finishLateConnect: () => void = () => {};
        docker.connectNetwork.mockImplementationOnce(() => new Promise<void>((resolve) => (finishLateConnect = resolve)));
        const transport = new ProbeTransport(docker, SELF);

        const missed = transport.probe(requestFor(url));
        await flush();
        await expire();
        await expect(missed).resolves.toEqual(NETWORK_UNREACHABLE);
        finishLateConnect();

        // The endpoint now exists: the daemon answers the next connect with HTTP 403.
        docker.connectNetwork.mockRejectedValue(
            Object.assign(new Error("endpoint with name docktor already exists in network app_default"), {statusCode: 403}),
        );
        const recovered = await transport.probe(requestFor(url));

        expect(recovered.outcome).toEqual({ok: true, status: 200});
        expect(docker.connectNetwork).toHaveBeenCalledTimes(2);
        expect(seen).toHaveLength(1);
        expect(docker.disconnectNetwork).toHaveBeenCalledExactlyOnceWith("n1", SELF_ID, expect.any(AbortSignal));
    });

    it("keeps the outcome, warns and does not block the next probe on the network when a disconnect never settles", async () => {
        const {url} = await startServer();
        const docker = scriptedDocker(TARGET, DOCKTOR_ONLY);
        docker.disconnectNetwork.mockImplementation(() => NEVER<void>());
        const transport = new ProbeTransport(docker, SELF);

        const first = transport.probe(requestFor(url));
        await vi.waitFor(() => expect(docker.disconnectNetwork).toHaveBeenCalledTimes(1));
        // Starts while the first probe's detach is still hung.
        const second = transport.probe(requestFor(url));
        await flush();
        expect(docker.connectNetwork).toHaveBeenCalledTimes(1);

        await expire();
        await expect(first).resolves.toEqual({containerStartedAt: STARTED_AT, outcome: {ok: true, status: 200}});
        expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining("n1"), expect.any(Error));

        await vi.waitFor(() => expect(docker.disconnectNetwork).toHaveBeenCalledTimes(2));
        expect(docker.connectNetwork).toHaveBeenCalledTimes(2);
        await expire();
        await expect(second).resolves.toEqual({containerStartedAt: STARTED_AT, outcome: {ok: true, status: 200}});
    });

    describe("sweepStaleAttachments", () => {
        const MARKED = {Aliases: [PROBE_ENDPOINT_ALIAS]};

        it("resolves 0 with a warning when the inspect of Docktor's own container never settles", async () => {
            const docker = scriptedDocker(TARGET, DOCKTOR_ONLY);
            docker.inspectContainer.mockImplementation(() => NEVER<Dockerode.ContainerInspectInfo>());

            const removed = new ProbeTransport(docker, SELF).sweepStaleAttachments();
            await flush();
            await expire();

            await expect(removed).resolves.toBe(0);
            expect(consoleWarn).toHaveBeenCalled();
            expect(docker.disconnectNetwork).not.toHaveBeenCalled();
        });

        it("logs an endpoint whose disconnect never settles, does not count it and still removes the next one", async () => {
            const self = inspectInfo({
                a: {IPAddress: "10.0.0.2", NetworkID: "na", ...MARKED},
                b: {IPAddress: "10.0.1.2", NetworkID: "nb", ...MARKED},
            });
            const docker = scriptedDocker(TARGET, self);
            docker.disconnectNetwork.mockImplementationOnce(() => NEVER<void>());

            const removed = new ProbeTransport(docker, SELF).sweepStaleAttachments();
            await flush();
            await expire();

            await expect(removed).resolves.toBe(1);
            expect(docker.disconnectNetwork).toHaveBeenCalledTimes(2);
            expect(docker.disconnectNetwork).toHaveBeenLastCalledWith("nb", SELF_ID, expect.any(AbortSignal));
            expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('"a"'), expect.any(Error));
        });
    });
});
