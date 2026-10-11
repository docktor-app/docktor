import {betterAuth} from "better-auth";
import {prismaAdapter} from "better-auth/adapters/prisma";
import {APIError, createAuthMiddleware} from "better-auth/api";
import {twoFactor} from "better-auth/plugins";
import {prisma} from "./db.js";
import {
    buildRateLimitConfig,
    CLIENT_IP_HEADER,
    TWO_FACTOR_DISABLED_PATHS,
    TWO_FACTOR_TRUST_DEVICE_MAX_AGE_SECONDS,
} from "./auth-config.js";
import {SettingsRepository, SETTING_KEYS} from "../repositories/settings-repository.js";
import {parseMandatoryFlag, REQUIRE_TWO_FACTOR_SETTING_KEY} from "../domain/two-factor-policy.js";

// A local instance, not the application/index.ts singleton — that module
// eventually imports this file (via onboarding-service.ts), so importing it
// here would be circular. SettingsRepository is a stateless wrapper around
// the shared `prisma` client, so a second instance is harmless.
const settingsRepository = new SettingsRepository();

const DEFAULT_TRUSTED_ORIGIN = "http://localhost:5173";

/**
 * Pure merge of the two possible origin sources, deduplicated, falling back
 * to the dev-server default only when neither source provides one.
 */
export function buildTrustedOrigins(envUrl: string | undefined, settingBaseUrl: string | null): string[] {
    const origins = new Set<string>();
    if (envUrl) origins.add(envUrl);
    if (settingBaseUrl) origins.add(settingBaseUrl);
    if (origins.size === 0) origins.add(DEFAULT_TRUSTED_ORIGIN);
    return [...origins];
}

/**
 * Resolves trustedOrigins dynamically, per request, from both
 * BETTER_AUTH_URL (env, requires a restart to change) and the Settings
 * page/setup wizard's "Base URL" field (DB-backed, live) — so setting Base
 * URL through the UI actually fixes an "Invalid origin" login failure
 * without an env var change or restart, instead of silently doing nothing.
 */
export async function resolveTrustedOrigins(): Promise<string[]> {
    let settingBaseUrl: string | null = null;
    try {
        settingBaseUrl = await settingsRepository.get(SETTING_KEYS.BASE_URL);
    } catch {
        // Settings table may not exist yet (pre-migration boot) or the DB may
        // be transiently unreachable — this optional, DB-only origin lookup
        // must never throw and block login entirely because of it.
    }
    return buildTrustedOrigins(process.env.BETTER_AUTH_URL, settingBaseUrl);
}

/**
 * D-03: whether the instance requires two-factor for every user. Read on every
 * gated request (no cache). Errors are NOT swallowed, unlike
 * resolveTrustedOrigins: the enrollment gate must fail closed.
 */
export async function isTwoFactorMandatory(): Promise<boolean> {
    return parseMandatoryFlag(await settingsRepository.get(REQUIRE_TWO_FACTOR_SETTING_KEY));
}

export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
    basePath: "/api/auth",
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    trustedOrigins: resolveTrustedOrigins,
    emailAndPassword: {
        enabled: true,
    },
    // #45: TOTP second factor with single-use recovery codes. Only the TOTP
    // and recovery-code paths are used; the OTP endpoints are closed below.
    plugins: [
        twoFactor({
            issuer: "Docktor",
            trustDeviceMaxAge: TWO_FACTOR_TRUST_DEVICE_MAX_AGE_SECONDS,
        }),
    ],
    disabledPaths: [...TWO_FACTOR_DISABLED_PATHS],
    // NOTE: `session.cookieCache` is deliberately not configured and must stay
    // off (GHSA-xg6x-h9c9-2m83): with it on, a revoked session would keep
    // working until the cached cookie expired, which would defeat session
    // revocation on 2FA changes.

    // D-11/D-12: database-backed limiter, 5 attempts per 15 minutes on sign-in.
    rateLimit: buildRateLimitConfig(),
    advanced: {
        // better-auth reads the client IP only from headers and skips rate
        // limiting entirely when none is valid. Docktor therefore stamps a
        // private header from Fastify's request.ip (routes/auth.ts) and tells
        // better-auth to trust only that one.
        ipAddress: {ipAddressHeaders: [CLIENT_IP_HEADER]},
        // Explicit false: better-auth switches its origin check off under
        // NODE_ENV=test unless told otherwise, which would make CSRF tests
        // pass vacuously. Production behaviour is unchanged.
        disableOriginCheck: false,
    },
    hooks: {
        // T-05-09/CR-01: self-registration via better-auth's own
        // sign-up-email endpoint must be blocked once at least one user
        // exists. Only the onboarding wizard's own step1
        // (routes/setup.ts, which calls this same signUpEmail API
        // internally to create the very first admin) may create a user
        // when the instance is empty. Scoped to this single path via
        // `ctx.path` so login/session/every other auth route is
        // unaffected.
        before: createAuthMiddleware(async (ctx) => {
            if (ctx.path !== "/sign-up/email") return;

            const userCount = await prisma.user.count();
            if (userCount > 0) {
                throw new APIError("FORBIDDEN", {
                    message: "Self-registration is disabled; setup has already been completed",
                });
            }
        }),
    },
});

/** The signed-in user as better-auth returns it, including `twoFactorEnabled`. */
export type AuthUser = typeof auth.$Infer.Session.user;
export type AuthSession = typeof auth.$Infer.Session.session;
