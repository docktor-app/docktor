import {z} from "zod";

// Health and uptime schemas for Phase 14 (#23). This module holds every
// Phase 14 health/uptime validation schema, so client and server share one
// definition of each query and body.

// GET /api/stacks/:id/health-events — without serviceName the server returns
// the latest `limit` transitions per service; with it, only that service's.
export const serviceHealthEventsQuerySchema = z.object({
    serviceName: z.string().trim().min(1).max(255).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export type ServiceHealthEventsQuery = z.infer<typeof serviceHealthEventsQuerySchema>;

// HTTP health probe configuration (D-01, D-02, amended D-05).
//
// The probe lives in the compose file as a per-service `x-docktor` extension:
//
//   services:
//     web:
//       x-docktor:
//         health-probe:
//           url: http://localhost:8080/health
//           timeout: 5        # optional, seconds
//
// SSRF guard (amended D-05): Docktor sends the probe request from its own
// network into the service's container, so the host may only name the
// container itself. Any other host would let a compose author make Docktor
// call arbitrary internal addresses. These schemas are the single definition
// of that rule: the Config tab form uses them to block bad values, and the
// server-side parser and transport re-apply them (a hand-edited compose file
// can carry any value, so the file is untrusted input).
export const HEALTH_PROBE_ALLOWED_HOSTS = ["localhost", "127.0.0.1", "[::1]"] as const;
export const HEALTH_PROBE_DEFAULT_TIMEOUT_SECONDS = 5;
export const HEALTH_PROBE_MAX_TIMEOUT_SECONDS = 30;

const URL_MESSAGE = "Enter a valid http:// or https:// URL.";
const USERINFO_MESSAGE = "Remove the username and password from the URL.";
const HOST_MESSAGE =
    "The host must be localhost, 127.0.0.1, or [::1]. Docktor sends the request to this service's container.";
const TIMEOUT_MESSAGE = `Enter a whole number from 1 to ${HEALTH_PROBE_MAX_TIMEOUT_SECONDS}.`;

function parseUrl(value: string): URL | null {
    try {
        return new URL(value);
    } catch {
        return null;
    }
}

function isAllowedHost(hostname: string): boolean {
    return (HEALTH_PROBE_ALLOWED_HOSTS as readonly string[]).includes(hostname);
}

// Reports at most one issue, so the user sees a single actionable message.
export const healthProbeUrlSchema = z
    .string()
    .trim()
    .superRefine((value, ctx) => {
        const url = parseUrl(value);
        if (url === null || (url.protocol !== "http:" && url.protocol !== "https:")) {
            ctx.addIssue({code: "custom", message: URL_MESSAGE});
            return;
        }
        if (url.username !== "" || url.password !== "") {
            ctx.addIssue({code: "custom", message: USERINFO_MESSAGE});
            return;
        }
        if (!isAllowedHost(url.hostname)) {
            ctx.addIssue({code: "custom", message: HOST_MESSAGE});
        }
    });

export const healthProbeTimeoutSchema = z
    .number({error: TIMEOUT_MESSAGE})
    .int(TIMEOUT_MESSAGE)
    .min(1, TIMEOUT_MESSAGE)
    .max(HEALTH_PROBE_MAX_TIMEOUT_SECONDS, TIMEOUT_MESSAGE);

// The YAML block under `x-docktor.health-probe`.
export const healthProbeSchema = z.object({
    url: healthProbeUrlSchema,
    timeout: healthProbeTimeoutSchema.optional(),
});

export type HealthProbeConfig = z.infer<typeof healthProbeSchema>;

// Config tab form: one row per compose service. Inputs are strings (text
// fields); a disabled row is never validated so a half-typed value on an
// off switch cannot block anything, and an empty timeout means "use default".
const healthProbeFormRowSchema = z
    .object({
        serviceName: z.string(),
        enabled: z.boolean(),
        url: z.string(),
        timeout: z.string(),
    })
    .superRefine((row, ctx) => {
        if (!row.enabled) {
            return;
        }
        const urlResult = healthProbeUrlSchema.safeParse(row.url);
        if (!urlResult.success) {
            for (const issue of urlResult.error.issues) {
                ctx.addIssue({code: "custom", message: issue.message, path: ["url"]});
            }
        }
        if (row.timeout.trim() !== "") {
            const timeoutResult = healthProbeTimeoutSchema.safeParse(Number(row.timeout));
            if (!timeoutResult.success) {
                for (const issue of timeoutResult.error.issues) {
                    ctx.addIssue({code: "custom", message: issue.message, path: ["timeout"]});
                }
            }
        }
    });

export const healthProbeFormSchema = z.object({
    probes: z.array(healthProbeFormRowSchema),
});

export type HealthProbeFormValues = z.infer<typeof healthProbeFormSchema>;
