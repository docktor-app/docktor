import {describe, expect, it} from "vitest";
import {
    createRetryAfterProbe,
    formatRetryAfter,
    RETRY_AFTER_HEADER,
    readRetryAfterSeconds,
} from "../../../src/lib/rate-limit";

describe("createRetryAfterProbe", () => {
    it("names the wait from the X-Retry-After header of the failed call", () => {
        const probe = createRetryAfterProbe();

        probe.fetchOptions.onError({response: {headers: new Headers({"X-Retry-After": "600"})}});

        expect(probe.message()).toBe("Too many attempts. Try again in 10 minutes.");
    });

    it("falls back to the generic message when no call failed or the header is missing", () => {
        const probe = createRetryAfterProbe();
        expect(probe.message()).toBe("Too many attempts. Try again in a few minutes.");

        probe.fetchOptions.onError({response: {headers: new Headers()}});
        expect(probe.message()).toBe("Too many attempts. Try again in a few minutes.");
    });
});

describe("readRetryAfterSeconds", () => {
    it("reads the X-Retry-After header as a positive integer", () => {
        expect(RETRY_AFTER_HEADER).toBe("X-Retry-After");
        expect(readRetryAfterSeconds(new Headers({"X-Retry-After": "120"}))).toBe(120);
    });

    it.each(["0", "-5", "abc", "1.5", ""])("returns null for the value %j", (value) => {
        expect(readRetryAfterSeconds(new Headers({"X-Retry-After": value}))).toBeNull();
    });

    it("returns null when the header is missing", () => {
        expect(readRetryAfterSeconds(new Headers())).toBeNull();
    });

    it("returns null when there are no headers at all", () => {
        expect(readRetryAfterSeconds(null)).toBeNull();
        expect(readRetryAfterSeconds(undefined)).toBeNull();
    });
});

describe("formatRetryAfter", () => {
    it.each([
        [120, "Too many attempts. Try again in 2 minutes."],
        [60, "Too many attempts. Try again in 1 minute."],
        [61, "Too many attempts. Try again in 2 minutes."],
        [1, "Too many attempts. Try again in 1 minute."],
        [900, "Too many attempts. Try again in 15 minutes."],
    ])("formats %d seconds", (seconds, expected) => {
        expect(formatRetryAfter(seconds)).toBe(expected);
    });

    it("falls back to a generic message without a usable wait time", () => {
        expect(formatRetryAfter(null)).toBe("Too many attempts. Try again in a few minutes.");
    });
});
