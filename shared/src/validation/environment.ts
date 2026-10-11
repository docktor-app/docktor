import {z} from "zod";

// Startup environment report for #7 (D-13). The server checks its environment
// once at boot (server/src/lib/environment-check.ts) and serves the non-blocking
// warnings through GET /api/settings/environment so installs whose owners never
// read container logs still see them. Only warnings are modelled here: blocking
// errors stop the process before the API exists, so they are never served.
// A warning names a variable and carries fixed text — it never carries a value.

export const ENVIRONMENT_WARNING_CODES = [
    "TRUST_PROXY_UNSET_BEHIND_HTTPS",
    "TRUST_PROXY_TRUSTS_ALL",
    "DOCKER_DATA_PATH_NOT_HOST_MOUNT",
    "NODE_ENV_NOT_PRODUCTION_IN_CONTAINER",
    "STACKS_HOST_DIR_UNSET",
    "STACKS_MOUNT_CHECK_DISABLED",
    "TEMPLATE_SECRET_IN_PRODUCTION",
    "DATABASE_URL_NOT_POSTGRES",
    "BETTER_AUTH_URL_NOT_HTTP",
] as const;

export const environmentWarningCodeSchema = z.enum(ENVIRONMENT_WARNING_CODES);

export const environmentWarningSchema = z.object({
    // Stable identifier; the UI uses it as the dismissal key.
    code: environmentWarningCodeSchema,
    // Environment variable NAME only, never its value.
    variable: z.string().min(1),
    message: z.string().min(1),
});

export const environmentReportSchema = z.object({
    warnings: z.array(environmentWarningSchema),
});

export type EnvironmentWarningCode = z.infer<typeof environmentWarningCodeSchema>;
export type EnvironmentWarning = z.infer<typeof environmentWarningSchema>;
export type EnvironmentReport = z.infer<typeof environmentReportSchema>;
