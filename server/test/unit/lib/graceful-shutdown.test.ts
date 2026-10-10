import {EventEmitter} from "node:events"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import {
    createShutdownHandler,
    installShutdownHandlers,
    SHUTDOWN_HARD_DEADLINE_MS,
    type ShutdownStep,
} from "../../../src/lib/graceful-shutdown.js"

function silentLog() {
    return {info: vi.fn(), warn: vi.fn(), error: vi.fn()}
}

function step(name: string, run: () => unknown, timeoutMs = 5_000): ShutdownStep {
    return {name, timeoutMs, run}
}

describe("graceful shutdown", () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("uses a 9 second hard deadline, inside Docker's default 10 second stop grace", () => {
        expect(SHUTDOWN_HARD_DEADLINE_MS).toBe(9_000)
    })

    describe("createShutdownHandler", () => {
        it("runs the steps in order, awaiting each, then exits with code 0", async () => {
            const order: string[] = []
            const exit = vi.fn((_code: number) => order.push("exit"))
            const handler = createShutdownHandler({
                steps: [
                    step("first", async () => {
                        await new Promise((resolve) => setTimeout(resolve, 100))
                        order.push("first")
                    }),
                    step("second", () => {
                        order.push("second")
                    }),
                ],
                hardDeadlineMs: SHUTDOWN_HARD_DEADLINE_MS,
                exit,
                log: silentLog(),
            })

            const done = handler("SIGTERM")
            await vi.advanceTimersByTimeAsync(100)
            await done

            expect(order).toEqual(["first", "second", "exit"])
            expect(exit).toHaveBeenCalledExactlyOnceWith(0)
        })

        it("logs a rejecting step by name, still runs the later steps and exits with code 1", async () => {
            const log = silentLog()
            const exit = vi.fn()
            const later = vi.fn()
            const boom = new Error("boom")
            const handler = createShutdownHandler({
                steps: [
                    step("probe job", () => Promise.reject(boom)),
                    step("server", later),
                ],
                hardDeadlineMs: SHUTDOWN_HARD_DEADLINE_MS,
                exit,
                log,
            })

            await handler("SIGTERM")

            expect(later).toHaveBeenCalledOnce()
            expect(log.error).toHaveBeenCalledOnce()
            expect(String(log.error.mock.calls[0]?.[0])).toContain("probe job")
            expect(log.error.mock.calls[0]).toContain(boom)
            expect(exit).toHaveBeenCalledExactlyOnceWith(1)
        })

        it("treats a synchronously throwing step like a rejecting one", async () => {
            const exit = vi.fn()
            const later = vi.fn()
            const handler = createShutdownHandler({
                steps: [
                    step("throws", () => {
                        throw new Error("sync")
                    }),
                    step("later", later),
                ],
                hardDeadlineMs: SHUTDOWN_HARD_DEADLINE_MS,
                exit,
                log: silentLog(),
            })

            await handler("SIGTERM")

            expect(later).toHaveBeenCalledOnce()
            expect(exit).toHaveBeenCalledExactlyOnceWith(1)
        })

        it("cuts a step that never settles at its own timeout, logs it, and runs the later steps", async () => {
            const log = silentLog()
            const exit = vi.fn()
            const later = vi.fn()
            const handler = createShutdownHandler({
                steps: [
                    step("hangs", () => new Promise(() => {}), 2_000),
                    step("later", later),
                ],
                hardDeadlineMs: SHUTDOWN_HARD_DEADLINE_MS,
                exit,
                log,
            })

            const done = handler("SIGTERM")
            await vi.advanceTimersByTimeAsync(1_999)
            expect(later).not.toHaveBeenCalled()
            await vi.advanceTimersByTimeAsync(1)
            await done

            expect(later).toHaveBeenCalledOnce()
            expect(String(log.error.mock.calls[0]?.[0])).toContain("hangs")
            expect(exit).toHaveBeenCalledExactlyOnceWith(1)
        })

        it("exits with code 1 at the hard deadline, and a step finishing later does not exit again", async () => {
            const exit = vi.fn()
            const log = silentLog()
            const handler = createShutdownHandler({
                steps: [
                    step("slow", () => new Promise((resolve) => setTimeout(resolve, 20_000)), 60_000),
                    step("never reached", vi.fn(), 60_000),
                ],
                hardDeadlineMs: 9_000,
                exit,
                log,
            })

            const done = handler("SIGTERM")
            await vi.advanceTimersByTimeAsync(8_999)
            expect(exit).not.toHaveBeenCalled()
            await vi.advanceTimersByTimeAsync(1)
            expect(exit).toHaveBeenCalledExactlyOnceWith(1)

            await vi.advanceTimersByTimeAsync(20_000)
            await done
            expect(exit).toHaveBeenCalledOnce()
        })

        it("does not fire the hard deadline after a normal exit", async () => {
            const exit = vi.fn()
            const handler = createShutdownHandler({
                steps: [step("quick", () => undefined)],
                hardDeadlineMs: 9_000,
                exit,
                log: silentLog(),
            })

            await handler("SIGTERM")
            await vi.advanceTimersByTimeAsync(20_000)

            expect(exit).toHaveBeenCalledExactlyOnceWith(0)
        })

        it("forces an immediate exit with code 1 on a second signal without running the steps again", async () => {
            const exit = vi.fn()
            const run = vi.fn(() => new Promise<void>(() => {}))
            const handler = createShutdownHandler({
                steps: [step("hangs", run, 5_000)],
                hardDeadlineMs: 9_000,
                exit,
                log: silentLog(),
            })

            void handler("SIGTERM")
            await vi.advanceTimersByTimeAsync(10)
            expect(exit).not.toHaveBeenCalled()

            await handler("SIGINT")

            expect(exit).toHaveBeenCalledExactlyOnceWith(1)
            expect(run).toHaveBeenCalledOnce()

            // The first run winds down later without a second exit.
            await vi.advanceTimersByTimeAsync(30_000)
            expect(exit).toHaveBeenCalledOnce()
        })
    })

    describe("installShutdownHandlers", () => {
        it("starts the shutdown on SIGTERM and on SIGINT", async () => {
            for (const signal of ["SIGTERM", "SIGINT"]) {
                const source = new EventEmitter()
                const exit = vi.fn()
                installShutdownHandlers(
                    {steps: [step("only", () => undefined)], hardDeadlineMs: 9_000, exit, log: silentLog()},
                    source,
                )

                source.emit(signal)
                await vi.advanceTimersByTimeAsync(0)

                expect(exit).toHaveBeenCalledExactlyOnceWith(0)
            }
        })

        it("registers with on, so a second signal reaches the handler", async () => {
            const source = new EventEmitter()
            const exit = vi.fn()
            installShutdownHandlers(
                {steps: [step("hangs", () => new Promise(() => {}), 5_000)], hardDeadlineMs: 9_000, exit, log: silentLog()},
                source,
            )

            source.emit("SIGTERM")
            await vi.advanceTimersByTimeAsync(10)
            source.emit("SIGTERM")
            await vi.advanceTimersByTimeAsync(0)

            expect(exit).toHaveBeenCalledExactlyOnceWith(1)
        })

        it("returns a disposer that removes the listeners", () => {
            const source = new EventEmitter()
            const dispose = installShutdownHandlers(
                {steps: [], hardDeadlineMs: 9_000, exit: vi.fn(), log: silentLog()},
                source,
            )
            expect(source.listenerCount("SIGTERM")).toBe(1)
            expect(source.listenerCount("SIGINT")).toBe(1)

            dispose()

            expect(source.listenerCount("SIGTERM")).toBe(0)
            expect(source.listenerCount("SIGINT")).toBe(0)
        })

        it("listens on the given signals only", () => {
            const source = new EventEmitter()
            installShutdownHandlers(
                {steps: [], hardDeadlineMs: 9_000, exit: vi.fn(), log: silentLog()},
                source,
                ["SIGHUP"],
            )

            expect(source.listenerCount("SIGHUP")).toBe(1)
            expect(source.listenerCount("SIGTERM")).toBe(0)
        })
    })
})
