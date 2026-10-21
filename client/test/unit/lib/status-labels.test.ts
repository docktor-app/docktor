import {describe, expect, it} from "vitest";

import {KNOWN_STACK_STATUSES, formatStatusLabel, getStackStatusPresentation} from "@/lib/status-labels";

describe("formatStatusLabel", () => {
    it.each([
        ["BACKING_UP", "backing up"],
        ["RUNNING", "running"],
        ["running", "running"],
        ["WEIRD_STATE", "weird state"],
        ["", ""],
    ])("formats %j as %j", (raw, expected) => {
        expect(formatStatusLabel(raw)).toBe(expected);
    });
});

describe("getStackStatusPresentation", () => {
    it.each(KNOWN_STACK_STATUSES)("labels %s lowercase with underscores as spaces (UI-02 casing guard)", (status) => {
        const {label} = getStackStatusPresentation(status);
        expect(label).toBe(status.replaceAll("_", " ").toLowerCase());
        expect(label).toMatch(/^[a-z ]+$/);
    });

    it.each([
        ["RUNNING", "green", true, false],
        ["HEALTHY", "green", true, false],
        ["BACKING_UP", "blue", false, true],
        ["DEPLOYING", "blue", false, true],
        ["UPDATING", "blue", false, true],
        ["RESTORING", "neutral", false, true],
        ["MIGRATING", "neutral", false, true],
        ["UNHEALTHY", "red", false, false],
        ["ERROR", "red", false, false],
        ["STOPPED", "neutral", false, false],
        ["DRAFT", "neutral", false, false],
    ])("keeps tone and pulses for %s", (status, tone, dotPulse, badgePulse) => {
        expect(getStackStatusPresentation(status)).toMatchObject({tone, dotPulse, badgePulse});
    });

    it("covers all eleven known statuses", () => {
        expect(KNOWN_STACK_STATUSES).toHaveLength(11);
    });

    it("degrades an unknown status to a lowercase neutral static indicator", () => {
        expect(getStackStatusPresentation("WEIRD_STATE")).toEqual({
            label: "weird state",
            tone: "neutral",
            dotPulse: false,
            badgePulse: false,
        });
    });

    it("treats inherited Object keys as unknown", () => {
        const presentation = getStackStatusPresentation("toString");
        expect(presentation.label).toBe("tostring");
        expect(presentation.tone).toBe("neutral");
        expect(presentation.dotPulse).toBe(false);
    });

    it("does not throw on an empty string", () => {
        expect(getStackStatusPresentation("").label).toBe("");
    });
});
