/**
 * Pure parsing of which host ports a compose file's `ports:` entries
 * request, plus .env-content parsing for resolving ${VAR} references in a
 * published-port entry. No I/O; every function here is a string -> data
 * transform so it can be unit tested without a real stack directory or
 * Docker.
 *
 * extractRequestedHostPorts() covers every common `ports:` syntax compose
 * authors actually write: short form with an optional host-IP prefix
 * (IPv4/bracketed IPv6) and `/tcp`|`/udp` suffix, `A-B:C-D` port ranges,
 * long form ({target, published, protocol, host_ip}), and
 * ${VAR}/${VAR:-default}/${VAR-default}/$VAR interpolation against the
 * stack's .env content.
 */
import {parse as parseYaml} from "yaml";

export interface RequestedHostPort {
    readonly port: number;
    readonly protocol: "tcp" | "udp";
    readonly serviceName: string;
    readonly hostIp: string | null;
}

/**
 * Caps so a hostile port range can never make conflict-checking expensive:
 * at most MAX_PORTS_PER_RANGE ports are expanded from a single `A-B:C-D`
 * range entry, and the whole per-stack result never exceeds
 * MAX_REQUESTED_PORTS.
 */
export const MAX_PORTS_PER_RANGE = 1024;
export const MAX_REQUESTED_PORTS = 4096;

/**
 * Parses .env-file-style content into a flat key -> value map, used to
 * resolve ${VAR}/$VAR references in a published-port entry. Ignores blank
 * lines and full-line `#` comments, accepts an
 * optional `export ` prefix, splits on the first `=` only (so a value
 * containing `=` stays intact), trims surrounding whitespace, and strips
 * one pair of matching surrounding quotes from the value.
 */
export function parseEnvAssignments(envContent: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const rawLine of envContent.split("\n")) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const withoutExport = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
        const eqIndex = withoutExport.indexOf("=");
        if (eqIndex === -1) continue;
        const key = withoutExport.slice(0, eqIndex).trim();
        if (!key) continue;
        let value = withoutExport.slice(eqIndex + 1).trim();
        if (value.length >= 2) {
            const first = value[0];
            const last = value[value.length - 1];
            if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
                value = value.slice(1, -1);
            }
        }
        result[key] = value;
    }
    return result;
}

/**
 * Matches the compose short-form port string, after any ${VAR} env
 * interpolation has already been resolved:
 *   [ "[" IPv6 "]:" | IPv4 ":" ]  HOSTPORT[-HOSTPORT]  ":"  CONTAINERPORT[-CONTAINERPORT]  [ "/" PROTO ]
 * A bare container-only entry (no ":") never matches — compose requests no
 * host port for it, which is the correct "nothing to report" outcome.
 */
const SHORT_FORM_PATTERN =
    /^(?:\[([0-9a-fA-F:]+)\]:|((?:\d{1,3}\.){3}\d{1,3}):)?(\d+)(?:-(\d+))?:(\d+)(?:-(\d+))?(?:\/(tcp|udp))?$/;

interface ShortFormSpec {
    readonly hostIp: string | null;
    readonly hostStart: string;
    readonly hostEnd: string | undefined;
    readonly protocol: "tcp" | "udp";
}

function parseShortFormSpec(spec: string): ShortFormSpec | null {
    const match = SHORT_FORM_PATTERN.exec(spec);
    if (!match) return null;
    const [, ipv6, ipv4, hostStart, hostEnd, , , protocol] = match;
    return {
        hostIp: ipv6 ?? ipv4 ?? null,
        hostStart,
        hostEnd,
        protocol: protocol === "udp" ? "udp" : "tcp",
    };
}

/**
 * Expands a (possibly ranged) host-port spec into individual port numbers,
 * capped at MAX_PORTS_PER_RANGE. Returns null for an out-of-range port, a
 * non-integer, or a range whose end precedes its start.
 */
function expandHostPortRange(startStr: string, endStr: string | undefined): number[] | null {
    const start = Number.parseInt(startStr, 10);
    if (!Number.isInteger(start) || start < 1 || start > 65535) return null;
    if (endStr === undefined) return [start];
    const end = Number.parseInt(endStr, 10);
    if (!Number.isInteger(end) || end < 1 || end > 65535 || end < start) return null;
    const count = Math.min(end - start + 1, MAX_PORTS_PER_RANGE);
    const ports: number[] = [];
    for (let i = 0; i < count; i++) ports.push(start + i);
    return ports;
}

/**
 * Resolves ${VAR}, ${VAR:-default}, ${VAR-default}, and $VAR references in
 * a raw port-spec string against `env`, falling back to the inline default
 * when present. Returns null (the whole entry must be skipped, never
 * guessed) when any reference cannot be resolved — i.e. it is absent from
 * `env` and carries no default.
 *
 * `${VAR:-default}` (colon-dash, shell "unset-or-empty" semantics) uses the
 * default when VAR is unset OR set to an empty string; `${VAR-default}`
 * (dash-only, "unset" semantics) uses VAR's value even if it is empty, and
 * only falls back to the default when VAR is entirely absent from `env`.
 */
