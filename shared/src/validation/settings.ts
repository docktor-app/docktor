import {z} from "zod";

export const updateSettingSchema = z.object({
    key: z.string().min(1),
    value: z.string(),
    encrypted: z.boolean().optional(),
});

export type UpdateSettingInput = z.infer<typeof updateSettingSchema>;

function isValidIANATimezone(tz: string): boolean {
    if (Intl.supportedValuesOf("timeZone").includes(tz)) {
        return true;
    }
    // Some environments (e.g. Node.js with limited ICU data) omit "UTC" from
    // supportedValuesOf but Intl.DateTimeFormat still accepts it as valid.
    try {
        Intl.DateTimeFormat(undefined, {timeZone: tz});
        return true;
    } catch {
        return false;
    }
}

export const generalSettingsSchema = z.object({
    instanceName: z.string().min(1, "Instance name is required"),
    baseUrl: z.string().url("Must be a valid URL").or(z.literal("")),
    timezone: z.string().refine(
        isValidIANATimezone,
        {message: "Must be a valid IANA timezone (e.g. 'America/New_York')"}
    ),
});

export const generalSettingsUpdateSchema = generalSettingsSchema.partial();

export type GeneralSettings = z.infer<typeof generalSettingsSchema>;
export type GeneralSettingsUpdate = z.infer<typeof generalSettingsUpdateSchema>;

// Issue #20 / D-12: the full set of compose-check rule ids, in registration
// order (server/src/infrastructure/compose-rules/registry.ts's
// BUILT_IN_COMPOSE_RULES is the single source of truth for that order — this
// tuple mirrors it so the engine's consistency test can pin the two
// together). privileged, dockerSocket and bindOutsideStack are always-on
// (D-11); the remaining three are configurable and gated by the Compose
// Checks settings card (D-10).
export const COMPOSE_RULE_IDS = [
    "privileged",
    "dockerSocket",
    "bindOutsideStack",
    "namedVolume",
    "inlineEnv",
    "missingEnvFile",
] as const;

export type ComposeRuleId = (typeof COMPOSE_RULE_IDS)[number];

export const CONFIGURABLE_COMPOSE_RULE_IDS = [
    "namedVolume",
    "inlineEnv",
    "missingEnvFile",
] as const satisfies readonly ComposeRuleId[];

export type ConfigurableComposeRuleId = (typeof CONFIGURABLE_COMPOSE_RULE_IDS)[number];

// D-10: per-check enable/disable, plus D-04's "skip diff confirmation"
// toggle. No keys exist for the always-on rules (privileged, dockerSocket,
// bindOutsideStack) — they cannot be disabled (#20/D-11).
export const composeCheckSettingsSchema = z.object({
    skipReview: z.boolean(),
    checks: z.object({
        namedVolume: z.boolean(),
        inlineEnv: z.boolean(),
        missingEnvFile: z.boolean(),
    }),
});

export type ComposeCheckSettings = z.infer<typeof composeCheckSettingsSchema>;
