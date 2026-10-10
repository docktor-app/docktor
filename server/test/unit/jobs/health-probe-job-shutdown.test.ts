import {EventEmitter} from "node:events"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {
    HealthProbeJob,
    SHUTDOWN_DRAIN_MS,
    SHUTDOWN_SWEEP_TIMEOUT_MS,
    type ProbeJobStack,
} from "../../../src/jobs/health-probe-job.js"
import type {ProbeObservation} from "../../../src/application/ports/probe-transport-port.js"
import {PROBE_INTERVAL_MS, probeStaggerOffsetMs} from "../../../src/domain/health-probe.js"
import {installShutdownHandlers, SHUTDOWN_HARD_DEADLINE_MS} from "../../../src/lib/graceful-shutdown.js"

const T0 = 1_700_000_000_000
const OBSERVATION: ProbeObservation = {containerStartedAt: "2026-10-08T10:00:00.000000000Z", outcome: {ok: true, status: 200}}
const WITH_PROBE =
    "services:\n  web:\n    image: nginx\n    x-docktor:\n      health-probe:\n        url: http://localhost:8080/health\n        timeout: 7\n"

function runningStack(): ProbeJobStack {
    return {
        id: "app",
        status: "RUNNING",
        services: [{serviceName: "web", containerId: "c1", containerState: "running"}],
    }
}

function deferredObservation() {
    let resolve: (observation: ProbeObservation) => void = () => undefined
    const promise = new Promise<ProbeObservation>((res) => {
        resolve = res
    })
    return {promise, resolve}
}

function createJob(sweep: () => Promise<number> = async () => 1, stacks: ProbeJobStack[] = [runningStack()]) {
    const clock = {now: T0}
    const store = {listStacks: vi.fn(async () => stacks)}
    const transport = {
        probe: vi.fn(async () => OBSERVATION),
        sweepStaleAttachments: vi.fn(sweep),
    }
    const bus = {emit: vi.fn()}
    const ownership = {replaceStack: vi.fn(), retainStacks: vi.fn()}
    const job = new HealthProbeJob({
        store,
        readCompose: async () => WITH_PROBE,
        transport,
        ownership,
        bus,
        now: () => clock.now,
    })
    const tick = () => (job as unknown as {run(): Promise<void>}).run()
    return {job, clock, store, transport, bus, ownership, tick}
}

