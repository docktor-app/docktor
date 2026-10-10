import {parseDocument} from "yaml";
import type {ZodError} from "zod";
import {HEALTH_PROBE_DEFAULT_TIMEOUT_SECONDS, healthProbeSchema, healthProbeUrlSchema} from "@docktor/shared";

/**
 * What a service's `x-docktor.health-probe` block resolves to (D-01). An
 * invalid block is kept, with the reason, instead of being dropped so the
 * service is probed as a failure rather than silently skipped (fail-closed).
 */
export type HealthProbeSpec =
    | {kind: "valid"; url: string; timeoutMs: number}
    | {kind: "invalid"; message: string};

const NOT_A_MAPPING_MESSAGE = "The health-probe block must contain a url.";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

// A missing or non-string url is not covered by the shared url schema's own
// messages, so it borrows the schema's message for an unparseable value.
function missingUrlMessage(): string {
    const result = healthProbeUrlSchema.safeParse("");
    return result.success ? NOT_A_MAPPING_MESSAGE : (result.error.issues[0]?.message ?? NOT_A_MAPPING_MESSAGE);
}

function firstIssueMessage(error: ZodError): string {
    const issue = error.issues[0];
    if (issue === undefined) {
        return NOT_A_MAPPING_MESSAGE;
    }
    return issue.code === "invalid_type" && issue.path[0] === "url" ? missingUrlMessage() : issue.message;
}

function toSpec(block: unknown): HealthProbeSpec {
    if (!isRecord(block)) {
        return {kind: "invalid", message: NOT_A_MAPPING_MESSAGE};
    }
    const parsed = healthProbeSchema.safeParse(block);
    if (!parsed.success) {
        return {kind: "invalid", message: firstIssueMessage(parsed.error)};
    }
    const seconds = parsed.data.timeout ?? HEALTH_PROBE_DEFAULT_TIMEOUT_SECONDS;
    return {kind: "valid", url: parsed.data.url, timeoutMs: seconds * 1000};
}

function healthProbeBlock(service: unknown): unknown {
    if (!isRecord(service) || !isRecord(service["x-docktor"])) {
        return undefined;
    }
    return service["x-docktor"]["health-probe"];
}

/**
 * Reads every service's `x-docktor.health-probe` block from a compose file
 * (D-01: the compose file is the only place a probe is configured, so nothing
 * is stored in the database). The compose file is untrusted input, so each
 * block is re-validated with the shared schema that also guards the Config tab
 * form, including the loopback-only host rule (amended D-05).
 *
 * Returns null when the YAML does not parse, and an empty map when the file
 * has no services. A service without the block is absent from the map.
 */
export function parseHealthProbes(content: string): ReadonlyMap<string, HealthProbeSpec> | null {
    const doc = parseDocument(content);
    if (doc.errors.length > 0) {
        return null;
    }

    let root: unknown;
    try {
        root = doc.toJS();
    } catch {
        return null;
    }

    const probes = new Map<string, HealthProbeSpec>();
    const services = isRecord(root) ? root["services"] : undefined;
    if (!isRecord(services)) {
        return probes;
    }
    for (const [name, service] of Object.entries(services)) {
        const block = healthProbeBlock(service);
        if (block !== undefined) {
            probes.set(name, toSpec(block));
        }
    }
    return probes;
}
