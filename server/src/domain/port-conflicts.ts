/**
 * Pure resolution of which requested host ports collide with an existing
 * holder, and who that holder is. No I/O: callers (plan 12-08's
 * PortConflictService) gather the three input shapes from the database,
 * dockerode, and SocketInspector, and hand them here.
 *
 * D-15 precedence: a Docktor-managed stack holder outranks a non-Docktor
 * container holder, which outranks a listening-process holder. Implemented
 * as an ordered list of tier resolvers — tier 1 (Docktor stacks via the
 * database), tier 2 (any running container via dockerode), tier 3
 * (listening sockets via SocketInspector, best-effort) — so a future tier
 * is additive, never a rewrite.
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

function stripLeadingSlash(name: string): string {
    return name.startsWith("/") ? name.slice(1) : name;
}

/**
 * Tier 2: any running container (Docktor-managed or not) that publishes
 * the requested port. A container whose compose project label matches an
 * existing Docktor stack id is attributed to that stack regardless of the
 * stack's DB-recorded status — the container actually running proves it
 * holds the port, which is stronger evidence than the stack's own status
 * column. A container whose compose project equals the stack being
 * deployed is excluded (self-conflict).
 */
function resolveContainerHolder(requested: RequestedHostPort, input: ResolvePortConflictsInput): PortHolder | null {
    for (const container of input.containers) {
        if (container.composeProject === input.stackId) continue;
        const holds = container.publishedPorts.some(
            (p) => p.port === requested.port && p.protocol === requested.protocol,
        );
        if (!holds) continue;

        if (container.composeProject) {
            const ownerStack = input.stacks.find((s) => s.id === container.composeProject);
            if (ownerStack) {
                return {kind: "stack", stackId: ownerStack.id, stackDisplayName: ownerStack.displayName};
            }
        }
        return {kind: "container", containerName: stripLeadingSlash(container.containerName)};
    }
    return null;
}

/**
 * Tier 3 (D-13, best-effort last resort): a listening socket reported by
 * SocketInspector. A listener whose owning process could not be identified
 * (processName/pid null — e.g. the tool lacks permission, or ran inside a
 * namespace that can't see the owning process) is reported as "unknown"
 * rather than fabricating a name.
 */
function resolveListenerHolder(requested: RequestedHostPort, input: ResolvePortConflictsInput): PortHolder | null {
    for (const listener of input.listeners) {
        if (listener.port !== requested.port || listener.protocol !== requested.protocol) continue;
        if (listener.processName !== null && listener.pid !== null) {
            return {kind: "process", processName: listener.processName, pid: listener.pid};
        }
        return {kind: "unknown"};
    }
    return null;
}

// Ordered list of tier resolvers (D-15 precedence): the first tier to name
// a holder for a requested port wins — DB (Docktor stacks) before Docker
// API (any container) before socket best-effort (listening processes).
const TIER_RESOLVERS: ReadonlyArray<(requested: RequestedHostPort, input: ResolvePortConflictsInput) => PortHolder | null> = [
    resolveStackHolder,
    resolveContainerHolder,
    resolveListenerHolder,
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
