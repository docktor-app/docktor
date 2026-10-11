import {describe, expect, it} from "vitest";
import {
    canChangeMandatory,
    isEnrollmentRequired,
    isTwoFactorChangePath,
    parseMandatoryFlag,
    planSessionRevocation,
    REQUIRE_TWO_FACTOR_SETTING_KEY,
    TWO_FACTOR_CHANGE_PATHS,
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

describe("TWO_FACTOR_CHANGE_PATHS", () => {
    it("lists the three endpoints that change the credential factor", () => {
        expect([...TWO_FACTOR_CHANGE_PATHS]).toEqual([
            "/two-factor/verify-totp",
            "/two-factor/disable",
            "/two-factor/generate-backup-codes",
        ]);
    });

    it("isTwoFactorChangePath recognises only those paths", () => {
        expect(isTwoFactorChangePath("/two-factor/disable")).toBe(true);
        expect(isTwoFactorChangePath("/two-factor/enable")).toBe(false);
        expect(isTwoFactorChangePath("/sign-in/email")).toBe(false);
    });
});

describe("planSessionRevocation", () => {
    const base = {
        path: "/two-factor/verify-totp",
        succeeded: true,
        actorSessionToken: "a" as string | null,
        twoFactorEnabledBefore: false as boolean | null,
        reissuedSessionToken: "b" as string | null,
    };

    it("revokes others and keeps the re-issued session when verify-totp enables two-factor", () => {
        expect(planSessionRevocation(base)).toEqual({revoke: true, keepToken: "b"});
    });

    it("does not revoke when verify-totp is a plain re-verification (two-factor already on)", () => {
        expect(planSessionRevocation({...base, twoFactorEnabledBefore: true})).toEqual({revoke: false});
    });

    it("does not revoke on the sign-in challenge path (no acting session)", () => {
        expect(
            planSessionRevocation({...base, actorSessionToken: null, twoFactorEnabledBefore: null, reissuedSessionToken: null}),
        ).toEqual({revoke: false});
    });

    it("does not revoke when the call failed", () => {
        expect(planSessionRevocation({...base, succeeded: false})).toEqual({revoke: false});
        expect(planSessionRevocation({...base, path: "/two-factor/disable", succeeded: false})).toEqual({revoke: false});
    });

    it("revokes on disable and keeps the re-issued session", () => {
        expect(
            planSessionRevocation({...base, path: "/two-factor/disable", twoFactorEnabledBefore: true}),
        ).toEqual({revoke: true, keepToken: "b"});
    });

    it("keeps the acting session on generate-backup-codes, which does not re-issue it", () => {
        expect(
            planSessionRevocation({
                ...base,
                path: "/two-factor/generate-backup-codes",
                twoFactorEnabledBefore: true,
                reissuedSessionToken: null,
            }),
        ).toEqual({revoke: true, keepToken: "a"});
    });

    it("does not revoke for any other path", () => {
        expect(planSessionRevocation({...base, path: "/sign-in/email"})).toEqual({revoke: false});
        expect(planSessionRevocation({...base, path: "/two-factor/enable"})).toEqual({revoke: false});
    });
});
