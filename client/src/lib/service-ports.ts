export interface ServicePortBinding {
    host: number;
    container: number;
}

function isServicePortBinding(value: unknown): value is ServicePortBinding {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.host === "number" && typeof candidate.container === "number";
}

/**
 * Parses a service's stored `ports` JSON column into typed bindings. Never
 * throws — malformed JSON or a non-array shape yields [], and any entry that
 * isn't a valid {host, container} pair is dropped rather than crashing the
 * caller (T-11-06).
 */
export function parsePorts(ports: string | null | undefined): ServicePortBinding[] {
    if (!ports) return [];

    let parsed: unknown;
    try {
        parsed = JSON.parse(ports);
    } catch {
        return [];
    }

    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isServicePortBinding);
}

export function formatPorts(ports: ServicePortBinding[] | null | undefined): string {
    if (!ports || ports.length === 0) return "-";
    return ports.map((binding) => `${binding.host}:${binding.container}`).join(", ");
}
