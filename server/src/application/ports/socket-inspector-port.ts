import type {SocketListener} from "../../domain/port-conflicts.js";

/**
 * Port for the D-13 "shell out to ss/lsof" best-effort tier-3 port-conflict
 * lookup (D-07: application code depends on this interface, never the
 * concrete SocketInspector class, so it stays unit-testable with a plain
 * fake).
 *
 * The concrete adapter probes the host's network/PID namespace through a
 * short-lived helper container (see socket-inspector.ts), falling back to a
 * local `ss`/`lsof` when that is unavailable.
 */
export interface SocketInspectorPort {
    listListeners(): Promise<SocketListener[]>;
}

export type {SocketListener};
