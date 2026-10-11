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
