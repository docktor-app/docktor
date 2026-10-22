import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {dockerCliEnvironment} from "../lib/compose-env.js";
import {getStackPath} from "../lib/stacks-dir.js";
import type {DockerExecutorPort} from "../application/ports/docker-executor-port.js";

const execFileAsync = promisify(execFile);

/**
 * Injectable shell-out seam for testability (mirrors ExternalStackControl's runner): tests
 * substitute a fake runner instead of mocking node:child_process.
 */
export type DockerCommandRunner = (
    file: string,
    args: readonly string[],
    options: {readonly cwd?: string; readonly timeout: number; readonly env: NodeJS.ProcessEnv},
) => Promise<{stdout: string; stderr: string}>;

const defaultDockerRunner: DockerCommandRunner = (file, args, options) =>
    execFileAsync(file, [...args], {cwd: options.cwd, timeout: options.timeout, env: options.env});

export interface ContainerStatus {
    service: string;
    state: string;
    status: string;
    ports: string;
}

/**
 * Runs docker and docker compose for managed stacks. Every child receives only the allowlisted
 * environment (see lib/compose-env.ts), evaluated per call.
 */
export class DockerExecutor implements DockerExecutorPort {
    constructor(
        private readonly run: DockerCommandRunner = defaultDockerRunner,
        private readonly environment: () => NodeJS.ProcessEnv = () => dockerCliEnvironment(process.env),
    ) {}

    private async composeExec(
        stackId: string,
        args: string[],
    ): Promise<{stdout: string; stderr: string}> {
        return this.run("docker", ["compose", ...args], {
            cwd: getStackPath(stackId),
            timeout: 120_000,
            env: this.environment(),
        });
    }

    async up(stackId: string, options: {readonly removeOrphans?: boolean} = {}): Promise<void> {
        const removeOrphans = options.removeOrphans ?? true;
        await this.composeExec(stackId, removeOrphans ? ["up", "-d", "--remove-orphans"] : ["up", "-d"]);
    }

    async stop(stackId: string): Promise<void> {
        await this.composeExec(stackId, ["stop"]);
    }

    async restart(stackId: string): Promise<void> {
        await this.composeExec(stackId, ["restart"]);
    }

    async down(stackId: string): Promise<void> {
        await this.composeExec(stackId, ["down", "-v"]);
    }

    async downKeepVolumes(stackId: string): Promise<void> {
        await this.composeExec(stackId, ["down"]);
    }

    async ps(stackId: string): Promise<ContainerStatus[]> {
        try {
            const {stdout} = await this.composeExec(stackId, [
                "ps",
                "--format",
                "json",
            ]);

            if (!stdout.trim()) return [];

            const lines = stdout.trim().split("\n");
            return lines.map((line) => {
                const obj = JSON.parse(line);
                return {
                    service: obj.Service ?? obj.Name ?? "",
                    state: obj.State ?? "",
                    status: obj.Status ?? "",
                    ports: obj.Ports ?? "",
                };
            });
        } catch {
            return [];
        }
    }

    async composePull(stackId: string): Promise<string> {
        const {stdout, stderr} = await this.composeExec(stackId, ["pull"]);
        // docker compose pull writes progress to stderr, combine both for analysis
        return stdout + "\n" + stderr;
    }

    async pull(imageRef: string): Promise<void> {
        await this.run("docker", ["pull", imageRef], {
            timeout: 120_000,
            env: this.environment(),
        });
    }

    async manifestInspect(imageRef: string): Promise<{
        digest: string | null
        latestTag: string | null
    } | null> {
        try {
            const {stdout} = await this.run(
                "docker",
                ["manifest", "inspect", "--verbose", imageRef],
                {timeout: 30_000, env: this.environment()},
            );
            // docker manifest inspect --verbose output:
            // Multi-arch: returns JSON array; single-arch: returns JSON object
            const parsed = JSON.parse(stdout);
            const manifest = Array.isArray(parsed) ? parsed[0] : parsed;

            // Extract digest from known field locations
            const digest: string | null =
                manifest?.Descriptor?.digest ??           // multi-arch descriptor
                manifest?.SchemaV2Manifest?.config?.digest ??  // single-arch v2
                manifest?.Ref ??
                null;

            if (!digest) {
                console.warn(`[DockerExecutor] manifestInspect: No digest found for ${imageRef}. Manifest keys: ${Object.keys(manifest).join(', ')}`);
            }

            return {digest, latestTag: null};
        } catch (err: unknown) {
            const {message, stderr} = describeCommandFailure(err);
            // "no such manifest" or "not found" = image not found in registry
            if (stderr.includes("no such manifest") || stderr.includes("not found")) {
                console.warn(`[DockerExecutor] manifestInspect: Image not found in registry: ${imageRef}. stderr: ${stderr}`);
                return null;
            }
            // 429 rate limit or auth error — re-throw so UpdateChecker can record checkError
            console.error(`[DockerExecutor] manifestInspect failed for ${imageRef}:`, message, stderr);
            throw err;
        }
    }

    /**
     * Resolves the repo digest of a locally present image. Reads only the
     * local image store (`docker image inspect`) — makes no network call
     * and cannot consume registry rate limit. Returns null (not a throw)
     * when the image is not present locally, since that is a normal
     * condition (e.g. a stack that has never been deployed).
     */
    async imageDigest(imageRef: string): Promise<string | null> {
        try {
            const {stdout} = await this.run(
                "docker",
                ["image", "inspect", imageRef, "--format", "{{index .RepoDigests 0}}"],
                {timeout: 30_000, env: this.environment()},
            );
            const digest = stdout.trim();
            // Empty output, or the literal Go template rendering when
            // RepoDigests has no entry at index 0 (e.g. a locally built
            // image with no registry digest), both mean "no digest".
            if (!digest || digest === "<no value>" || digest.includes("index .RepoDigests")) {
                return null;
            }
            return digest;
        } catch (err: unknown) {
            console.warn(`[DockerExecutor] imageDigest: image not present locally or inspect failed for ${imageRef}: ${describeCommandFailure(err).message}`);
            return null;
        }
    }
}

/** Reads the message and stderr of a failed child process without trusting its shape. */
function describeCommandFailure(err: unknown): {message: string; stderr: string} {
    if (err instanceof Error) {
        const stderr: unknown = Reflect.get(err, "stderr");
        return {message: err.message, stderr: typeof stderr === "string" ? stderr : ""};
    }
    return {message: String(err), stderr: ""};
}

export const dockerExecutor = new DockerExecutor();
