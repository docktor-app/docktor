import {execFile} from "node:child_process";
import path from "node:path";
import {promisify} from "node:util";
import type {ExternalStackControlPort} from "../application/ports/external-stack-control-port.js";
import {composeStopTimeoutMs, unsafeServiceNames, type ComposeProjectTarget} from "../domain/compose-project.js";
import {dockerCliEnvironment} from "../lib/compose-env.js";
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
    options: {readonly cwd: string; readonly timeout: number; readonly env: NodeJS.ProcessEnv},
) => Promise<{stdout: string; stderr: string}>;

const defaultRunner: ComposeCommandRunner = (file, args, options) =>
    execFileAsync(file, [...args], {cwd: options.cwd, timeout: options.timeout, env: options.env});

/**
 * Service names come from container labels and a journal; one that starts with
 * "-" would be read as a compose flag. They are checked here as well, and `--`
 * ends the options before the list (WR-06).
 */
function safeServices(services: readonly string[]): readonly string[] {
    const unsafe = unsafeServiceNames(services);
    if (unsafe.length > 0) {
        throw new AppError(`Refusing to pass the invalid compose service name(s) ${unsafe.map((name) => JSON.stringify(name)).join(", ")} to docker compose`);
    }
    return services;
}

/**
 * Stops, starts and (for a rollback) restores a compose project Docktor does not
 * manage (migration source stacks), always addressed as `-p <project>` (#102). The compose path and the
 * project name travel as their own argv elements and no shell is involved, so
 * they can never be interpreted as a command (T-18-08). The child receives only the
 * allowlisted environment (see lib/compose-env.ts), evaluated per call.
 */
export class ExternalStackControl implements ExternalStackControlPort {
    constructor(
        private readonly run: ComposeCommandRunner = defaultRunner,
        private readonly environment: () => NodeJS.ProcessEnv = () => dockerCliEnvironment(process.env),
    ) {}

    async stop(target: ComposeProjectTarget, options: {readonly timeoutMs: number}): Promise<void> {
        await this.compose(target, ["stop"], options.timeoutMs);
    }

    async start(target: ComposeProjectTarget, services: readonly string[]): Promise<void> {
        if (services.length === 0) {
            return;
        }
        await this.compose(target, ["start", "--", ...safeServices(services)], COMPOSE_TIMEOUT_MS);
    }

    async restoreServices(target: ComposeProjectTarget, services: readonly string[]): Promise<void> {
        if (services.length === 0) {
            return;
        }
        // --no-build: the original images exist already; a restore must never build. No flag removes orphans, volumes or images.
        // Known limits of recreating a service: the child only gets the allowlisted environment, so a
        // `${VAR}` that was exported in the user's shell (and is not in `.env`) resolves blank, and the
        // anonymous volumes of the removed containers are not carried over to the new ones.
        await this.compose(target, ["up", "-d", "--no-build", "--", ...safeServices(services)], composeStopTimeoutMs(services.length));
    }

    private async compose(target: ComposeProjectTarget, command: readonly string[], timeout: number): Promise<void> {
        const {composePath, project} = target;
        try {
            await this.run("docker", ["compose", "-p", project, "-f", composePath, ...command], {
                cwd: path.dirname(composePath),
                timeout,
                env: this.environment(),
            });
        } catch (err: unknown) {
            throw new AppError(
                `docker compose ${command[0]} failed for project ${project} (${composePath}): ${describeFailure(err)}`,
                500,
                undefined,
                {cause: err},
            );
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
