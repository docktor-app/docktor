import type {BetterAuthOptions} from "better-auth";

// Pure configuration helpers for the better-auth instance (lib/auth.ts).
// Kept free of I/O so the rate-limit and proxy-trust rules are unit-testable.

/**
 * Private header carrying the client IP to better-auth. better-auth reads the
 * client address only from headers and silently skips rate limiting when none
 * is present, so routes/auth.ts stamps this header from Fastify's `request.ip`
 * on every /api/auth request, overwriting whatever the client sent.
 */
export const CLIENT_IP_HEADER = "x-docktor-client-ip";

/** Strict budget (D-12): 5 attempts per client IP per 15 minutes. */
export const AUTH_STRICT_WINDOW_SECONDS = 15 * 60;
export const AUTH_STRICT_MAX = 5;

/**
 * Paths (relative to basePath) held to the strict budget: sign-in and the 2FA
 * verify endpoints per D-12, plus the password-bearing endpoints that are
 * reachable with a stolen session. Exact paths only, never a wildcard.
 */
export const AUTH_STRICT_PATHS = [
    "/sign-in/email",
    "/two-factor/verify-totp",
    "/two-factor/verify-backup-code",
    "/two-factor/enable",
    "/two-factor/disable",
    "/two-factor/generate-backup-codes",
    "/change-password",
    "/verify-password",
] as const;

/** D-05: how long a "trust this device" cookie skips the second step (30 days). */
export const TWO_FACTOR_TRUST_DEVICE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * better-auth endpoints answered with 404 (D-16). OTP delivery is not
 * configured (no sendOTP). get-totp-uri would re-expose the TOTP secret to
 * anyone holding a session and the password, and enrollment already returns
 * the URI exactly once. Password reset is not built in this phase (a follow-up
 * issue tracks it).
 */
export const TWO_FACTOR_DISABLED_PATHS = [
    "/two-factor/send-otp",
    "/two-factor/verify-otp",
    "/two-factor/get-totp-uri",
    "/request-password-reset",
    "/reset-password",
] as const;

/**
 * Parses the TRUST_PROXY environment variable into Fastify's `trustProxy`
 * option (D-13). Default is off: the client IP is the TCP peer address, so a
 * forged X-Forwarded-For cannot choose a rate-limit bucket.
 *
 * - unset / "" / "false" / "0"  -> false (trust nobody)
 * - "true"                      -> true (trusts every hop; avoid unless the proxy overwrites X-Forwarded-For)
 * - a positive integer          -> that many proxy hops. Use `1` for a single reverse proxy.
 * - anything else               -> comma-separated list of trusted proxy IPs / CIDRs
 */
export function parseTrustProxy(raw: string | undefined): boolean | number | string[] {
    const value = raw?.trim() ?? "";
    if (value === "" || value === "false") return false;
    if (value === "true") return true;
    if (/^\d+$/.test(value)) {
        const hops = Number.parseInt(value, 10);
        return hops > 0 ? hops : false;
    }
    return value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry !== "");
}

/**
 * The limiter is on everywhere except under NODE_ENV=test, where the existing
 * integration suites create a user per test from one IP and would trip it.
 * Dedicated rate-limit tests opt in with DOCKTOR_AUTH_RATE_LIMIT=on.
 * (Test-only switch; better-auth itself would default to production-only.)
 */
export function isAuthRateLimitEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    if (env.NODE_ENV !== "test") return true;
    return env.DOCKTOR_AUTH_RATE_LIMIT === "on";
}

type RateLimitConfig = NonNullable<BetterAuthOptions["rateLimit"]>;

/**
 * better-auth rate-limit configuration (D-11, D-12). Counters live in the
 * RateLimit table, so a restart cannot reset them. customRules are matched on
 * the exact path and outrank both better-auth's built-in rules and the
 * twoFactor plugin's own 3-per-10-seconds rule.
 */
export function buildRateLimitConfig(env: NodeJS.ProcessEnv = process.env): RateLimitConfig {
    const customRules: NonNullable<RateLimitConfig["customRules"]> = {};
    for (const path of AUTH_STRICT_PATHS) {
        customRules[path] = {window: AUTH_STRICT_WINDOW_SECONDS, max: AUTH_STRICT_MAX};
    }
    return {
        enabled: isAuthRateLimitEnabled(env),
        storage: "database",
        window: 60,
        max: 100,
        customRules,
    };
}