function interpolateEnv(raw: string, env: Record<string, string>): string | null {
    let unresolved = false;
    const result = raw.replace(
        /\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:-|-)([^}]*))?\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
        (_match, bracedName: string | undefined, operator: string | undefined, defaultText: string | undefined, bareName: string | undefined) => {
            const name = bracedName ?? bareName;
            if (name === undefined) {
                unresolved = true;
                return "";
            }
            const isSet = Object.prototype.hasOwnProperty.call(env, name);
            const value = env[name];

            if (operator === ":-") {
                if (isSet && value !== "") return value;
                if (defaultText !== undefined) return defaultText;
                unresolved = true;
                return "";
            }
            if (operator === "-") {
                if (isSet) return value;
                if (defaultText !== undefined) return defaultText;
                unresolved = true;
                return "";
            }
            if (isSet) return value;
            unresolved = true;
            return "";
        },
    );
    return unresolved ? null : result;
}

function parseShortFormEntry(
    entry: string,
    env: Record<string, string>,
): Array<{port: number; protocol: "tcp" | "udp"; hostIp: string | null}> {
    const interpolated = interpolateEnv(entry, env);
    if (interpolated === null) return [];
    const spec = parseShortFormSpec(interpolated);
    if (!spec) return [];
    const ports = expandHostPortRange(spec.hostStart, spec.hostEnd);
    if (!ports) return [];
    return ports.map((port) => ({port, protocol: spec.protocol, hostIp: spec.hostIp}));
}

function parseLongFormEntry(
    def: Record<string, unknown>,
    env: Record<string, string>,
): Array<{port: number; protocol: "tcp" | "udp"; hostIp: string | null}> {
    const rawPublished = def.published;
    if (rawPublished === undefined || rawPublished === null) return [];

    const publishedStr =
        typeof rawPublished === "number"
            ? String(rawPublished)
            : typeof rawPublished === "string"
                ? rawPublished
                : null;
    if (publishedStr === null) return [];

    const interpolated = interpolateEnv(publishedStr, env);
    if (interpolated === null) return [];

    const rangeMatch = /^(\d+)(?:-(\d+))?$/.exec(interpolated);
    if (!rangeMatch) return [];
    const ports = expandHostPortRange(rangeMatch[1], rangeMatch[2]);
    if (!ports) return [];

    const protocol: "tcp" | "udp" = def.protocol === "udp" ? "udp" : "tcp";
    const hostIp = typeof def.host_ip === "string" && def.host_ip.length > 0 ? def.host_ip : null;

    return ports.map((port) => ({port, protocol, hostIp}));
}

function parsePortEntry(
    entry: unknown,
    env: Record<string, string>,
): Array<{port: number; protocol: "tcp" | "udp"; hostIp: string | null}> {
    if (typeof entry === "string") return parseShortFormEntry(entry, env);
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        // Narrowing cast purely for property access on the long-form
        // mapping; parseLongFormEntry re-checks each field's runtime type.
        return parseLongFormEntry(entry as Record<string, unknown>, env);
    }
    return [];
}

/**
 * Extracts every host port a compose file's services request, in service
 * declaration order, deduped by port/protocol (first service wins). Never
 * throws: invalid YAML, a missing/malformed `services` key, or a
 * malformed `ports` entry all degrade to an empty or partial result rather
 * than propagating a parse error into a conflict check.
 */
export function extractRequestedHostPorts(
    composeContent: string,
    env: Record<string, string>,
): RequestedHostPort[] {
    let doc: unknown;
    try {
        doc = parseYaml(composeContent);
    } catch {
        return [];
    }
    // Narrowing cast to read an optional `services` property off an
    // otherwise-unknown parsed YAML value; safe because every branch below
    // re-checks the actual runtime type before using it.
    const services = (doc as {services?: unknown} | null)?.services;
    if (!services || typeof services !== "object" || Array.isArray(services)) return [];

    const seen = new Set<string>();
    const results: RequestedHostPort[] = [];

    for (const [serviceName, rawDef] of Object.entries(services as Record<string, unknown>)) {
        if (!rawDef || typeof rawDef !== "object") continue;
        // Same narrowing-cast rationale as above.
        const portsRaw = (rawDef as {ports?: unknown}).ports;
        if (!Array.isArray(portsRaw)) continue;

        for (const entry of portsRaw) {
            for (const parsed of parsePortEntry(entry, env)) {
                const key = `${parsed.port}/${parsed.protocol}`;
                if (seen.has(key)) continue;
                seen.add(key);
                results.push({port: parsed.port, protocol: parsed.protocol, serviceName, hostIp: parsed.hostIp});
                if (results.length >= MAX_REQUESTED_PORTS) return results;
            }
        }
    }
    return results;
}
