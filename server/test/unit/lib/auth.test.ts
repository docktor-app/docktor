import {describe, expect, it} from "vitest";
import type {BetterAuthOptions} from "better-auth";
import {auth, buildTrustedOrigins} from "../../../src/lib/auth.js";
import {CLIENT_IP_HEADER, TWO_FACTOR_DISABLED_PATHS} from "../../../src/lib/auth-config.js";

describe("buildTrustedOrigins", () => {
    it("includes only the env URL when the Settings baseUrl is unset", () => {
        expect(buildTrustedOrigins("https://env.example.com", null)).toEqual(["https://env.example.com"]);
    });

    it("includes only the Settings baseUrl when the env URL is unset", () => {
        expect(buildTrustedOrigins(undefined, "https://wizard.example.com")).toEqual([
            "https://wizard.example.com",
        ]);
    });

    it("includes both sources when they differ, so either origin is trusted", () => {
        const result = buildTrustedOrigins("https://env.example.com", "https://wizard.example.com");
        expect(result).toContain("https://env.example.com");
        expect(result).toContain("https://wizard.example.com");
        expect(result).toHaveLength(2);
    });

    it("deduplicates when both sources are the same value", () => {
        expect(buildTrustedOrigins("https://same.example.com", "https://same.example.com")).toEqual([
            "https://same.example.com",
        ]);
    });

    it("falls back to the dev-server default when neither source is set", () => {
        expect(buildTrustedOrigins(undefined, null)).toEqual(["http://localhost:5173"]);
    });

    it("treats an empty-string Settings baseUrl as unset", () => {
        expect(buildTrustedOrigins("https://env.example.com", "")).toEqual(["https://env.example.com"]);
    });
});

describe("auth rate limiting configuration (#46)", () => {
    it("reads the client IP only from the private header Docktor stamps", () => {
        expect(auth.options.advanced?.ipAddress?.ipAddressHeaders).toEqual([CLIENT_IP_HEADER]);
    });

    it("persists limiter counters in the database", () => {
        expect(auth.options.rateLimit?.storage).toBe("database");
    });
});

describe("auth two-factor configuration (#45)", () => {
    it("registers the twoFactor plugin", () => {
        expect(auth.options.plugins?.some((plugin) => plugin.id === "two-factor")).toBe(true);
    });

    it("keeps the origin check on in every environment, including NODE_ENV=test", () => {
        expect(auth.options.advanced?.disableOriginCheck).toBe(false);
    });

    it("keeps the session cookie cache off so revoked sessions stop working immediately", () => {
        const options: BetterAuthOptions = auth.options;
        expect(options.session?.cookieCache?.enabled).not.toBe(true);
    });

    it("closes the endpoints Docktor does not support", () => {
        expect(auth.options.disabledPaths).toEqual(expect.arrayContaining([...TWO_FACTOR_DISABLED_PATHS]));
    });
});
