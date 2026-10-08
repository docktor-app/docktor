import {describe, expect, it} from "vitest";
import {isHealthTransition, normalizeHealth} from "../../../src/domain/service-health.js";

describe("normalizeHealth", () => {
    it("maps undefined and the empty string to null", () => {
        expect(normalizeHealth(undefined)).toBeNull();
        expect(normalizeHealth("")).toBeNull();
    });

    it("maps null to null", () => {
        expect(normalizeHealth(null)).toBeNull();
    });

    it("passes a real health value through", () => {
        expect(normalizeHealth("healthy")).toBe("healthy");
    });
});

describe("isHealthTransition", () => {
    it.each<[string | null | undefined, string | null | undefined, boolean]>([
        [null, "healthy", true],
        ["healthy", "healthy", false],
        [undefined, null, false],
        ["", null, false],
        ["healthy", null, true],
        ["starting", "unhealthy", true],
    ])("(%j, %j) -> %s", (prev, next, expected) => {
        expect(isHealthTransition(prev, next)).toBe(expected);
    });
});
