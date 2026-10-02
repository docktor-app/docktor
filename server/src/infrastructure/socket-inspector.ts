/**
 * D-13 best-effort tier-3 port-conflict lookup: shells out to `ss`, falling
 * back to `lsof`, to find a process listening on a port that neither the
 * database (Docktor stacks) nor dockerode (any container) tier could
 * attribute.
 *
 * IMPORTANT network-namespace limitation (RESEARCH.md Critical
 * Finding/Pitfall 1): inside Docktor's own container (default bridge
 * network, not `network_mode: host`) `ss`/`lsof` only see Docktor's own
 * loopback sockets — never another container's bound ports, nor a
 * genuinely host-level process's. This adapter is most useful when Docktor
 * runs directly on a host (e.g. `yarn dev`); in the common containerized
 * deployment it will typically find nothing and the caller falls through
 * to reporting "unknown process", which is the documented, intentional
 * degradation — not a bug.
 */
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import type {SocketInspectorPort} from "../application/ports/socket-inspector-port.js";
import type {SocketListener} from "../domain/port-conflicts.js";

const execFileAsync = promisify(execFile);

/**
 * Injectable shell-out seam for testability (mirrors ResticExecutor's
 * constructor-injectable binary/runner pattern) — tests substitute a fake
 * runner instead of mocking node:child_process.
 */
export type CommandRunner = (file: string, args: readonly string[]) => Promise<{stdout: string}>;

const defaultRunner: CommandRunner = (file, args) =>
    execFileAsync(file, [...args], {timeout: 5_000});

// Fixed argv, never a shell (matches docker-executor.ts/restic-executor.ts's
// execFile convention) — no user input ever reaches these arguments.
const SS_ARGS = ["-H", "-l", "-n", "-p", "-t", "-u"] as const;
const LSOF_ARGS = ["-nP", "-iTCP", "-sTCP:LISTEN", "-iUDP", "-F", "pcPn"] as const;

function extractPortFromAddress(address: string): number | null {
    const stripped = address.replace(/[[\]]/g, "");
    const lastColon = stripped.lastIndexOf(":");
    if (lastColon === -1) return null;
    const port = Number.parseInt(stripped.slice(lastColon + 1), 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    return port;
}

/**
 * Parses `ss -H -l -n -p -t -u` output. Each line's columns are
 * Netid/State/Recv-Q/Send-Q/Local-Address:Port/Peer-Address:Port/Process;
 * the process column (when present and permitted) carries
 * `users:(("name",pid=N,...))`. A line whose owning process can't be
 * determined (missing `users:` column — tool ran without permission, or
 * the process already exited) still yields a listener with
 * processName/pid null rather than being dropped, so the port itself is
 * never silently lost.
 */
export function parseSsOutput(stdout: string): SocketListener[] {
    const listeners: SocketListener[] = [];
    for (const rawLine of stdout.split("\n")) {
        const line = rawLine.trim();
        if (!line) continue;
        const columns = line.split(/\s+/);
        if (columns.length < 5) continue;
        const netid = columns[0].toLowerCase();
        if (netid !== "tcp" && netid !== "udp") continue;

        const port = extractPortFromAddress(columns[4]);
        if (port === null) continue;

        const processMatch = /users:\(\("([^"]+)",pid=(\d+)/.exec(line);
        listeners.push({
            port,
            protocol: netid,
            processName: processMatch ? processMatch[1] : null,
            pid: processMatch ? Number.parseInt(processMatch[2], 10) : null,
        });
    }
    return listeners;
}

/**
 * Parses `lsof -nP -iTCP -sTCP:LISTEN -iUDP -F pcPn` output: a flat stream
 * of single-letter-tagged lines (`p<pid>`, `c<command>`, `P<TCP|UDP>`,
 * `n<addr:port>`) where a `p`/`c` line applies to every `P`/`n` line that
 * follows until the next `p`.
 */
export function parseLsofOutput(stdout: string): SocketListener[] {
    const listeners: SocketListener[] = [];
    let currentPid: number | null = null;
    let currentCommand: string | null = null;
    let currentProtocol: "tcp" | "udp" | null = null;

    for (const rawLine of stdout.split("\n")) {
        const line = rawLine.trim();
        if (!line) continue;
        const tag = line[0];
        const value = line.slice(1);

        if (tag === "p") {
            const pid = Number.parseInt(value, 10);
            currentPid = Number.isInteger(pid) ? pid : null;
        } else if (tag === "c") {
            currentCommand = value;
        } else if (tag === "P") {
            const upper = value.toUpperCase();
            currentProtocol = upper === "TCP" ? "tcp" : upper === "UDP" ? "udp" : null;
        } else if (tag === "n" && currentProtocol) {
            const port = extractPortFromAddress(value);
            if (port !== null) {
                listeners.push({port, protocol: currentProtocol, processName: currentCommand, pid: currentPid});
            }
        }
    }
    return listeners;
}

export class SocketInspector implements SocketInspectorPort {
    private hasWarned = false;

    constructor(private readonly run: CommandRunner = defaultRunner) {}

    async listListeners(): Promise<SocketListener[]> {
        try {
            const {stdout} = await this.run("ss", SS_ARGS);
            return parseSsOutput(stdout);
        } catch {
            // ss unavailable/denied — fall through to lsof.
        }

        try {
            const {stdout} = await this.run("lsof", LSOF_ARGS);
            return parseLsofOutput(stdout);
        } catch {
            if (!this.hasWarned) {
                this.hasWarned = true;
                console.warn(
                    "[SocketInspector] neither ss nor lsof is available — host-process port detection disabled",
                );
            }
            return [];
        }
    }
}

export const socketInspector = new SocketInspector();
