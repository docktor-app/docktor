/**
 * Pure resolution of which requested host ports collide with an existing
 * holder, and who that holder is. No I/O: callers (plan 12-08's
 * PortConflictService) gather the three input shapes from the database,
 * dockerode, and SocketInspector, and hand them here.
 *
 * D-15 precedence: a Docktor-managed stack holder outranks a non-Docktor
 * container holder, which outranks a listening-process holder. Task 1
 * (this commit) implements tier 1 (Docktor stacks) only, structured as an
 * ordered list of tier resolvers so Task 2's container/process tiers are
 * additive, not a rewrite.
 */
import type {RequestedHostPort} from "./host-ports.js";

export type PortHolder =
    | {readonly kind: "stack"; readonly stackId: string; readonly stackDisplayName: string}
    | {readonly kind: "container"; readonly containerName: string}
    | {readonly kind: "process"; readonly processName: string; readonly pid: number}
    | {readonly kind: "unknown"};

export interface PortConflict {
    readonly port: number;
    readonly protocol: "tcp" | "udp";
    readonly serviceName: string;
    readonly holder: PortHolder;
}

/**
 * A Docktor stack only counts as a port holder while it is actually
 * running (or transitioning through a state that implies its containers
 * are up) the service that published the port — a STOPPED/DRAFT/ERROR
 * stack cannot be holding the socket open.
 */
export const PORT_HOLDING_STACK_STATUSES = ["RUNNING", "HEALTHY", "UNHEALTHY", "DEPLOYING", "UPDATING"] as const;

export interface DocktorStackPorts {
    readonly id: string;
    readonly displayName: string;
    readonly status: string;
    readonly services: ReadonlyArray<{readonly ports: string | null}>;
}

export interface RunningContainerPorts {
    readonly containerName: string;
    readonly composeProject: string | null;
    readonly publishedPorts: ReadonlyArray<{readonly port: number; readonly protocol: "tcp" | "udp"}>;
}

export interface SocketListener {
    readonly port: number;
    readonly protocol: "tcp" | "udp";
    readonly processName: string | null;
    readonly pid: number | null;
}

export interface ResolvePortConflictsInput {
    readonly stackId: string;
    readonly requested: ReadonlyArray<RequestedHostPort>;
    readonly stacks: ReadonlyArray<DocktorStackPorts>;
    readonly containers: ReadonlyArray<RunningContainerPorts>;
    readonly listeners: ReadonlyArray<SocketListener>;
}

interface ParsedServicePort {
    readonly host: number;
    readonly protocol: string;
}

function isParsedServicePort(entry: unknown): entry is ParsedServicePort {
    if (!entry || typeof entry !== "object") return false;
    // Narrowing cast purely for property access; the typeof checks below
    // are what actually establishes the shape, so this is safe.
    const candidate = entry as {host?: unknown; protocol?: unknown};
    return typeof candidate.host === "number" && typeof candidate.protocol === "string";
}

function parseServicePorts(raw: string | null): ParsedServicePort[] {
    if (!raw) return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(isParsedServicePort);
    } catch {
        // Malformed Service.ports JSON on another stack must never crash a
        // conflict check — treat it as "holds nothing".
        return [];
    }
}

function resolveStackHolder(requested: RequestedHostPort, input: ResolvePortConflictsInput): PortHolder | null {
    for (const stack of input.stacks) {
        if (stack.id === input.stackId) continue; // the stack being deployed never conflicts with itself
        if (!(PORT_HOLDING_STACK_STATUSES as readonly string[]).includes(stack.status)) continue;
        const holds = stack.services.some((service) =>
            parseServicePorts(service.ports).some((p) => p.host === requested.port && p.protocol === requested.protocol),
        );
        if (holds) {
            return {kind: "stack", stackId: stack.id, stackDisplayName: stack.displayName};
        }
    }
    return null;
}

// Ordered list of tier resolvers (D-15 precedence): the first tier to name
// a holder for a requested port wins. Task 2 appends the container and
// listener tiers here, additively.
const TIER_RESOLVERS: ReadonlyArray<(requested: RequestedHostPort, input: ResolvePortConflictsInput) => PortHolder | null> = [
    resolveStackHolder,
];

/**
 * For every requested port, returns at most one conflict — whichever tier
 * resolver (in D-15 precedence order) first names a holder for it. A
 * requested port with no holder in any tier produces no entry.
 */
export function resolvePortConflicts(input: ResolvePortConflictsInput): PortConflict[] {
    const conflicts: PortConflict[] = [];
    for (const requested of input.requested) {
        for (const resolver of TIER_RESOLVERS) {
            const holder = resolver(requested, input);
            if (holder) {
                conflicts.push({
                    port: requested.port,
                    protocol: requested.protocol,
                    serviceName: requested.serviceName,
                    holder,
                });
                break;
            }
        }
    }
    return conflicts;
}