describe("HealthProbeJob shutdown (G-14-1a)", () => {
    let consoleWarn: ReturnType<typeof vi.spyOn>
    let consoleError: ReturnType<typeof vi.spyOn>
    let consoleInfo: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.useFakeTimers()
        consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
        consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
        consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined)
    })

    afterEach(() => {
        vi.useRealTimers()
        consoleWarn.mockRestore()
        consoleError.mockRestore()
        consoleInfo.mockRestore()
    })

    describe("stop(): alias sweep", () => {
        it("runs the transport sweep once and resolves", async () => {
            const {job, transport} = createJob()

            await job.stop()

            expect(transport.sweepStaleAttachments).toHaveBeenCalledOnce()
        })

        it("resolves, logging the failure, when the sweep rejects", async () => {
            const {job} = createJob(async () => {
                throw new Error("daemon down")
            })

            await expect(job.stop()).resolves.toBeUndefined()

            expect(consoleError).toHaveBeenCalledOnce()
            expect(String(consoleError.mock.calls[0]?.[0])).toContain("[HealthProbeJob]")
        })

        it("gives up on a sweep that never settles at SHUTDOWN_SWEEP_TIMEOUT_MS", async () => {
            const {job} = createJob(() => new Promise<number>(() => {}))

            let resolved = false
            const stopped = job.stop().then(() => (resolved = true))
            await vi.advanceTimersByTimeAsync(SHUTDOWN_SWEEP_TIMEOUT_MS - 1)
            expect(resolved).toBe(false)
            await vi.advanceTimersByTimeAsync(1)
            await stopped

            expect(resolved).toBe(true)
            expect(consoleError).toHaveBeenCalledOnce()
        })
    })

    describe("stop(): drain, discard and idempotence", () => {
        // Schedules the service on a first tick, then starts its probe on a second one.
        async function startProbe(ctx: ReturnType<typeof createJob>): Promise<{running: Promise<void>}> {
            await ctx.tick()
            ctx.clock.now = T0 + probeStaggerOffsetMs("app/web")
            const running = ctx.tick()
            await vi.advanceTimersByTimeAsync(0)
            expect(ctx.transport.probe).toHaveBeenCalledOnce()
            return {running}
        }

        it("sweeps only after the tick in flight has settled, and delivers that probe's result", async () => {
            const order: string[] = []
            const ctx = createJob(async () => {
                order.push("sweep")
                return 1
            })
            ctx.bus.emit.mockImplementation(() => {
                order.push("emit")
            })
            ctx.transport.probe.mockImplementation(
                () => new Promise<ProbeObservation>((resolve) => setTimeout(() => resolve(OBSERVATION), 500)),
            )
            const {running} = await startProbe(ctx)

            const stopped = ctx.job.stop()
            await vi.advanceTimersByTimeAsync(499)
            expect(ctx.transport.sweepStaleAttachments).not.toHaveBeenCalled()
            await vi.advanceTimersByTimeAsync(1)
            await Promise.all([running, stopped])

            expect(order).toEqual(["emit", "sweep"])
            expect(ctx.bus.emit).toHaveBeenCalledExactlyOnceWith("service.probe_completed", {
                stackId: "app",
                serviceName: "web",
                containerId: "c1",
                containerStartedAt: OBSERVATION.containerStartedAt,
                outcome: OBSERVATION.outcome,
            })
        })

        it("gives up on a probe that never settles at SHUTDOWN_DRAIN_MS, sweeps, and discards its late result", async () => {
            const late = deferredObservation()
            const ctx = createJob()
            ctx.transport.probe.mockImplementation(() => late.promise)
            const {running} = await startProbe(ctx)

            const stopped = ctx.job.stop()
            await vi.advanceTimersByTimeAsync(SHUTDOWN_DRAIN_MS - 1)
            expect(ctx.transport.sweepStaleAttachments).not.toHaveBeenCalled()
            await vi.advanceTimersByTimeAsync(1)
            await stopped
            expect(ctx.transport.sweepStaleAttachments).toHaveBeenCalledOnce()

            // The sweep just detached its network, so this failure is an artefact of shutdown.
            late.resolve({containerStartedAt: null, outcome: {ok: false, reason: {kind: "network-unreachable"}}})
            await running

            expect(ctx.bus.emit).not.toHaveBeenCalled()
        })

        it("starts no queued probe once stop() has begun", async () => {
            const late = deferredObservation()
            const stacks = Array.from(
                {length: 9},
                (_unused, index): ProbeJobStack => ({
                    id: `app${index}`,
                    status: "RUNNING",
                    services: [{serviceName: "web", containerId: `c${index}`, containerState: "running"}],
                }),
            )
            const ctx = createJob(async () => 0, stacks)
            ctx.transport.probe.mockImplementation(() => late.promise)

            await ctx.tick()
            ctx.clock.now = T0 + PROBE_INTERVAL_MS
            const running = ctx.tick()
            await vi.advanceTimersByTimeAsync(0)
            expect(ctx.transport.probe).toHaveBeenCalledTimes(8)

            const stopped = ctx.job.stop()
            await vi.advanceTimersByTimeAsync(SHUTDOWN_DRAIN_MS)
            await stopped
            late.resolve(OBSERVATION)
            await running

            expect(ctx.transport.probe).toHaveBeenCalledTimes(8)
        })

        it("ignores a tick that starts after stop() without listing stacks", async () => {
            const ctx = createJob()
            await ctx.job.stop()
            ctx.store.listStacks.mockClear()

            await ctx.tick()

            expect(ctx.store.listStacks).not.toHaveBeenCalled()
        })

        it("returns the same wind-down for a second stop(): the sweep runs once and both calls resolve", async () => {
            const ctx = createJob()

            const first = ctx.job.stop()
            const second = ctx.job.stop()
            await Promise.all([first, second])

            expect(second).toBe(first)
            expect(ctx.transport.sweepStaleAttachments).toHaveBeenCalledOnce()
        })

        it("re-arms the job on start() after stop(): a tick probes again", async () => {
            const ctx = createJob()
            await ctx.job.stop()

            await ctx.job.start()
            try {
                await ctx.tick()
                ctx.clock.now = T0 + probeStaggerOffsetMs("app/web")
                await ctx.tick()

                expect(ctx.transport.probe).toHaveBeenCalledOnce()
                expect(ctx.bus.emit).toHaveBeenCalledWith(
                    "service.probe_completed",
                    expect.objectContaining({containerId: "c1"}),
                )
            } finally {
                await ctx.job.stop()
            }
        })

        it("delivers results again after a start() that follows a stop() that gave up on a probe", async () => {
            const late = deferredObservation()
            const ctx = createJob()
            ctx.transport.probe.mockImplementationOnce(() => late.promise)
            const {running} = await startProbe(ctx)
            const stopped = ctx.job.stop()
            await vi.advanceTimersByTimeAsync(SHUTDOWN_DRAIN_MS)
            await stopped
            late.resolve(OBSERVATION)
            await running

            await ctx.job.start()
            try {
                ctx.clock.now += PROBE_INTERVAL_MS
                await ctx.tick()

                expect(ctx.bus.emit).toHaveBeenCalledExactlyOnceWith(
                    "service.probe_completed",
                    expect.objectContaining({containerId: "c1"}),
                )
            } finally {
                await ctx.job.stop()
            }
        })
    })

    describe("SIGTERM to exit", () => {
        it("sweeps the attachments, then closes the app, then exits 0, in that order", async () => {
            const order: string[] = []
            const {job, transport} = createJob(async () => {
                order.push("sweep")
                return 1
            })
            const app = {
                close: vi.fn(async () => {
                    order.push("app.close")
                }),
            }
            const exit = vi.fn((code: number) => {
                order.push(`exit(${code})`)
            })
            const processStandIn = new EventEmitter()

            // Wired exactly like server/src/index.ts.
            installShutdownHandlers(
                {
                    steps: [
                        {name: "health probe job", timeoutMs: 5_000, run: () => job.stop()},
                        {name: "server", timeoutMs: 2_500, run: () => app.close()},
                    ],
                    hardDeadlineMs: SHUTDOWN_HARD_DEADLINE_MS,
                    exit,
                    log: {info: vi.fn(), warn: vi.fn(), error: vi.fn()},
                },
                processStandIn,
            )

            processStandIn.emit("SIGTERM")
            await vi.advanceTimersByTimeAsync(0)

            expect(transport.sweepStaleAttachments).toHaveBeenCalledOnce()
            expect(app.close).toHaveBeenCalledOnce()
            expect(order).toEqual(["sweep", "app.close", "exit(0)"])
        })

        it("still closes the app and exits 1 when the probe job step cannot detach in time", async () => {
            const order: string[] = []
            const {job} = createJob(() => new Promise<number>(() => {}))
            const app = {
                close: vi.fn(async () => {
                    order.push("app.close")
                }),
            }
            const exit = vi.fn((code: number) => {
                order.push(`exit(${code})`)
            })
            const processStandIn = new EventEmitter()
            installShutdownHandlers(
                {
                    steps: [
                        {name: "health probe job", timeoutMs: 1_000, run: () => job.stop()},
                        {name: "server", timeoutMs: 2_500, run: () => app.close()},
                    ],
                    hardDeadlineMs: SHUTDOWN_HARD_DEADLINE_MS,
                    exit,
                    log: {info: vi.fn(), warn: vi.fn(), error: vi.fn()},
                },
                processStandIn,
            )

            processStandIn.emit("SIGINT")
            await vi.advanceTimersByTimeAsync(1_000)

            expect(order).toEqual(["app.close", "exit(1)"])
        })
    })
})
