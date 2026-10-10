import {describe, expect, it} from "vitest";
import {
    formatUptimePercent,
    formatUptimeWindowLabel,
    getUptimeTone,
    uptimeValueClassName,
} from "@/lib/uptime-format";

describe("formatUptimePercent", () => {
    it.each([
        [null, "—"],
        [100, "100%"],
        [99.96, "99.9%"],
        [99.9, "99.9%"],
        [99.999, "99.9%"],
        [0, "0.0%"],
        [50, "50.0%"],
    ])("formats %s as %s", (input, expected) => {
        expect(formatUptimePercent(input)).toBe(expected);
    });

    it("never displays 100% for measured downtime", () => {
        expect(formatUptimePercent(99.99999)).toBe("99.9%");
    });
});

describe("getUptimeTone", () => {
    it.each([
        [null, "neutral"],
        [100, "green"],
        [99.95, "green"],
        [99.9, "green"],
        [99.89, "yellow"],
        [99, "yellow"],
        [98.99, "red"],
        [0, "red"],
    ] as const)("maps %s to %s", (input, expected) => {
        expect(getUptimeTone(input)).toBe(expected);
    });
});

describe("uptimeValueClassName", () => {
    it("returns the light/dark pair for each coloured tone", () => {
        expect(uptimeValueClassName("green")).toBe("text-green-600 dark:text-green-400");
        expect(uptimeValueClassName("yellow")).toBe("text-yellow-600 dark:text-yellow-400");
        expect(uptimeValueClassName("red")).toBe("text-red-600 dark:text-red-400");
    });

    it("returns undefined for neutral", () => {
        expect(uptimeValueClassName("neutral")).toBeUndefined();
    });
});

describe("formatUptimeWindowLabel", () => {
    const windowStart = "2026-09-08T00:00:00.000Z";

    it("is plain 'Uptime' before the data loads", () => {
        expect(formatUptimeWindowLabel(null)).toBe("Uptime");
    });

    it("names the window when history covers all of it", () => {
        expect(formatUptimeWindowLabel({windowDays: 30, windowStart, since: windowStart})).toBe(
            "Uptime (last 30 days)",
        );
    });

    it("names the window when the stack has no history yet", () => {
        expect(formatUptimeWindowLabel({windowDays: 30, windowStart, since: null})).toBe("Uptime (last 30 days)");
    });

    it("switches to the observed start for a stack younger than the window", () => {
        const since = "2026-09-13T00:00:00.000Z";
        expect(formatUptimeWindowLabel({windowDays: 30, windowStart, since})).toBe(
            `Uptime (since ${new Date(since).toLocaleDateString()})`,
        );
    });
});
