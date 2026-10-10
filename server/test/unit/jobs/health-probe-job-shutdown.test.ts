import {EventEmitter} from "node:events"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {
    HealthProbeJob,
    SHUTDOWN_SWEEP_TIMEOUT_MS,
    type ProbeJobStack,
} from "../../../src/jobs/health-probe-job.js"
import type {ProbeObservation} from "../../../src/application/ports/probe-transport-port.js"
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

function createJob(sweep: () => Promise<number> = async () => 1) {
    const clock = {now: T0}
    const store = {listStacks: vi.fn(async () => [runningStack()])}
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
