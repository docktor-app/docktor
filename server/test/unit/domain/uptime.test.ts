import {describe, expect, it} from "vitest";
import {classifyStatus, computeUptime, windowStartFor} from "../../../src/domain/uptime.js";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("classifyStatus (D-09)", () => {
    it.each(["RUNNING", "HEALTHY"])("classifies %s as up", (status) => {
        expect(classifyStatus(status)).toBe("up");
    });

    it.each(["UNHEALTHY", "ERROR"])("classifies %s as down", (status) => {
        expect(classifyStatus(status)).toBe("down");
    });

    it.each(["DRAFT", "STOPPED", "DEPLOYING", "UPDATING", "BACKING_UP", "RESTORING", "MIGRATING"])(
        "classifies %s as neutral (excluded from both sides)",
        (status) => {
            expect(classifyStatus(status)).toBe("neutral");
        },
    );

    it("classifies an unknown status as neutral", () => {
        expect(classifyStatus("SOMETHING_NEW")).toBe("neutral");
    });
});

describe("windowStartFor", () => {
    it("subtracts whole days from now", () => {
        const now = new Date("2026-10-08T12:00:00Z");
        expect(windowStartFor(now, 30).getTime()).toBe(now.getTime() - 30 * DAY);
    });
});

describe("computeUptime (D-09)", () => {
    const t0 = new Date("2026-09-01T00:00:00Z");
    const at = (offsetMs: number): Date => new Date(t0.getTime() + offsetMs);

    it("returns a null percent and no observation start for an empty list", () => {
        expect(computeUptime([], t0, at(DAY))).toEqual({percent: null, upMs: 0, downMs: 0, observedFrom: null});
    });

    it("clamps an anchor that began before the window to the window start", () => {
        const windowStart = at(0);
        const result = computeUptime(
            [{toStatus: "RUNNING", at: new Date(windowStart.getTime() - DAY)}],
            windowStart,
            at(10 * HOUR),
        );

        expect(result.percent).toBe(100);
        expect(result.upMs).toBe(10 * HOUR);
        expect(result.downMs).toBe(0);
        expect(result.observedFrom).toEqual(windowStart);
    });

    it("counts up and down intervals up to now", () => {
        const result = computeUptime(
            [
                {toStatus: "RUNNING", at: at(0)},
                {toStatus: "UNHEALTHY", at: at(9 * HOUR)},
                {toStatus: "RUNNING", at: at(10 * HOUR)},
            ],
            at(-DAY),
            at(20 * HOUR),
        );

        expect(result.upMs).toBe(19 * HOUR);
        expect(result.downMs).toBe(HOUR);
        expect(result.percent).toBeCloseTo(95, 10);
        expect(result.observedFrom).toEqual(at(0));
    });

    it("excludes neutral intervals from both numerator and denominator", () => {
        const result = computeUptime(
            [
                {toStatus: "RUNNING", at: at(0)},
                {toStatus: "DEPLOYING", at: at(HOUR)},
                {toStatus: "RUNNING", at: at(2 * HOUR)},
            ],
            at(-DAY),
            at(3 * HOUR),
        );

        expect(result.percent).toBe(100);
        expect(result.upMs).toBe(2 * HOUR);
        expect(result.downMs).toBe(0);
    });

    it("returns a null percent when only neutral time was observed", () => {
        const result = computeUptime([{toStatus: "STOPPED", at: at(0)}], at(-DAY), at(5 * HOUR));

        expect(result.percent).toBeNull();
        expect(result.upMs).toBe(0);
        expect(result.downMs).toBe(0);
        expect(result.observedFrom).toEqual(at(0));
    });

    it("treats UNHEALTHY to ERROR as one continuous down period", () => {
        const result = computeUptime(
            [
                {toStatus: "RUNNING", at: at(0)},
                {toStatus: "UNHEALTHY", at: at(HOUR)},
                {toStatus: "ERROR", at: at(2 * HOUR)},
            ],
            at(-DAY),
            at(4 * HOUR),
        );

        expect(result.upMs).toBe(HOUR);
        expect(result.downMs).toBe(3 * HOUR);
        expect(result.percent).toBe(25);
    });

    it("ignores a transition that lies after now", () => {
        const result = computeUptime(
            [
                {toStatus: "RUNNING", at: at(0)},
                {toStatus: "ERROR", at: at(10 * HOUR)},
            ],
            at(-DAY),
            at(5 * HOUR),
        );

        expect(result.upMs).toBe(5 * HOUR);
        expect(result.downMs).toBe(0);
    });
});
