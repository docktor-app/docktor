import {describe, expect, it} from "vitest";
import {
    isHealthTransition,
    isReplacedContainer,
    normalizeHealth,
    probeOwnedHealth,
} from "../../../src/domain/service-health.js";

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

describe("isReplacedContainer (D-08)", () => {
    it.each<[string | null | undefined, string, boolean]>([
        ["c-old", "c-new", true],
        ["c1", "c1", false],
        [null, "c1", false],
        [undefined, "c1", false],
    ])("(%j, %j) -> %s", (stored, observed, expected) => {
        expect(isReplacedContainer(stored, observed)).toBe(expected);
    });
});

describe("probeOwnedHealth (D-07, D-08)", () => {
    it.each<[string | null | undefined, string, boolean, string | null]>([
        ["unhealthy", "running", true, "starting"],
        ["healthy", "exited", true, null],
        ["healthy", "running", false, "healthy"],
        ["", "running", false, null],
        [undefined, "running", false, null],
    ])("(%j, %j, replaced=%s) -> %j", (stored, state, replaced, expected) => {
        expect(probeOwnedHealth(stored, state, replaced)).toBe(expected);
    });
});
