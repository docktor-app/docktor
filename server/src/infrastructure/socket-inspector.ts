/**
 * D-13 best-effort tier-3 port-conflict lookup: shells out to `ss`, falling
 * back to `lsof`, to find a process listening on a port that neither the
 * database (Docktor stacks) nor dockerode (any container) tier could
 * attribute.
 *
 * Network-namespace handling (RESEARCH.md Pitfall 1, UAT G-12-2): inside
 * Docktor's own container (default bridge network) a local `ss`/`lsof` only
 * sees Docktor's own sockets. The preferred probe therefore runs the same
 * tools in a short-lived helper container started through the mounted
 * Docker socket with `--network host --pid host`, which sees every
 * host-level listener. The local probe is only the fallback for when the
 * helper cannot run (no Docker socket, image unavailable) or Docktor runs
 * directly on the host (e.g. `yarn dev`).
 */
import {execFile} from "node:child_process";
import {hostname} from "node:os";
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

/**
 * Resolves the image Docktor itself runs from (it already ships `ss` and
 * `lsof`), so the helper container needs no extra image pull. Cached; null
 * when Docktor is not containerised or the lookup fails.
 */
let selfImagePromise: Promise<string | null> | null = null;
function resolveSelfImage(): Promise<string | null> {
    if (selfImagePromise === null) {
        selfImagePromise = execFileAsync(
            "docker",
            ["inspect", "--format", "{{.Config.Image}}", hostname()],
            {timeout: 5_000},
        ).then(
            ({stdout}) => stdout.trim() || null,
            () => null,
        );
    }
    return selfImagePromise;
}

/**
 * Runs a command inside a throwaway container sharing the host's network
 * and PID namespaces. `--pull never` guarantees no network access and
 * SYS_PTRACE lets `ss -p` attribute other users' processes. Argv is fixed;
 * no user input reaches it.
 */
export const hostNamespaceRunner: CommandRunner = async (file, args) => {
    const image = await resolveSelfImage();
    if (!image) throw new Error("host-namespace probe unavailable: not running inside a container");
    return execFileAsync(
        "docker",
        ["run", "--rm", "--network", "host", "--pid", "host", "--cap-add", "SYS_PTRACE", "--pull", "never", image, file, ...args],
        {timeout: 15_000},
    );
};

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

    /**
     * @param runners probe runners tried in order — the host-namespace
     * runner first (sees host-level sockets), the local runner last.
     */
    constructor(private readonly runners: readonly CommandRunner[] = [hostNamespaceRunner, defaultRunner]) {}

    async listListeners(): Promise<SocketListener[]> {
        for (const run of this.runners) {
            const listeners = await this.probe(run);
            if (listeners) return listeners;
        }
        if (!this.hasWarned) {
            this.hasWarned = true;
            console.warn("[SocketInspector] neither ss nor lsof is available — host-process port detection disabled");
        }
        return [];
    }

    private async probe(run: CommandRunner): Promise<SocketListener[] | null> {
        try {
            const {stdout} = await run("ss", SS_ARGS);
            return parseSsOutput(stdout);
        } catch {
            // ss unavailable/denied — fall through to lsof.
        }
        try {
            const {stdout} = await run("lsof", LSOF_ARGS);
            return parseLsofOutput(stdout);
        } catch {
            return null;
        }
    }
}

export const socketInspector = new SocketInspector();
