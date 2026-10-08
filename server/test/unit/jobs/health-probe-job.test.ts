import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {HealthProbeJob, type ProbeJobStack} from "../../../src/jobs/health-probe-job.js"
import {PROBE_INTERVAL_MS, probeStaggerOffsetMs} from "../../../src/domain/health-probe.js"
import type {ProbeObservation} from "../../../src/application/ports/probe-transport-port.js"

const T0 = 1_700_000_000_000
const STARTED_AT = "2026-10-08T10:00:00.000000000Z"
const OBSERVATION: ProbeObservation = {containerStartedAt: STARTED_AT, outcome: {ok: true, status: 200}}

const WITH_PROBE = "services:\n  web:\n    image: nginx\n    x-docktor:\n      health-probe:\n        url: http://localhost:8080/health\n        timeout: 7\n"
const WITHOUT_PROBE = "services:\n  web:\n    image: nginx\n"

function runningStack(overrides: Partial<ProbeJobStack["services"][number]> = {}, id = "app"): ProbeJobStack {
    return {
        id,
        services: [{serviceName: "web", containerId: "c1", containerState: "running", ...overrides}],
    }
}

function createJob(options: {stacks?: ProbeJobStack[]; compose?: Record<string, string>} = {}) {
    const clock = {now: T0}
    const compose: Record<string, string> = options.compose ?? {app: WITH_PROBE}
    const store = {listStacks: vi.fn(async () => options.stacks ?? [runningStack()])}
    const readCompose = vi.fn(async (stackId: string) => compose[stackId] ?? "")
    const transport = {probe: vi.fn(async () => OBSERVATION)}
    const bus = {emit: vi.fn()}
    const job = new HealthProbeJob({store, readCompose, transport, bus, now: () => clock.now})
    const tick = () => (job as unknown as {run(): Promise<void>}).run()
    return {job, clock, compose, store, readCompose, transport, bus, tick}
}

