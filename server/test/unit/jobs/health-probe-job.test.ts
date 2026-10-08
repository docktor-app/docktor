import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {HealthProbeJob, PROBE_CONCURRENCY, type ProbeJobStack} from "../../../src/jobs/health-probe-job.js"
import {IntervalJob} from "../../../src/jobs/job.js"
import {parseHealthProbes} from "../../../src/lib/compose-health-probe.js"
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
        status: "RUNNING",
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
    const ownership = {replaceStack: vi.fn(), retainStacks: vi.fn()}
    const job = new HealthProbeJob({store, readCompose, transport, ownership, bus, now: () => clock.now})
    const tick = () => (job as unknown as {run(): Promise<void>}).run()
    return {job, clock, compose, store, readCompose, transport, ownership, bus, tick}
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
        ["with a probe block but no Service row", {stacks: [{id: "app", status: "RUNNING", services: []}], compose: {app: WITH_PROBE}}],
        ["whose container is not running", {stacks: [runningStack({containerState: "exited"})], compose: {app: WITH_PROBE}}],
        ["without a container id", {stacks: [runningStack({containerId: null})], compose: {app: WITH_PROBE}}],
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

function emittedEvents(bus: {emit: ReturnType<typeof vi.fn>}, name: string): unknown[] {
    return bus.emit.mock.calls.filter((call) => call[0] === name).map((call) => call[1])
}

