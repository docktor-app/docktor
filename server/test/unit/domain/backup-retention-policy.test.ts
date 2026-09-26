import {describe, expect, it} from "vitest";
import {DEFAULT_RETENTION_POLICY, parseRetentionPolicy} from "../../../src/domain/backup-retention-policy.js";

describe("parseRetentionPolicy", () => {
    it("parses a well-formed JSON policy string to exactly those values", () => {
        const result = parseRetentionPolicy('{"keepDaily":5,"keepWeekly":2,"keepMonthly":6}');

        expect(result).toEqual({keepDaily: 5, keepWeekly: 2, keepMonthly: 6});
    });

    it("returns the default policy for a null input", () => {
        expect(parseRetentionPolicy(null)).toEqual({keepDaily: 7, keepWeekly: 4, keepMonthly: 12});
    });

    it("returns the default policy for an empty-string input", () => {
        expect(parseRetentionPolicy("")).toEqual({keepDaily: 7, keepWeekly: 4, keepMonthly: 12});
    });

    it("returns the default policy for a syntactically invalid JSON string, without throwing", () => {
        expect(() => parseRetentionPolicy("{not valid json")).not.toThrow();
        expect(parseRetentionPolicy("{not valid json")).toEqual({keepDaily: 7, keepWeekly: 4, keepMonthly: 12});
    });

    it("returns the default policy when the JSON parses to a number rather than an object", () => {
        expect(parseRetentionPolicy("42")).toEqual({keepDaily: 7, keepWeekly: 4, keepMonthly: 12});
    });

    it("returns the default policy when the JSON parses to a string rather than an object", () => {
        expect(parseRetentionPolicy('"not-a-policy"')).toEqual({keepDaily: 7, keepWeekly: 4, keepMonthly: 12});
    });

    it("returns the default policy when the JSON parses to an array rather than an object", () => {
        expect(parseRetentionPolicy("[1,2,3]")).toEqual({keepDaily: 7, keepWeekly: 4, keepMonthly: 12});
    });

    it("returns a JSON object missing one of the three keys as-is, pinning the pre-extraction behaviour of no per-key validation", () => {
        const result = parseRetentionPolicy('{"keepDaily":5}');

        expect(result).toEqual({keepDaily: 5});
        expect((result as {keepWeekly?: number}).keepWeekly).toBeUndefined();
    });

    it("exposes a default export that callers cannot mutate into the module's own state", () => {
        const first = parseRetentionPolicy(null);
        first.keepDaily = 999;

        const second = parseRetentionPolicy(null);

        expect(second).toEqual({keepDaily: 7, keepWeekly: 4, keepMonthly: 12});
        expect(() => {
            (DEFAULT_RETENTION_POLICY as {keepDaily: number}).keepDaily = 999;
        }).toThrow();
        expect(DEFAULT_RETENTION_POLICY).toEqual({keepDaily: 7, keepWeekly: 4, keepMonthly: 12});
    });
});
