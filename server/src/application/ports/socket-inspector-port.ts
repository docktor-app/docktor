import type {SocketListener} from "../../domain/port-conflicts.js";

/**
 * Port for the D-13 "shell out to ss/lsof" best-effort tier-3 port-conflict
 * lookup (D-07: application code depends on this interface, never the
 * concrete SocketInspector class, so it stays unit-testable with a plain
 * fake).
 *
 * IMPORTANT network-namespace limitation (RESEARCH.md Critical
 * Finding/Pitfall 1): Docktor's own container runs on the default bridge
 * network, not `network_mode: host` — `ss`/`lsof` run inside it only see
 * Docktor's own loopback sockets, never another container's bound ports or
 * a genuinely host-level process's. This is therefore most useful when
 * Docktor runs directly on a host (e.g. `yarn dev`) rather than inside its
 * own container; the database (Docktor stacks) and dockerode (any
 * container) tiers in port-conflicts.ts are the reliable layers; this port
 * is the documented last-resort supplement, not the primary mechanism.
 */
export interface SocketInspectorPort {
    listListeners(): Promise<SocketListener[]>;
}

export type {SocketListener};