describe("HealthProbeJob lifecycle", () => {
    let consoleError: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    })

    afterEach(() => {
        consoleError.mockRestore()
    })

    // The first tick that sees a key schedules it; one interval later it is due.
    async function probeOnce(ctx: ReturnType<typeof createJob>): Promise<void> {
        await ctx.tick()
        ctx.clock.now += PROBE_INTERVAL_MS
        await ctx.tick()
    }

    it("emits one container-not-running clear when a probed container stops, then stays quiet", async () => {
        const ctx = createJob()
        await probeOnce(ctx)
        expect(ctx.transport.probe).toHaveBeenCalledTimes(1)

        ctx.store.listStacks.mockResolvedValue([runningStack({containerState: "exited"})])
        ctx.clock.now += PROBE_INTERVAL_MS
        await ctx.tick()
        await ctx.tick()

        expect(emittedEvents(ctx.bus, "service.probe_cleared")).toEqual([
            {stackId: "app", serviceName: "web", reason: "container-not-running"},
        ])
        expect(ctx.transport.probe).toHaveBeenCalledTimes(1)
    })

    it("staggers a restarted container anew instead of probing it at once", async () => {
        const ctx = createJob()
        await probeOnce(ctx)
        ctx.store.listStacks.mockResolvedValue([runningStack({containerState: "exited"})])
        ctx.clock.now += PROBE_INTERVAL_MS
        await ctx.tick()

        ctx.store.listStacks.mockResolvedValue([runningStack()])
        ctx.clock.now += PROBE_INTERVAL_MS
        await ctx.tick()
        expect(ctx.transport.probe).toHaveBeenCalledTimes(1)

        ctx.clock.now += probeStaggerOffsetMs("app/web")
        await ctx.tick()
        expect(ctx.transport.probe).toHaveBeenCalledTimes(2)
    })

    it("emits one probe-removed clear when the block is removed from the compose file", async () => {
        const ctx = createJob()
        await probeOnce(ctx)

        ctx.compose.app = WITHOUT_PROBE
        ctx.clock.now += PROBE_INTERVAL_MS
        await ctx.tick()
        await ctx.tick()

        expect(emittedEvents(ctx.bus, "service.probe_cleared")).toEqual([
            {stackId: "app", serviceName: "web", reason: "probe-removed"},
        ])
        expect(ctx.transport.probe).toHaveBeenCalledTimes(1)
    })

    it("clears every scheduled service of a stack that disappears", async () => {
        const twoProbes = `${WITH_PROBE}  db:\n    image: postgres\n    x-docktor:\n      health-probe:\n        url: http://localhost:5432/\n`
        const stack: ProbeJobStack = {
            id: "app",
            status: "RUNNING",
            services: [
                {serviceName: "web", containerId: "c1", containerState: "running"},
                {serviceName: "db", containerId: "c2", containerState: "running"},
            ],
        }
        const ctx = createJob({stacks: [stack], compose: {app: twoProbes}})
        await ctx.tick()

        ctx.store.listStacks.mockResolvedValue([])
        await ctx.tick()

        const cleared = emittedEvents(ctx.bus, "service.probe_cleared")
        expect(cleared).toHaveLength(2)
        expect(cleared).toEqual(
            expect.arrayContaining([
                {stackId: "app", serviceName: "web", reason: "probe-removed"},
                {stackId: "app", serviceName: "db", reason: "probe-removed"},
            ]),
        )
    })

    it("clears a scheduled service whose Service row is gone", async () => {
        const ctx = createJob()
        await ctx.tick()

        ctx.store.listStacks.mockResolvedValue([{id: "app", status: "RUNNING", services: []}])
        await ctx.tick()

        expect(emittedEvents(ctx.bus, "service.probe_cleared")).toEqual([
            {stackId: "app", serviceName: "web", reason: "probe-removed"},
        ])
    })

    it("probes an invalid block as a failure on the same cadence, without any transport call", async () => {
        const invalid = WITH_PROBE.replace("localhost", "example.com")
        const spec = parseHealthProbes(invalid)?.get("web")
        expect(spec?.kind).toBe("invalid")
        const message = spec?.kind === "invalid" ? spec.message : ""
        expect(message).not.toBe("")
        const ctx = createJob({compose: {app: invalid}})

        await probeOnce(ctx)
        ctx.clock.now += PROBE_INTERVAL_MS
        await ctx.tick()

        expect(ctx.transport.probe).not.toHaveBeenCalled()
        const outcome = {ok: false, reason: {kind: "invalid-config", message}}
        expect(emittedEvents(ctx.bus, "service.probe_completed")).toEqual([
            {stackId: "app", serviceName: "web", containerId: "c1", containerStartedAt: null, outcome},
            {stackId: "app", serviceName: "web", containerId: "c1", containerStartedAt: null, outcome},
        ])
    })

    it("keeps the last good probes when the compose file stops parsing", async () => {
        const ctx = createJob()
        await probeOnce(ctx)

        ctx.compose.app = "services:\n  web: [unclosed"
        ctx.clock.now += PROBE_INTERVAL_MS
        await ctx.tick()

        expect(ctx.transport.probe).toHaveBeenCalledTimes(2)
        expect(emittedEvents(ctx.bus, "service.probe_cleared")).toEqual([])
    })

    it("keeps the last good probes when the compose file cannot be read", async () => {
        const ctx = createJob()
        await probeOnce(ctx)

        ctx.readCompose.mockRejectedValue(new Error("EACCES"))
        ctx.clock.now += PROBE_INTERVAL_MS
        await ctx.tick()

        expect(ctx.transport.probe).toHaveBeenCalledTimes(2)
        expect(emittedEvents(ctx.bus, "service.probe_cleared")).toEqual([])
    })

    it("neither probes nor clears a stack in a transitional status, and keeps its schedule", async () => {
        const ctx = createJob()
        await ctx.tick()

        ctx.store.listStacks.mockResolvedValue([{...runningStack({containerState: "exited"}), status: "DEPLOYING"}])
        ctx.compose.app = WITHOUT_PROBE
        ctx.clock.now += PROBE_INTERVAL_MS
        await ctx.tick()
        expect(ctx.transport.probe).not.toHaveBeenCalled()
        expect(emittedEvents(ctx.bus, "service.probe_cleared")).toEqual([])

        // Back to RUNNING: the kept entry is already due, so no new stagger applies.
        ctx.store.listStacks.mockResolvedValue([runningStack()])
        ctx.compose.app = WITH_PROBE
        ctx.clock.now += PROBE_INTERVAL_MS
        await ctx.tick()
        expect(ctx.transport.probe).toHaveBeenCalledTimes(1)
    })

    it("logs and survives a bus failure while emitting a clear", async () => {
        const ctx = createJob()
        await ctx.tick()
        ctx.bus.emit.mockImplementation(() => {
            throw new Error("listener blew up")
        })

        ctx.compose.app = WITHOUT_PROBE
        await expect(ctx.tick()).resolves.toBeUndefined()

        expect(consoleError).toHaveBeenCalledWith("[HealthProbeJob] bus emit failed", expect.any(Error))
    })

    it("runs at most PROBE_CONCURRENCY probes at once", async () => {
        const names = Array.from({length: 10}, (_, i) => `svc${i}`)
        const compose = `services:\n${names.map((name) => `  ${name}:\n    image: x\n    x-docktor:\n      health-probe:\n        url: http://localhost:80/\n`).join("")}`
        const stack: ProbeJobStack = {
            id: "app",
            status: "RUNNING",
            services: names.map((name) => ({serviceName: name, containerId: `c-${name}`, containerState: "running"})),
        }
        const ctx = createJob({stacks: [stack], compose: {app: compose}})
        const pending: Array<() => void> = []
        let inFlight = 0
        let maxInFlight = 0
        ctx.transport.probe.mockImplementation(
            () =>
                new Promise<ProbeObservation>((resolve) => {
                    inFlight++
                    maxInFlight = Math.max(maxInFlight, inFlight)
                    pending.push(() => {
                        inFlight--
                        resolve(OBSERVATION)
                    })
                }),
        )
        await ctx.tick()
        ctx.clock.now += PROBE_INTERVAL_MS

        const running = ctx.tick()
        await vi.waitFor(() => expect(ctx.transport.probe).toHaveBeenCalledTimes(PROBE_CONCURRENCY))
        expect(inFlight).toBe(PROBE_CONCURRENCY)

        for (let finished = 0; finished < names.length; finished++) {
            await vi.waitFor(() => expect(pending.length).toBeGreaterThan(0))
            pending.shift()?.()
        }
        await running

        expect(ctx.transport.probe).toHaveBeenCalledTimes(10)
        expect(maxInFlight).toBe(PROBE_CONCURRENCY)
    })
})

