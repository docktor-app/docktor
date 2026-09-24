import {beforeEach, describe, expect, it, vi} from "vitest"
import {InMemoryEventBus} from "../../../src/infrastructure/event-bus.js"
import {subscribeStackEvents} from "../../../src/application/subscribers/stack-event-subscriber.js"

function createMockRepo() {
    return {
        createEvent: vi.fn().mockResolvedValue({id: "evt-1"}),
    }
}

describe("subscribeStackEvents", () => {
    let bus: InMemoryEventBus
    let repo: ReturnType<typeof createMockRepo>

    beforeEach(() => {
        bus = new InMemoryEventBus()
        repo = createMockRepo()
    })

    it("writes exactly one config_changed audit row for an externally-originated compose change, with the compose payload string byte-identical to the current call site's", () => {
        subscribeStackEvents(bus, repo)

        bus.emit("stack.config_changed", {
            stackId: "my-app",
            newHash: "def456",
            source: "external",
            previousHash: "abc123",
            changedFile: "compose",
        })

        expect(repo.createEvent).toHaveBeenCalledTimes(1)
        expect(repo.createEvent).toHaveBeenCalledWith({
            stackId: "my-app",
            type: "config_changed",
            payload: '{"oldHash":"abc123","newHash":"def456"}',
        })
    })

    it("writes exactly one config_changed audit row for an externally-originated env change, with the third 'source: env' key in the same order the current call site adds it", () => {
        subscribeStackEvents(bus, repo)

        bus.emit("stack.config_changed", {
            stackId: "my-app",
            newHash: "new-env-hash",
            source: "external",
            previousHash: "old-env-hash",
            changedFile: "env",
        })

        expect(repo.createEvent).toHaveBeenCalledTimes(1)
        expect(repo.createEvent).toHaveBeenCalledWith({
            stackId: "my-app",
            type: "config_changed",
            payload: '{"oldHash":"old-env-hash","newHash":"new-env-hash","source":"env"}',
        })
    })

    it("writes no audit row for an app-originated configuration-changed event", () => {
        subscribeStackEvents(bus, repo)

        bus.emit("stack.config_changed", {
            stackId: "my-app",
            newHash: "def456",
            source: "app",
        })

        expect(repo.createEvent).not.toHaveBeenCalled()
    })

    it("writes exactly one config_error audit row with the error type value and the message passed through unchanged", () => {
        subscribeStackEvents(bus, repo)

        bus.emit("stack.config_error", {
            stackId: "my-app",
            message: "Invalid YAML: bad indentation",
        })

        expect(repo.createEvent).toHaveBeenCalledTimes(1)
        expect(repo.createEvent).toHaveBeenCalledWith({
            stackId: "my-app",
            type: "config_error",
            message: "Invalid YAML: bad indentation",
        })
    })

    it("does not let a rejecting createEvent() propagate out of emit, and logs the rejection once naming the event", async () => {
        subscribeStackEvents(bus, repo)
        repo.createEvent.mockRejectedValue(new Error("db down"))
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

        expect(() =>
            bus.emit("stack.config_changed", {
                stackId: "my-app",
                newHash: "def456",
                source: "external",
                previousHash: "abc123",
                changedFile: "compose",
            }),
        ).not.toThrow()

        await vi.waitFor(() => {
            expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
        })
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining("stack.config_changed"),
            expect.any(Error),
        )
        consoleErrorSpy.mockRestore()
    })

    it("does not let a rejecting createEvent() from one subscriber prevent a second subscriber for the same event from running", () => {
        subscribeStackEvents(bus, repo)
        repo.createEvent.mockRejectedValue(new Error("db down"))
        const secondSubscriber = vi.fn()
        bus.subscribe("stack.config_changed", secondSubscriber)
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

        bus.emit("stack.config_changed", {
            stackId: "my-app",
            newHash: "def456",
            source: "external",
            previousHash: "abc123",
            changedFile: "compose",
        })

        expect(secondSubscriber).toHaveBeenCalledTimes(1)
        consoleErrorSpy.mockRestore()
    })

    it("returns a disposer that detaches both subscriptions", () => {
        const dispose = subscribeStackEvents(bus, repo)

        dispose()

        bus.emit("stack.config_changed", {
            stackId: "my-app",
            newHash: "def456",
            source: "external",
            previousHash: "abc123",
            changedFile: "compose",
        })
        bus.emit("stack.config_error", {stackId: "my-app", message: "boom"})

        expect(repo.createEvent).not.toHaveBeenCalled()
    })
})
