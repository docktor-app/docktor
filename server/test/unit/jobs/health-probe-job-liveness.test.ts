import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import type Dockerode from "dockerode";
import {HealthProbeJob, type ProbeJobStack} from "../../../src/jobs/health-probe-job.js";
import {ProbeTransport, type SelfContainer} from "../../../src/infrastructure/probe-transport.js";
import {
    PROBE_DOCKER_CALL_TIMEOUT_MS,
    PROBE_INTERVAL_MS,
    probeStaggerOffsetMs,
} from "../../../src/domain/health-probe.js";

const T0 = 1_700_000_000_000;
const WITH_PROBE =
    "services:\n  web:\n    image: nginx\n    x-docktor:\n      health-probe:\n        url: http://localhost:8080/health\n        timeout: 7\n";
const NOT_CONTAINERIZED: SelfContainer = {containerId: async () => null};
const NETWORK_UNREACHABLE_RESULT = {ok: false, reason: {kind: "network-unreachable"}};

function runningStack(): ProbeJobStack {
    return {
        id: "app",
        status: "RUNNING",
        services: [{serviceName: "web", containerId: "c1", containerState: "running"}],
    };
}

// A daemon that accepts the inspect request and never answers it.
function hangingDocker() {
    return {
        inspectContainer: vi.fn((_containerId: string) => new Promise<Dockerode.ContainerInspectInfo>(() => {})),
        connectNetwork: vi.fn(async (_networkId: string, _containerId: string, _aliases: readonly string[]) => {}),
        disconnectNetwork: vi.fn(async (_networkId: string, _containerId: string) => {}),
    };
}

describe("HealthProbeJob liveness (CR-01, D-02, D-06, D-08)", () => {
    let consoleWarn: ReturnType<typeof vi.spyOn>;
    let consoleError: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.useFakeTimers();
        consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        consoleWarn.mockRestore();
        consoleError.mockRestore();
    });

    it("records a failed probe, with a warning, when the target inspect never settles", async () => {
        const docker = hangingDocker();
        const request = {containerId: "c1", url: "http://localhost:8080/health", timeoutMs: 7000};

        let settled = false;
        const outcome = new ProbeTransport(docker, NOT_CONTAINERIZED).probe(request).finally(() => (settled = true));

        await vi.advanceTimersByTimeAsync(PROBE_DOCKER_CALL_TIMEOUT_MS - 1);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);

        await expect(outcome).resolves.toEqual({containerStartedAt: null, outcome: NETWORK_UNREACHABLE_RESULT});
        expect(consoleWarn).toHaveBeenCalledOnce();
        expect(consoleWarn.mock.calls[0]?.[0]).toContain('"c1"');
    });

    it("still reports no-address when the target inspect rejects", async () => {
        const docker = hangingDocker();
        docker.inspectContainer.mockRejectedValue(new Error("no such container"));
        const request = {containerId: "c1", url: "http://localhost:8080/health", timeoutMs: 7000};

        await expect(new ProbeTransport(docker, NOT_CONTAINERIZED).probe(request)).resolves.toEqual({
            containerStartedAt: null,
            outcome: {ok: false, reason: {kind: "no-address"}},
        });
    });

    it("keeps probing on later ticks after a Docker inspect that never settles", async () => {
        const docker = hangingDocker();
        const clock = {now: T0};
        const bus = {emit: vi.fn()};
        const job = new HealthProbeJob({
            store: {listStacks: async () => [runningStack()]},
            readCompose: async () => WITH_PROBE,
            transport: new ProbeTransport(docker, NOT_CONTAINERIZED),
            ownership: {replaceStack: vi.fn(), retainStacks: vi.fn()},
            bus,
            now: () => clock.now,
        });
        // run() is protected; the cron schedule is the only other way to reach it.
        const tick = () => (job as unknown as {run(): Promise<void>}).run();

        await tick();
        expect(docker.inspectContainer).not.toHaveBeenCalled();

        clock.now = T0 + probeStaggerOffsetMs("app/web");
        const first = tick();
        await vi.advanceTimersByTimeAsync(PROBE_DOCKER_CALL_TIMEOUT_MS);
        await first;

        expect(docker.inspectContainer).toHaveBeenCalledTimes(1);
        expect(bus.emit).toHaveBeenCalledExactlyOnceWith("service.probe_completed", {
            stackId: "app",
            serviceName: "web",
            containerId: "c1",
            containerStartedAt: null,
            outcome: NETWORK_UNREACHABLE_RESULT,
        });

        clock.now += PROBE_INTERVAL_MS;
        const second = tick();
        await vi.advanceTimersByTimeAsync(PROBE_DOCKER_CALL_TIMEOUT_MS);
        await second;

        expect(docker.inspectContainer).toHaveBeenCalledTimes(2);
        expect(bus.emit).toHaveBeenCalledTimes(2);
        expect(bus.emit).toHaveBeenLastCalledWith(
            "service.probe_completed",
            expect.objectContaining({outcome: NETWORK_UNREACHABLE_RESULT}),
        );
    });
});
