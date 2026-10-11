import {describe, expect, it} from "vitest";
import {classifyAuthError} from "../../../src/lib/auth-errors";

describe("classifyAuthError", () => {
    it("classifies a 429 as rate-limited", () => {
        expect(classifyAuthError({status: 429})).toBe("rate-limited");
        expect(classifyAuthError({status: 429, message: "Too many requests"})).toBe("rate-limited");
    });

    it.each([
        [{status: 401, message: "Invalid code"}],
        [{status: 401, code: "INVALID_CODE"}],
        [{status: 401, message: "Invalid backup code"}],
        [{status: 401, code: "INVALID_BACKUP_CODE"}],
    ])("classifies %j as invalid-code", (error) => {
        expect(classifyAuthError(error)).toBe("invalid-code");
    });

    it.each([
        [{status: 401, message: "Invalid two factor cookie"}],
        [{code: "INVALID_TWO_FACTOR_COOKIE"}],
    ])("classifies %j as expired", (error) => {
        expect(classifyAuthError(error)).toBe("expired");
    });

    it("classifies a wrong password", () => {
        expect(classifyAuthError({status: 400, message: "Invalid password"})).toBe("invalid-password");
        expect(classifyAuthError({status: 400, code: "INVALID_PASSWORD"})).toBe("invalid-password");
    });

    it("does not mistake the two-factor cookie error for a wrong code", () => {
        expect(classifyAuthError({status: 401, message: "Invalid two factor cookie"})).not.toBe("invalid-code");
    });

    it("classifies everything else as unknown", () => {
        expect(classifyAuthError({status: 500})).toBe("unknown");
        expect(classifyAuthError({status: 401, message: "Invalid email or password"})).toBe("unknown");
        expect(classifyAuthError(null)).toBe("unknown");
        expect(classifyAuthError(undefined)).toBe("unknown");
    });
});
