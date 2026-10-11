import {describe, expect, it} from "vitest";
import {
    passwordConfirmSchema,
    recoveryChallengeSchema,
    recoveryCodeSchema,
    totpChallengeSchema,
    totpCodeSchema,
} from "../../../src/validation/account.js";

function firstMessage(result: {success: boolean; error?: {issues: {message: string}[]}}): string | undefined {
    return result.error?.issues[0]?.message;
}

describe("totpCodeSchema", () => {
    it("accepts a six-digit code", () => {
        expect(totpCodeSchema.safeParse({code: "123456"}).success).toBe(true);
    });

    it("trims surrounding whitespace", () => {
        const result = totpCodeSchema.safeParse({code: " 123456 "});
        expect(result.success).toBe(true);
        expect(result.data?.code).toBe("123456");
    });

    it.each(["12345", "1234567", "abcdef", "12 456", ""])("rejects %j with the user-facing message", (code) => {
        const result = totpCodeSchema.safeParse({code});
        expect(result.success).toBe(false);
        expect(firstMessage(result)).toBe("Enter the 6-digit code.");
    });
});

describe("recoveryCodeSchema", () => {
    it("trims whitespace but keeps the case (verification is an exact match)", () => {
        const result = recoveryCodeSchema.safeParse({code: " ab12C-d34Ef "});
        expect(result.success).toBe(true);
        expect(result.data).toEqual({code: "ab12C-d34Ef"});
    });

    it("rejects an empty or whitespace-only code", () => {
        for (const code of ["", "   "]) {
            const result = recoveryCodeSchema.safeParse({code});
            expect(result.success).toBe(false);
            expect(firstMessage(result)).toBe("Enter a recovery code.");
        }
    });
});

describe("passwordConfirmSchema", () => {
    it("accepts a non-empty password", () => {
        expect(passwordConfirmSchema.safeParse({password: "secret"}).success).toBe(true);
    });

    it("rejects an empty password", () => {
        const result = passwordConfirmSchema.safeParse({password: ""});
        expect(result.success).toBe(false);
        expect(firstMessage(result)).toBe("Password is required");
    });
});

describe("login challenge schemas", () => {
    it("totpChallengeSchema requires trustDevice", () => {
        expect(totpChallengeSchema.safeParse({code: "123456", trustDevice: false}).success).toBe(true);
        expect(totpChallengeSchema.safeParse({code: "123456"}).success).toBe(false);
    });

    it("totpChallengeSchema still validates the code", () => {
        expect(totpChallengeSchema.safeParse({code: "12", trustDevice: true}).success).toBe(false);
    });

    it("recoveryChallengeSchema accepts a code with trustDevice", () => {
        expect(recoveryChallengeSchema.safeParse({code: "ab12C-d34Ef", trustDevice: true}).success).toBe(true);
    });

    it("recoveryChallengeSchema requires trustDevice and a code", () => {
        expect(recoveryChallengeSchema.safeParse({code: "ab12C-d34Ef"}).success).toBe(false);
        expect(recoveryChallengeSchema.safeParse({code: "", trustDevice: false}).success).toBe(false);
    });
});
