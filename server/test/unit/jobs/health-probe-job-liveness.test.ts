import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import type Dockerode from "dockerode";
import {
    HealthProbeJob,
    MAX_TICK_DURATION_MS,
    START_STEP_TIMEOUT_MS,
    type ProbeJobStack,
} from "../../../src/jobs/health-probe-job.js";
import {IntervalJob} from "../../../src/jobs/job.js";
import type {ProbeObservation} from "../../../src/application/ports/probe-transport-port.js";
import {DeadlineExceededError} from "../../../src/lib/with-deadline.js";
import {ProbeTransport, type SelfContainer} from "../../../src/infrastructure/probe-transport.js";
import {
    PROBE_DEADLINE_MARGIN_MS,
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

const OBSERVATION: ProbeObservation = {containerStartedAt: "2026-10-08T10:00:00.000000000Z", outcome: {ok: true, status: 200}};
const FAILED_OBSERVATION = {containerStartedAt: null, outcome: NETWORK_UNREACHABLE_RESULT};

function deferred<T>() {
    let resolve: (value: T) => void = () => {};
    const promise = new Promise<T>((res) => (resolve = res));
    return {promise, resolve};
}

function serviceBlock(name: string): string {
    return `  ${name}:\n    image: nginx\n    x-docktor:\n      health-probe:\n        url: http://localhost:8080/health\n        timeout: 7\n`;
}

function createJob(options: {services?: string[]} = {}) {
    const names = options.services ?? ["web"];
    const stack: ProbeJobStack = {
        id: "app",
        status: "RUNNING",
        services: names.map((serviceName, i) => ({serviceName, containerId: `c${i}`, containerState: "running"})),
    };
    const compose = `services:\n${names.map(serviceBlock).join("")}`;
    const clock = {now: T0};
    const store = {listStacks: vi.fn(async (): Promise<ReadonlyArray<ProbeJobStack>> => [stack])};
    const transport = {
        probe: vi.fn(async (): Promise<ProbeObservation> => OBSERVATION),
        sweepStaleAttachments: vi.fn(async () => 0),
    };
    const bus = {emit: vi.fn()};
    const ownership = {replaceStack: vi.fn(), retainStacks: vi.fn()};
    const job = new HealthProbeJob({store, readCompose: async () => compose, transport, ownership, bus, now: () => clock.now});
    // run() is protected; the cron schedule is the only other way to reach it.
    const tick = () => (job as unknown as {run(): Promise<void>}).run();
    return {job, clock, store, transport, bus, ownership, tick};
}

describe("HealthProbeJob job-level bounds (CR-01)", () => {
    let consoleWarn: ReturnType<typeof vi.spyOn>;
    let consoleError: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.useFakeTimers();
        consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    function completed(bus: {emit: ReturnType<typeof vi.fn>}) {
        return bus.emit.mock.calls.filter((call) => call[0] === "service.probe_completed").map((call) => call[1]);
    }

    it("records one failed probe when the transport never answers, and ignores a late answer", async () => {
        const ctx = createJob();
        const late = deferred<ProbeObservation>();
        ctx.transport.probe.mockImplementation(() => late.promise);
        await ctx.tick();
        ctx.clock.now = T0 + probeStaggerOffsetMs("app/web");

        let settled = false;
        const run = ctx.tick().finally(() => (settled = true));
        const deadline = 7_000 + PROBE_DEADLINE_MARGIN_MS;
        await vi.advanceTimersByTimeAsync(deadline - 1);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await run;

        expect(completed(ctx.bus)).toEqual([expect.objectContaining(FAILED_OBSERVATION)]);
        expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('"app/web"'));

        late.resolve(OBSERVATION);
        await vi.advanceTimersByTimeAsync(0);
        expect(completed(ctx.bus)).toHaveLength(1);
    });

    it("lets the remaining pool workers drain the queue past one hung probe", async () => {
        const names = Array.from({length: 10}, (_, i) => `svc${i}`);
        const ctx = createJob({services: names});
        ctx.transport.probe.mockImplementationOnce(() => new Promise<ProbeObservation>(() => {}));
        await ctx.tick();
        ctx.clock.now = T0 + PROBE_INTERVAL_MS - 1;

        const run = ctx.tick();
        await vi.advanceTimersByTimeAsync(1_000);

        expect(ctx.transport.probe).toHaveBeenCalledTimes(10);
        expect(completed(ctx.bus)).toHaveLength(9);

        await vi.advanceTimersByTimeAsync(7_000 + PROBE_DEADLINE_MARGIN_MS);
        await run;
        expect(completed(ctx.bus)).toHaveLength(10);
    });

    it("records a failed probe, and still logs the error, when the transport rejects", async () => {
        const ctx = createJob();
        ctx.transport.probe.mockRejectedValue(new Error("boom"));
        await ctx.tick();
        ctx.clock.now = T0 + probeStaggerOffsetMs("app/web");

        await ctx.tick();

        expect(completed(ctx.bus)).toEqual([expect.objectContaining(FAILED_OBSERVATION)]);
        expect(consoleError).toHaveBeenCalledWith('[HealthProbeJob] probe request failed for "app/web":', expect.any(Error));
    });

    describe("start()", () => {
        it("resolves after START_STEP_TIMEOUT_MS when the stale attachment sweep never settles", async () => {
            const ctx = createJob();
            ctx.transport.sweepStaleAttachments.mockImplementation(() => new Promise<number>(() => {}));
            const schedule = vi.spyOn(IntervalJob.prototype, "start").mockResolvedValue(undefined);

            const started = ctx.job.start();
            await vi.advanceTimersByTimeAsync(START_STEP_TIMEOUT_MS);
            await started;

            expect(consoleError).toHaveBeenCalledWith(
                "[HealthProbeJob] stale attachment sweep failed:",
                expect.any(DeadlineExceededError),
            );
            expect(ctx.ownership.replaceStack).toHaveBeenCalled();
            expect(schedule).toHaveBeenCalledTimes(1);
        });

        it("resolves after START_STEP_TIMEOUT_MS when the ownership refresh never settles", async () => {
            const ctx = createJob();
            ctx.store.listStacks.mockImplementation(() => new Promise<ReadonlyArray<ProbeJobStack>>(() => {}));
            const schedule = vi.spyOn(IntervalJob.prototype, "start").mockResolvedValue(undefined);

            const started = ctx.job.start();
            await vi.advanceTimersByTimeAsync(START_STEP_TIMEOUT_MS);
            await started;

            expect(consoleError).toHaveBeenCalledWith(
                "[HealthProbeJob] ownership refresh failed:",
                expect.any(DeadlineExceededError),
            );
            expect(schedule).toHaveBeenCalledTimes(1);
        });
    });

    describe("in-flight watchdog", () => {
        it("replaces a tick stuck past MAX_TICK_DURATION_MS, reports it and keeps the newer tick guard", async () => {
            const ctx = createJob();
            const reporter = {recordRun: vi.fn(), recordError: vi.fn()};
            ctx.job.setHealthReporter(reporter);
            const stale = deferred<ReadonlyArray<ProbeJobStack>>();
            const replacement = deferred<ReadonlyArray<ProbeJobStack>>();
            ctx.store.listStacks.mockImplementationOnce(() => stale.promise).mockImplementationOnce(() => replacement.promise);

            const first = ctx.tick();
            ctx.clock.now = T0 + 5_000;
            await ctx.tick();
            expect(ctx.store.listStacks).toHaveBeenCalledTimes(1);
            expect(reporter.recordError).not.toHaveBeenCalled();

            ctx.clock.now = T0 + MAX_TICK_DURATION_MS;
            const second = ctx.tick();
            await vi.advanceTimersByTimeAsync(0);
            expect(ctx.store.listStacks).toHaveBeenCalledTimes(2);
            expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("watchdog"));
            expect(reporter.recordError).toHaveBeenCalledExactlyOnceWith("HealthProbeJob", expect.any(DeadlineExceededError));

            // The stale tick settling late must not release the newer tick's guard.
            stale.resolve([]);
            await first;
            ctx.clock.now += 1_000;
            await ctx.tick();
            expect(ctx.store.listStacks).toHaveBeenCalledTimes(2);

            replacement.resolve([]);
            await second;
            await ctx.tick();
            expect(ctx.store.listStacks).toHaveBeenCalledTimes(3);
        });
    });
});
