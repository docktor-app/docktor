import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { InMemoryEventBus, domainEventBus } from "../../../src/infrastructure/event-bus.js"

describe("InMemoryEventBus", () => {
    let bus: InMemoryEventBus
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        bus = new InMemoryEventBus()
        consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    })

    afterEach(() => {
        consoleErrorSpy.mockRestore()
    })

    it("still invokes the second subscriber when the first throws synchronously, and emit returns normally", () => {
        const secondCalls: string[] = []
        bus.subscribe("stack.status_changed", () => {
            throw new Error("boom from subscriber A")
        })
        bus.subscribe("stack.status_changed", (payload) => {
            secondCalls.push(payload.stackId)
        })

        expect(() =>
            bus.emit("stack.status_changed", { stackId: "s1", status: "RUNNING" }),
        ).not.toThrow()
        expect(secondCalls).toEqual(["s1"])
    })

    it("still invokes the second subscriber when the first returns a rejected promise, with no unhandled rejection", async () => {
        const secondCalls: string[] = []
        let unhandled: unknown = null
        const onUnhandledRejection = (reason: unknown) => {
            unhandled = reason
        }
        process.on("unhandledRejection", onUnhandledRejection)

        try {
            bus.subscribe("stack.status_changed", async () => {
                throw new Error("boom from async subscriber A")
            })
            bus.subscribe("stack.status_changed", (payload) => {
                secondCalls.push(payload.stackId)
            })

            expect(() =>
                bus.emit("stack.status_changed", { stackId: "s2", status: "RUNNING" }),
            ).not.toThrow()
            expect(secondCalls).toEqual(["s2"])

            // Let the rejected promise's microtask settle before asserting on it.
            await new Promise((resolve) => setImmediate(resolve))
            await new Promise((resolve) => setImmediate(resolve))

            expect(unhandled).toBeNull()
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining("stack.status_changed"),
                expect.any(Error),
            )
        } finally {
            process.off("unhandledRejection", onUnhandledRejection)
        }
    })

    it("logs exactly one error naming the event key when a subscriber throws", () => {
        bus.subscribe("stack.status_changed", () => {
            throw new Error("boom")
        })

        bus.emit("stack.status_changed", { stackId: "s3", status: "RUNNING" })

        expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
        expect(consoleErrorSpy.mock.calls[0]?.[0]).toEqual(
            expect.stringContaining("stack.status_changed"),
        )
    })

    it("does not invoke subscribers registered for a different event key", () => {
        const otherCalls: string[] = []
        bus.subscribe("notification.created", (payload) => {
            otherCalls.push(payload.notificationId)
        })

        bus.emit("stack.status_changed", { stackId: "s4", status: "RUNNING" })

        expect(otherCalls).toEqual([])
    })

    it("unsubscribe removes only that handler, leaving a second handler for the same key in place", () => {
        const firstCalls: string[] = []
        const secondCalls: string[] = []
        const unsubscribeFirst = bus.subscribe("stack.status_changed", (payload) => {
            firstCalls.push(payload.stackId)
        })
        bus.subscribe("stack.status_changed", (payload) => {
            secondCalls.push(payload.stackId)
        })

        unsubscribeFirst()
        bus.emit("stack.status_changed", { stackId: "s5", status: "RUNNING" })

        expect(firstCalls).toEqual([])
        expect(secondCalls).toEqual(["s5"])
    })

    it("calling unsubscribe twice is a no-op and does not remove another handler", () => {
        const secondCalls: string[] = []
        const unsubscribeFirst = bus.subscribe("stack.status_changed", () => {})
        bus.subscribe("stack.status_changed", (payload) => {
            secondCalls.push(payload.stackId)
        })

        unsubscribeFirst()
        unsubscribeFirst()
        bus.emit("stack.status_changed", { stackId: "s6", status: "RUNNING" })

        expect(secondCalls).toEqual(["s6"])
    })

    it("emitting an event with zero subscribers is a no-op that does not throw", () => {
        expect(() =>
            bus.emit("stack.status_changed", { stackId: "s7", status: "RUNNING" }),
        ).not.toThrow()
    })

    it("invokes subscribers in registration order", () => {
        const order: string[] = []
        bus.subscribe("stack.status_changed", () => {
            order.push("first")
        })
        bus.subscribe("stack.status_changed", () => {
            order.push("second")
        })
        bus.subscribe("stack.status_changed", () => {
            order.push("third")
        })

        bus.emit("stack.status_changed", { stackId: "s8", status: "RUNNING" })

        expect(order).toEqual(["first", "second", "third"])
    })

    it("hands each subscriber the exact same payload object that was emitted", () => {
        const received: unknown[] = []
        bus.subscribe("stack.status_changed", (payload) => {
            received.push(payload)
        })
        const payload = { stackId: "s9", status: "RUNNING" }

        bus.emit("stack.status_changed", payload)

        expect(received[0]).toBe(payload)
    })

    it("exports a domainEventBus singleton that is an InMemoryEventBus", () => {
        expect(domainEventBus).toBeInstanceOf(InMemoryEventBus)
    })
})
