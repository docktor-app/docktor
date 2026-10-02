/**
 * Pure parsing of which host ports a compose file's `ports:` entries
 * request, plus .env-content parsing for resolving ${VAR} references in a
 * published-port entry (wired in Task 2). No I/O; every function here is a
 * string -> data transform so it can be unit tested without a real stack
 * directory or Docker.
 *
 * Task 1 (this commit) implements the short form "HOST:CONTAINER[/proto]"
 * only, matching compose-parser.ts's existing PORT_PATTERN — the tracer
 * slice through the domain layers. Task 2 extends extractRequestedHostPorts
 * to cover every common `ports:` syntax compose authors actually write:
 * host-IP prefix (IPv4/bracketed IPv6), port ranges, long form
 * ({target, published, protocol, host_ip}), and ${VAR}/$VAR interpolation
 * against the stack's .env content.
 */
import {parse as parseYaml} from "yaml";

export interface RequestedHostPort {
    readonly port: number;
    readonly protocol: "tcp" | "udp";
    readonly serviceName: string;
    readonly hostIp: string | null;
}

/**
 * Caps so a hostile port range (wired in Task 2) can never make
 * conflict-checking expensive: at most MAX_PORTS_PER_RANGE ports are
 * expanded from a single `A-B:C-D` range entry, and the whole per-stack
 * result never exceeds MAX_REQUESTED_PORTS.
 */
export const MAX_PORTS_PER_RANGE = 1024;
export const MAX_REQUESTED_PORTS = 4096;

/**
 * Parses .env-file-style content into a flat key -> value map, used (from
 * Task 2 onward) to resolve ${VAR}/$VAR references in a published-port
 * entry. Ignores blank lines and full-line `#` comments, accepts an
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

const SHORT_FORM_PATTERN = /^(\d+):(\d+)(?:\/(tcp|udp))?$/;

function parsePortEntry(entry: unknown): Array<{port: number; protocol: "tcp" | "udp"; hostIp: string | null}> {
    // Task 1: short form only ("HOST:CONTAINER[/proto]"); Task 2 adds
    // host-IP prefixes, ranges, long form, and env interpolation.
    if (typeof entry !== "string") return [];
    const match = SHORT_FORM_PATTERN.exec(entry);
    if (!match) return [];
    const port = Number.parseInt(match[1], 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return [];
    const protocol: "tcp" | "udp" = match[3] === "udp" ? "udp" : "tcp";
    return [{port, protocol, hostIp: null}];
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
    _env: Record<string, string>,
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
            for (const parsed of parsePortEntry(entry)) {
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
