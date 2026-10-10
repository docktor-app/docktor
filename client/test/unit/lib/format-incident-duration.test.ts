import {describe, expect, it} from "vitest";
import {formatIncidentDuration} from "@/lib/format-incident-duration";

describe("formatIncidentDuration", () => {
    it.each([
        [0, "0s"],
        [999, "0s"],
        [59_000, "59s"],
        [60_000, "1m 0s"],
        [125_000, "2m 5s"],
        [3_599_000, "59m 59s"],
        [3_600_000, "1h 0m"],
        [5_430_000, "1h 30m"],
        [86_399_000, "23h 59m"],
        [86_400_000, "1d 0h"],
        [90_000_000, "1d 1h"],
        [-5_000, "0s"],
    ])("formats %d ms as %s", (ms, expected) => {
        expect(formatIncidentDuration(ms)).toBe(expected);
    });
});
