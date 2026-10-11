import {describe, expect, it} from "vitest";
import {
    AUTH_STRICT_MAX,
    AUTH_STRICT_PATHS,
    AUTH_STRICT_WINDOW_SECONDS,
    buildRateLimitConfig,
    CLIENT_IP_HEADER,
    isAuthRateLimitEnabled,
    parseTrustProxy,
    TWO_FACTOR_DISABLED_PATHS,
    TWO_FACTOR_TRUST_DEVICE_MAX_AGE_SECONDS,
} from "../../../src/lib/auth-config.js";

describe("parseTrustProxy", () => {
    it.each([
        [undefined, false],
        ["", false],
        ["   ", false],
        ["false", false],
        ["0", false],
        ["true", true],
        ["1", 1],
        ["2", 2],
    ])("maps %j to %j", (raw, expected) => {
        expect(parseTrustProxy(raw)).toEqual(expected);
    });

    it("treats any other non-empty value as a comma-separated IP/CIDR list", () => {
        expect(parseTrustProxy("10.0.0.0/8, 192.168.1.10")).toEqual(["10.0.0.0/8", "192.168.1.10"]);
    });

    it("drops empty list entries", () => {
        expect(parseTrustProxy("10.0.0.1,, 10.0.0.2 ,")).toEqual(["10.0.0.1", "10.0.0.2"]);
    });
});

describe("isAuthRateLimitEnabled", () => {
    it("is on in production, development and when NODE_ENV is unset", () => {
        expect(isAuthRateLimitEnabled({NODE_ENV: "production"})).toBe(true);
        expect(isAuthRateLimitEnabled({NODE_ENV: "development"})).toBe(true);
        expect(isAuthRateLimitEnabled({})).toBe(true);
    });

    it("is off under NODE_ENV=test unless DOCKTOR_AUTH_RATE_LIMIT=on", () => {
        expect(isAuthRateLimitEnabled({NODE_ENV: "test"})).toBe(false);
        expect(isAuthRateLimitEnabled({NODE_ENV: "test", DOCKTOR_AUTH_RATE_LIMIT: "on"})).toBe(true);
        expect(isAuthRateLimitEnabled({NODE_ENV: "test", DOCKTOR_AUTH_RATE_LIMIT: "off"})).toBe(false);
    });
});

describe("buildRateLimitConfig", () => {
    it("persists counters in the database with a generous default budget", () => {
        const config = buildRateLimitConfig({NODE_ENV: "production"});
        expect(config.enabled).toBe(true);
        expect(config.storage).toBe("database");
        expect(config.window).toBe(60);
        expect(config.max).toBe(100);
    });

    it("mirrors isAuthRateLimitEnabled for the enabled flag", () => {
        expect(buildRateLimitConfig({NODE_ENV: "test"}).enabled).toBe(false);
        expect(buildRateLimitConfig({NODE_ENV: "test", DOCKTOR_AUTH_RATE_LIMIT: "on"}).enabled).toBe(true);
    });

    it("applies 5 attempts per 15 minutes to exactly the eight strict paths", () => {
        const rules = buildRateLimitConfig({NODE_ENV: "production"}).customRules ?? {};
        expect(Object.keys(rules).sort()).toEqual(
            [
                "/change-password",
                "/sign-in/email",
                "/two-factor/disable",
                "/two-factor/enable",
                "/two-factor/generate-backup-codes",
                "/two-factor/verify-backup-code",
                "/two-factor/verify-totp",
                "/verify-password",
            ].sort(),
        );
        for (const rule of Object.values(rules)) {
            expect(rule).toEqual({window: 900, max: 5});
        }
    });

    it("exposes the strict budget as named constants", () => {
        expect(AUTH_STRICT_WINDOW_SECONDS).toBe(900);
        expect(AUTH_STRICT_MAX).toBe(5);
        expect(AUTH_STRICT_PATHS).toHaveLength(8);
    });

    it("never uses a wildcard rule", () => {
        const rules = buildRateLimitConfig({NODE_ENV: "production"}).customRules ?? {};
        expect(Object.keys(rules).some((path) => path.includes("*"))).toBe(false);
    });
});

describe("static auth constants", () => {
    it("uses a private header name for the client IP", () => {
        expect(CLIENT_IP_HEADER).toBe("x-docktor-client-ip");
    });

    it("keeps the trusted-device cookie for 30 days", () => {
        expect(TWO_FACTOR_TRUST_DEVICE_MAX_AGE_SECONDS).toBe(30 * 24 * 60 * 60);
    });

    it("closes the OTP, TOTP-URI and password-reset endpoints", () => {
        expect([...TWO_FACTOR_DISABLED_PATHS].sort()).toEqual(
            [
                "/request-password-reset",
                "/reset-password",
                "/two-factor/get-totp-uri",
                "/two-factor/send-otp",
                "/two-factor/verify-otp",
            ].sort(),
        );
    });
});
