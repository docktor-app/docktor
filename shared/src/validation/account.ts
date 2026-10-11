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

export type TotpCodeInput = z.infer<typeof totpCodeSchema>;
export type RecoveryCodeInput = z.infer<typeof recoveryCodeSchema>;
export type TotpChallengeInput = z.infer<typeof totpChallengeSchema>;
export type RecoveryChallengeInput = z.infer<typeof recoveryChallengeSchema>;
export type PasswordConfirmInput = z.infer<typeof passwordConfirmSchema>;