describe("HealthProbeJob", () => {
    let consoleError: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    })

    afterEach(() => {
        consoleError.mockRestore()
    })

    it("ticks every 5 seconds and does not run on start (D-06)", () => {
        const {job} = createJob()
        const internals = job as unknown as {cronExpression: string; runImmediatelyOnStart: boolean}

        expect(job.name).toBe("HealthProbeJob")
        expect(job.kind).toBe("interval")
        expect(internals.cronExpression).toBe("*/5 * * * * *")
        expect(internals.runImmediatelyOnStart).toBe(false)
    })

    it("probes a running service only once its stagger offset has passed, then every 30 seconds", async () => {
        const offset = probeStaggerOffsetMs("app/web")
        expect(offset).toBeGreaterThan(0)
        const {clock, transport, bus, tick} = createJob()

        await tick()
        expect(transport.probe).not.toHaveBeenCalled()

        clock.now = T0 + offset - 1
        await tick()
        expect(transport.probe).not.toHaveBeenCalled()

        clock.now = T0 + offset
        await tick()
        expect(transport.probe).toHaveBeenCalledExactlyOnceWith({
            containerId: "c1",
            url: "http://localhost:8080/health",
            timeoutMs: 7000,
        })
        expect(bus.emit).toHaveBeenCalledExactlyOnceWith("service.probe_completed", {
            stackId: "app",
            serviceName: "web",
            containerId: "c1",
            containerStartedAt: STARTED_AT,
            outcome: {ok: true, status: 200},
        })

        clock.now = T0 + offset + PROBE_INTERVAL_MS - 5000
        await tick()
        expect(transport.probe).toHaveBeenCalledTimes(1)

        clock.now = T0 + offset + PROBE_INTERVAL_MS
        await tick()
        expect(transport.probe).toHaveBeenCalledTimes(2)
    })

    it.each([
        ["without a probe block", {stacks: [runningStack()], compose: {app: WITHOUT_PROBE}}],
        ["with a probe block but no Service row", {stacks: [{id: "app", services: []}], compose: {app: WITH_PROBE}}],
        ["whose container is not running", {stacks: [runningStack({containerState: "exited"})], compose: {app: WITH_PROBE}}],
        ["without a container id", {stacks: [runningStack({containerId: null})], compose: {app: WITH_PROBE}}],
        ["with an invalid probe block", {stacks: [runningStack()], compose: {app: WITH_PROBE.replace("localhost", "example.com")}}],
        ["whose compose file does not parse", {stacks: [runningStack()], compose: {app: "services:\n  web: [unclosed"}}],
    ])("never probes a service %s", async (_label, options) => {
        const {clock, transport, tick} = createJob(options)

        await tick()
        clock.now = T0 + 2 * PROBE_INTERVAL_MS
        await tick()

        expect(transport.probe).not.toHaveBeenCalled()
    })

    it("picks up a compose edit on the next tick without any redeploy (D-01)", async () => {
        const {clock, compose, transport, tick} = createJob({compose: {app: WITHOUT_PROBE}})
        await tick()

        // The first tick that sees the new block schedules it inside the next
        // interval (stagger); the one after probes it.
        compose.app = WITH_PROBE
        clock.now = T0 + PROBE_INTERVAL_MS
        await tick()
        clock.now = T0 + 2 * PROBE_INTERVAL_MS
        await tick()
        expect(transport.probe).toHaveBeenCalledTimes(1)

        compose.app = WITHOUT_PROBE
        clock.now = T0 + 4 * PROBE_INTERVAL_MS
        await tick()
        expect(transport.probe).toHaveBeenCalledTimes(1)
    })

    it("skips a tick that starts while the previous one is still running", async () => {
        let finishProbe: (observation: ProbeObservation) => void = () => undefined
        const {clock, store, transport, tick} = createJob()
        transport.probe.mockImplementationOnce(() => new Promise<ProbeObservation>((resolve) => { finishProbe = resolve }))
        await tick()
        clock.now = T0 + PROBE_INTERVAL_MS
        const first = tick()
        await vi.waitFor(() => expect(transport.probe).toHaveBeenCalledTimes(1))

        await tick()

        expect(store.listStacks).toHaveBeenCalledTimes(2)
        finishProbe(OBSERVATION)
        await first
        clock.now = T0 + 2 * PROBE_INTERVAL_MS
        await tick()
        expect(store.listStacks).toHaveBeenCalledTimes(3)
    })

    it("keeps probing other stacks when one compose file cannot be read", async () => {
        const stacks = [runningStack({}, "broken"), runningStack({}, "app")]
        const {clock, readCompose, transport, tick} = createJob({stacks, compose: {app: WITH_PROBE}})
        readCompose.mockImplementation(async (stackId: string) => {
            if (stackId === "broken") throw new Error("EACCES")
            return WITH_PROBE
        })
        await tick()

        clock.now = T0 + PROBE_INTERVAL_MS
        await tick()

        expect(transport.probe).toHaveBeenCalledTimes(1)
        expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('"broken"'), expect.any(Error))
    })

    it("logs and survives a bus emit failure", async () => {
        const {clock, bus, tick} = createJob()
        bus.emit.mockImplementation(() => { throw new Error("listener blew up") })
        await tick()

        clock.now = T0 + PROBE_INTERVAL_MS
        await expect(tick()).resolves.toBeUndefined()

        expect(consoleError).toHaveBeenCalledWith("[HealthProbeJob] bus emit failed", expect.any(Error))
    })

    it("keeps going when the transport rejects despite its contract", async () => {
        const stacks = [runningStack({}, "app"), runningStack({serviceName: "web", containerId: "c2"}, "other")]
        const {clock, transport, tick} = createJob({stacks, compose: {app: WITH_PROBE, other: WITH_PROBE}})
        transport.probe.mockRejectedValueOnce(new Error("boom"))
        await tick()

        clock.now = T0 + PROBE_INTERVAL_MS
        await expect(tick()).resolves.toBeUndefined()

        expect(transport.probe).toHaveBeenCalledTimes(2)
    })
})