describe("HealthProbeJob ownership (D-07)", () => {
    let consoleError: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    function ownedNames(ownership: {replaceStack: ReturnType<typeof vi.fn>}): string[] {
        const names: unknown = ownership.replaceStack.mock.calls.at(-1)?.[1]
        return names instanceof Object && Symbol.iterator in names ? [...(names as Iterable<string>)] : []
    }

    // Replaces the cron scheduling of IntervalJob.start so a unit test never starts a real timer.
    function stubSchedule() {
        return vi.spyOn(IntervalJob.prototype, "start").mockResolvedValue(undefined)
    }

    it("owns every service with a probe block, valid or invalid (fail-closed)", async () => {
        const compose = `${WITH_PROBE}  db:\n    image: postgres\n    x-docktor:\n      health-probe:\n        url: http://example.com/\n  cache:\n    image: redis\n`
        const ctx = createJob({compose: {app: compose}})

        await ctx.tick()

        expect(ctx.ownership.replaceStack).toHaveBeenCalledExactlyOnceWith("app", expect.anything())
        expect(ownedNames(ctx.ownership).sort()).toEqual(["db", "web"])
    })

    it("releases ownership when the probe block is removed from the compose file", async () => {
        const ctx = createJob()
        await ctx.tick()
        expect(ownedNames(ctx.ownership)).toEqual(["web"])

        ctx.compose.app = WITHOUT_PROBE
        await ctx.tick()

        expect(ownedNames(ctx.ownership)).toEqual([])
    })

    it("retains exactly the listed stacks, so a vanished stack is dropped", async () => {
        const ctx = createJob({stacks: [runningStack({}, "app"), runningStack({}, "other")]})

        await ctx.tick()

        expect(ctx.ownership.retainStacks).toHaveBeenCalledWith(["app", "other"])
    })

    it("keeps the ownership of a stack in a transitional status", async () => {
        const ctx = createJob({stacks: [{...runningStack(), status: "DEPLOYING"}]})

        await ctx.tick()

        expect(ctx.ownership.replaceStack).not.toHaveBeenCalled()
        expect(ctx.ownership.retainStacks).toHaveBeenCalledWith(["app"])
    })

    it("start() seeds ownership before the schedule begins, without probing", async () => {
        const ctx = createJob()
        const schedule = stubSchedule()
        schedule.mockImplementation(async () => {
            expect(ownedNames(ctx.ownership)).toEqual(["web"])
        })

        await ctx.job.start()

        expect(schedule).toHaveBeenCalledTimes(1)
        expect(ctx.ownership.retainStacks).toHaveBeenCalledWith(["app"])
        expect(ctx.transport.probe).not.toHaveBeenCalled()
    })

    it("start() logs a store failure and still resolves", async () => {
        const ctx = createJob()
        ctx.store.listStacks.mockRejectedValue(new Error("db down"))
        const schedule = stubSchedule()

        await expect(ctx.job.start()).resolves.toBeUndefined()

        expect(consoleError).toHaveBeenCalledWith("[HealthProbeJob] ownership refresh failed:", expect.any(Error))
        expect(schedule).toHaveBeenCalledTimes(1)
    })
})
