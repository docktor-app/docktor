import {describe, expect, it} from "vitest"
import {ProbedServiceRegistry} from "../../../src/application/probed-service-registry.js"

describe("ProbedServiceRegistry (D-07)", () => {
    it("owns exactly the services given for a stack", () => {
        const registry = new ProbedServiceRegistry()

        registry.replaceStack("a", ["web"])

        expect(registry.isProbeOwned("a", "web")).toBe(true)
        expect(registry.isProbeOwned("a", "db")).toBe(false)
        expect(registry.isProbeOwned("b", "web")).toBe(false)
    })

    it("replaces the previous set of a stack instead of merging into it", () => {
        const registry = new ProbedServiceRegistry()
        registry.replaceStack("a", ["web", "db"])

        registry.replaceStack("a", ["db"])

        expect(registry.isProbeOwned("a", "web")).toBe(false)
        expect(registry.isProbeOwned("a", "db")).toBe(true)
    })

    it("accepts any iterable, such as a Map's keys", () => {
        const registry = new ProbedServiceRegistry()

        registry.replaceStack("a", new Map([["web", 1]]).keys())

        expect(registry.isProbeOwned("a", "web")).toBe(true)
    })

    it("releases a stack's services when it is replaced by an empty set", () => {
        const registry = new ProbedServiceRegistry()
        registry.replaceStack("a", ["web"])

        registry.replaceStack("a", [])

        expect(registry.isProbeOwned("a", "web")).toBe(false)
    })

    it("drops every stack that is not retained", () => {
        const registry = new ProbedServiceRegistry()
        registry.replaceStack("a", ["web"])
        registry.replaceStack("b", ["web"])

        registry.retainStacks(["b"])

        expect(registry.isProbeOwned("a", "web")).toBe(false)
        expect(registry.isProbeOwned("b", "web")).toBe(true)
    })
})
