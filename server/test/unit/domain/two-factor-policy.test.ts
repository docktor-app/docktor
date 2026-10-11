import {describe, expect, it} from "vitest";
import {
    canChangeMandatory,
    isEnrollmentRequired,
    parseMandatoryFlag,
    REQUIRE_TWO_FACTOR_SETTING_KEY,
} from "../../../src/domain/two-factor-policy.js";

describe("REQUIRE_TWO_FACTOR_SETTING_KEY", () => {
    it("is the Setting row named in D-03", () => {
        expect(REQUIRE_TWO_FACTOR_SETTING_KEY).toBe("auth.requireTwoFactor");
    });
});

describe("parseMandatoryFlag", () => {
    it("is true only for exactly 'true'", () => {
        expect(parseMandatoryFlag("true")).toBe(true);
    });

    it.each([["false"], [null], [undefined], ["TRUE "], ["1"], [""]])("is false for %j", (raw) => {
        expect(parseMandatoryFlag(raw)).toBe(false);
    });
});

describe("isEnrollmentRequired", () => {
    it("is required when mandatory and the user has no two-factor", () => {
        expect(isEnrollmentRequired({mandatory: true, twoFactorEnabled: false})).toBe(true);
        expect(isEnrollmentRequired({mandatory: true, twoFactorEnabled: null})).toBe(true);
        expect(isEnrollmentRequired({mandatory: true, twoFactorEnabled: undefined})).toBe(true);
    });

    it("is not required once the user has two-factor", () => {
        expect(isEnrollmentRequired({mandatory: true, twoFactorEnabled: true})).toBe(false);
    });

    it("is never required while the instance does not require it", () => {
        expect(isEnrollmentRequired({mandatory: false, twoFactorEnabled: false})).toBe(false);
    });
});

describe("canChangeMandatory", () => {
    it("allows a user who has two-factor", () => {
        expect(canChangeMandatory({actorHasTwoFactor: true})).toBe(true);
    });

    it("refuses a user without two-factor", () => {
        expect(canChangeMandatory({actorHasTwoFactor: false})).toBe(false);
    });
});
