import {z} from "zod";

export const stackIdSchema = z
    .string()
    .min(1)
    .max(63)
    .regex(
        /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/,
        "Must be lowercase alphanumeric with hyphens, not starting or ending with a hyphen",
    );

export const createStackSchema = z.object({
    displayName: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    composeContent: z.string().min(1),
    envContent: z.string().optional(),
});

export const updateStackSchema = z.object({
    displayName: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    composeContent: z.string().min(1).optional(),
    envContent: z.string().optional(),
});

export const stackParamsSchema = z.object({
    id: stackIdSchema,
});

export const stackServiceParamsSchema = stackParamsSchema.extend({
    serviceName: z.string().min(1),
});

// The Docker tag grammar: a leading letter, digit, or underscore, followed
// by up to 127 more characters drawn from letters, digits, underscore,
// period and hyphen. This is the security control that keeps an
// attacker-supplied string from being interpolated into a YAML document —
// no whitespace, no quotes, no YAML metacharacters can pass this pattern.
export const dockerTagSchema = z
    .string()
    .regex(
        /^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$/,
        "Must be a valid Docker tag: letters, digits, underscore, period and hyphen, starting with a letter, digit, or underscore",
    );

export const upgradeServiceParamsSchema = stackServiceParamsSchema;

export const upgradeServiceSchema = z.object({
    targetTag: dockerTagSchema,
});

// D-20/D-21: the EnvEditor's table mode. A variable name must be a valid
// shell/.env identifier — letters, digits and underscores, not starting with
// a digit. `client/src/lib/env-file.ts` imports this pattern's source
// (stripped of its anchors) to recognize `KEY=value` lines during parsing,
// so the "what counts as a variable line" rule is defined exactly once.
export const ENV_VARIABLE_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const envVariableRowSchema = z.object({
    key: z
        .string()
        .min(1, "Variable name is required")
        .regex(ENV_VARIABLE_KEY_PATTERN, "Use letters, digits and underscores, not starting with a digit"),
    value: z.string(),
});

// Cross-row uniqueness: each row's `key` is validated independently above,
// but two rows sharing the same key both serialize into the same .env file
// (client/src/lib/env-file.ts's applyTableRows) — most .env/shell consumers
// take the *last* definition, silently discarding the other value on save.
// Flag every row that shares its key with another row so EnvEditor can
// surface a per-row error the same way it already renders `keyError`.
// Exported so EnvEditor's client-local row schema (which extends
// envVariableRowSchema with a client-only `lineIndex` field) can reuse the
// exact same check via `.superRefine`.
export function checkDuplicateEnvKeys<TRow extends {key: string}>(
    data: {variables: TRow[]},
    ctx: z.RefinementCtx,
): void {
    const counts = new Map<string, number>();
    for (const row of data.variables) {
        if (!row.key) continue;
        counts.set(row.key, (counts.get(row.key) ?? 0) + 1);
    }
    data.variables.forEach((row, index) => {
        if (row.key && (counts.get(row.key) ?? 0) > 1) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Duplicate variable name",
                path: ["variables", index, "key"],
            });
        }
    });
}

export const envTableFormSchema = z
    .object({
        variables: z.array(envVariableRowSchema),
    })
    .superRefine(checkDuplicateEnvKeys);

export type StackParams = z.infer<typeof stackParamsSchema>;
export type StackServiceParams = z.infer<typeof stackServiceParamsSchema>;
export type CreateStackInput = z.infer<typeof createStackSchema>;
export type UpdateStackInput = z.infer<typeof updateStackSchema>;
export type UpgradeServiceParams = z.infer<typeof upgradeServiceParamsSchema>;
export type UpgradeServiceInput = z.infer<typeof upgradeServiceSchema>;
export type EnvTableFormInput = z.infer<typeof envTableFormSchema>;
