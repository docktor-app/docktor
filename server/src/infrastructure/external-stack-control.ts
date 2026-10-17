import {execFile} from "node:child_process";
import path from "node:path";
import {promisify} from "node:util";
import type {ExternalStackControlPort} from "../application/ports/external-stack-control-port.js";
import {AppError} from "../lib/errors.js";

const execFileAsync = promisify(execFile);

const COMPOSE_TIMEOUT_MS = 120_000;

/**
 * Injectable shell-out seam for testability (mirrors SocketInspector's
 * CommandRunner): tests substitute a fake runner instead of mocking
 * node:child_process.
 */
export type ComposeCommandRunner = (
    file: string,
    args: readonly string[],
    options: {readonly cwd: string; readonly timeout: number},
) => Promise<{stdout: string; stderr: string}>;

const defaultRunner: ComposeCommandRunner = (file, args, options) =>
    execFileAsync(file, [...args], {cwd: options.cwd, timeout: options.timeout});

/**
 * Stops and starts a compose project Docktor does not manage (migration source
 * stacks). The compose path travels as its own argv element and no shell is
 * involved, so it can never be interpreted as a command (T-18-08).
 */
export class ExternalStackControl implements ExternalStackControlPort {
    constructor(private readonly run: ComposeCommandRunner = defaultRunner) {}

    async stop(composePath: string): Promise<void> {
        await this.compose(composePath, "stop");
    }

    async start(composePath: string): Promise<void> {
        await this.compose(composePath, "start");
    }

    private async compose(composePath: string, subcommand: "stop" | "start"): Promise<void> {
        try {
            await this.run("docker", ["compose", "-f", composePath, subcommand], {
                cwd: path.dirname(composePath),
                timeout: COMPOSE_TIMEOUT_MS,
            });
        } catch (err: unknown) {
            const wrapped = new AppError(
                `docker compose ${subcommand} failed for ${composePath}: ${describeFailure(err)}`,
            );
            wrapped.cause = err;
            throw wrapped;
        }
    }
}

/** Prefers the failed command's stderr, which names the actual compose problem. */
function describeFailure(err: unknown): string {
    if (err instanceof Error) {
        const stderr: unknown = Reflect.get(err, "stderr");
        if (typeof stderr === "string" && stderr.trim() !== "") {
            return stderr.trim();
        }
        return err.message;
    }
    return String(err);
}

export const externalStackControl = new ExternalStackControl();
