/**
 * Pure two-factor policy (#45): which Setting row holds the instance-wide
 * requirement, when a user owes enrollment, and who may change the
 * requirement. No I/O, no Prisma, no Fastify.
 */

/** D-03: the Setting row holding the instance-wide requirement ("true" / "false"). */
export const REQUIRE_TWO_FACTOR_SETTING_KEY = "auth.requireTwoFactor";

/** A missing or malformed row means the requirement is off. */
export function parseMandatoryFlag(raw: string | null | undefined): boolean {
    return raw === "true";
}

/** D-01: no grace period, a user without two-factor owes enrollment as long as the requirement is on. */
export function isEnrollmentRequired({
    mandatory,
    twoFactorEnabled,
}: {
    mandatory: boolean;
    twoFactorEnabled: boolean | null | undefined;
}): boolean {
    return mandatory && twoFactorEnabled !== true;
}

/**
 * D-02: only a user who has two-factor may change the requirement. This
 * guards turning it on (self-lockout) and also turning it off: under the
 * requirement a user without two-factor is mid-forced-enrollment (D-01) and
 * must not be able to lift it for themselves.
 */
export function canChangeMandatory({actorHasTwoFactor}: {actorHasTwoFactor: boolean}): boolean {
    return actorHasTwoFactor;
}

/** D-10: the better-auth endpoints whose success changes the user's credential factor. */
export const TWO_FACTOR_CHANGE_PATHS = [
    "/two-factor/verify-totp",
    "/two-factor/disable",
    "/two-factor/generate-backup-codes",
] as const;

export function isTwoFactorChangePath(path: string): boolean {
    return (TWO_FACTOR_CHANGE_PATHS as readonly string[]).includes(path);
}

export interface SessionRevocationInput {
    path: string;
    /** The endpoint returned a result rather than an error. */
    succeeded: boolean;
    /** Token of the session that made the call; null when there was none (sign-in challenge). */
    actorSessionToken: string | null;
    /** The caller's twoFactorEnabled before the endpoint ran. */
    twoFactorEnabledBefore: boolean | null;
    /** Token of the session the endpoint swapped in (enabling verify-totp, disable); null otherwise. */
    reissuedSessionToken: string | null;
}

export type SessionRevocationPlan = {revoke: false} | {revoke: true; keepToken: string};

/**
 * D-10: decides whether a two-factor change signs out the user's other
 * devices. verify-totp counts only on the false -> true transition by a
 * logged-in caller (the same endpoint also completes the sign-in challenge
 * and plain re-verification, which must revoke nothing); disable and
 * generate-backup-codes count on success. The caller keeps their session:
 * the re-issued one when the endpoint swapped it, otherwise their own.
 * Trust-device records are purged whenever revoke is true.
 */
export function planSessionRevocation(input: SessionRevocationInput): SessionRevocationPlan {
    const {path, succeeded, actorSessionToken, twoFactorEnabledBefore, reissuedSessionToken} = input;
    if (!succeeded || actorSessionToken === null || !isTwoFactorChangePath(path)) return {revoke: false};
    if (path === "/two-factor/verify-totp" && twoFactorEnabledBefore === true) return {revoke: false};
    return {revoke: true, keepToken: reissuedSessionToken ?? actorSessionToken};
}
