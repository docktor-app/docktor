import {z} from "zod";

// Issue #45: every Phase 15 account / two-factor schema lives in this module.

/** Six-digit authenticator (TOTP) code. */
export const totpCodeSchema = z.object({
    code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code."),
});

/**
 * Recovery code in the xxxxx-xxxxx shape. The case must not be changed:
 * verification is an exact string match, and the codes are mixed-case.
 */
export const recoveryCodeSchema = z.object({
    code: z.string().trim().min(1, "Enter a recovery code."),
});

/** Login second step, authenticator code form (D-05: optional trusted device). */
export const totpChallengeSchema = totpCodeSchema.extend({
    trustDevice: z.boolean(),
});

/** Login second step, recovery code form (D-05: optional trusted device). */
export const recoveryChallengeSchema = recoveryCodeSchema.extend({
    trustDevice: z.boolean(),
});

/** Password re-entry required before enabling, disabling or regenerating 2FA (D-07). */
export const passwordConfirmSchema = z.object({
    password: z.string().min(1, "Password is required"),
});

/** Body of PUT /api/account/security/mandatory-2fa (D-02, D-03). */
export const mandatoryTwoFactorSchema = z.object({
    enabled: z.boolean(),
});

/** What GET /api/account/security answers for the signed-in user (D-01, D-02). */
export const accountSecurityStatusSchema = z.object({
    twoFactorEnabled: z.boolean(),
    mandatory: z.boolean(),
    enrollmentRequired: z.boolean(),
});

/** Machine-readable `code` values on 403 responses; client and server share them. */
export const ACCOUNT_SECURITY_ERROR_CODES = {
    TWO_FACTOR_ENROLLMENT_REQUIRED: "TWO_FACTOR_ENROLLMENT_REQUIRED",
    TWO_FACTOR_NOT_ENABLED: "TWO_FACTOR_NOT_ENABLED",
} as const;

export type TotpCodeInput = z.infer<typeof totpCodeSchema>;
export type RecoveryCodeInput = z.infer<typeof recoveryCodeSchema>;
export type TotpChallengeInput = z.infer<typeof totpChallengeSchema>;
export type RecoveryChallengeInput = z.infer<typeof recoveryChallengeSchema>;
export type PasswordConfirmInput = z.infer<typeof passwordConfirmSchema>;
export type MandatoryTwoFactorInput = z.infer<typeof mandatoryTwoFactorSchema>;
export type AccountSecurityStatus = z.infer<typeof accountSecurityStatusSchema>;
