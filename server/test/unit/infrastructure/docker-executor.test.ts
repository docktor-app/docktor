import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

import {DockerExecutor, type DockerCommandRunner} from "../../../src/infrastructure/docker-executor.js";
import {getStackPath} from "../../../src/lib/stacks-dir.js";

const SAFE_ENV: NodeJS.ProcessEnv = {PATH: "/usr/bin", DOCKER_HOST: "unix:///var/run/docker.sock"};

function createRunner(stdout = "") {
    return vi.fn<DockerCommandRunner>().mockResolvedValue({stdout, stderr: ""});
}

function createExecutor(runner: ReturnType<typeof createRunner>): DockerExecutor {
    return new DockerExecutor(runner, () => SAFE_ENV);
}

describe("DockerExecutor", () => {
    describe("compose commands", () => {
        it.each([
            ["stop", ["compose", "stop"]],
            ["restart", ["compose", "restart"]],
            ["down", ["compose", "down", "-v"]],
        ] as const)("%s runs the unchanged docker compose argv in the stack directory with the injected env", async (method, argv) => {
            const runner = createRunner();

            await createExecutor(runner)[method]("my-stack");

            expect(runner).toHaveBeenCalledTimes(1);
            const [file, args, options] = runner.mock.calls[0] ?? [];
            expect(file).toBe("docker");
            expect(args).toEqual(argv);
            expect(options?.cwd).toBe(getStackPath("my-stack"));
            expect(options?.timeout).toBe(120_000);
            expect(options?.env).toBe(SAFE_ENV);
        });

        it("gives up -d a timeout long enough for image pulls (WR-07)", async () => {
            const runner = createRunner();

            await createExecutor(runner).up("my-stack");

            const [file, args, options] = runner.mock.calls[0] ?? [];
            expect(file).toBe("docker");
            expect(args).toEqual(["compose", "up", "-d", "--remove-orphans"]);
            expect(options?.cwd).toBe(getStackPath("my-stack"));
            expect(options?.env).toBe(SAFE_ENV);
            expect(options?.timeout).toBe(20 * 60_000);
        });

        it("up without orphan removal runs docker compose up -d only", async () => {
            const runner = createRunner();

            await createExecutor(runner).up("my-stack", {removeOrphans: false});

            expect(runner.mock.calls[0]?.[1]).toEqual(["compose", "up", "-d"]);
        });

        it("up keeps removing orphans when the option is true or absent", async () => {
            const runner = createRunner();

            await createExecutor(runner).up("my-stack", {removeOrphans: true});
            await createExecutor(runner).up("my-stack", {});

            expect(runner.mock.calls.map((call) => call[1])).toEqual([
                ["compose", "up", "-d", "--remove-orphans"],
                ["compose", "up", "-d", "--remove-orphans"],
            ]);
        });

        describe("downKeepVolumes (the only down a migration rollback may use)", () => {
            it("runs exactly docker compose down in the stack directory with the injected env", async () => {
                const runner = createRunner();

                await createExecutor(runner).downKeepVolumes("my-stack");

                expect(runner).toHaveBeenCalledTimes(1);
                const [file, args, options] = runner.mock.calls[0] ?? [];
                expect(file).toBe("docker");
                expect(args).toEqual(["compose", "down"]);
                expect(options?.cwd).toBe(getStackPath("my-stack"));
                expect(options?.timeout).toBe(120_000);
                expect(options?.env).toBe(SAFE_ENV);
            });

            it("never passes a flag that removes volumes or images", async () => {
                const runner = createRunner();

                await createExecutor(runner).downKeepVolumes("my-stack");

                const args = runner.mock.calls[0]?.[1] ?? [];
                for (const forbidden of ["-v", "--volumes", "--rmi"]) {
                    expect(args).not.toContain(forbidden);
                }
            });

            it("rejects when docker compose down fails", async () => {
                const runner = vi.fn<DockerCommandRunner>().mockRejectedValue(new Error("daemon unreachable"));

                await expect(createExecutor(runner).downKeepVolumes("my-stack")).rejects.toThrow("daemon unreachable");
            });
        });

        it("ps parses one JSON object per line", async () => {
            const runner = createRunner(
                '{"Service":"web","State":"running","Status":"Up","Ports":"80/tcp"}\n{"Name":"db","State":"exited"}\n',
            );

            const containers = await createExecutor(runner).ps("my-stack");

            expect(runner.mock.calls[0]?.[1]).toEqual(["compose", "ps", "--format", "json"]);
            expect(containers).toEqual([
                {service: "web", state: "running", status: "Up", ports: "80/tcp"},
                {service: "db", state: "exited", status: "", ports: ""},
            ]);
        });

        it("composePull combines stdout and stderr", async () => {
            const runner = vi.fn<DockerCommandRunner>().mockResolvedValue({stdout: "out", stderr: "err"});

            const output = await createExecutor(runner).composePull("my-stack");

            expect(runner.mock.calls[0]?.[1]).toEqual(["compose", "pull"]);
            expect(output).toBe("out\nerr");
        });
    });

    describe("image commands", () => {
        it("pull runs docker pull with the injected env and no cwd", async () => {
            const runner = createRunner();

            await createExecutor(runner).pull("nginx:1.25");

            const [file, args, options] = runner.mock.calls[0] ?? [];
            expect(file).toBe("docker");
            expect(args).toEqual(["pull", "nginx:1.25"]);
            expect(options?.timeout).toBe(120_000);
            expect(options?.env).toBe(SAFE_ENV);
            expect(options?.cwd).toBeUndefined();
        });

        it("imageDigest reads the local repo digest with the injected env", async () => {
            const runner = createRunner("nginx@sha256:aaaa\n");

            const digest = await createExecutor(runner).imageDigest("nginx:1.25");

            expect(digest).toBe("nginx@sha256:aaaa");
            expect(runner.mock.calls[0]?.[1]).toEqual(["image", "inspect", "nginx:1.25", "--format", "{{index .RepoDigests 0}}"]);
            expect(runner.mock.calls[0]?.[2].env).toBe(SAFE_ENV);
        });

        it("imageDigest returns null when the inspect fails", async () => {
            const runner = vi.fn<DockerCommandRunner>().mockRejectedValue(new Error("No such image"));
            vi.spyOn(console, "warn").mockImplementation(() => undefined);

            await expect(createExecutor(runner).imageDigest("nginx:1.25")).resolves.toBeNull();
        });

        it("manifestInspect returns the digest of a manifest", async () => {
            const runner = createRunner(JSON.stringify({Descriptor: {digest: "sha256:bbbb"}}));

            const result = await createExecutor(runner).manifestInspect("nginx:1.25");

            expect(result).toEqual({digest: "sha256:bbbb", latestTag: null});
            expect(runner.mock.calls[0]?.[1]).toEqual(["manifest", "inspect", "--verbose", "nginx:1.25"]);
            expect(runner.mock.calls[0]?.[2].env).toBe(SAFE_ENV);
        });

        it("manifestInspect returns null for an image missing from the registry", async () => {
            const failure = Object.assign(new Error("failed"), {stderr: "no such manifest: nginx:nope"});
            const runner = vi.fn<DockerCommandRunner>().mockRejectedValue(failure);
            vi.spyOn(console, "warn").mockImplementation(() => undefined);

            await expect(createExecutor(runner).manifestInspect("nginx:nope")).resolves.toBeNull();
        });

        it("manifestInspect rethrows any other failure", async () => {
            const failure = Object.assign(new Error("toomanyrequests"), {stderr: "429 rate limit"});
            const runner = vi.fn<DockerCommandRunner>().mockRejectedValue(failure);
            vi.spyOn(console, "error").mockImplementation(() => undefined);

            await expect(createExecutor(runner).manifestInspect("nginx:1.25")).rejects.toBe(failure);
        });
    });

    describe("default environment", () => {
        beforeEach(() => {
            vi.stubEnv("PATH", "/usr/bin");
            vi.stubEnv("BETTER_AUTH_SECRET", "secret");
            vi.stubEnv("DATABASE_URL", "postgres://x");
            vi.stubEnv("COMPOSE_PROJECT_NAME", "docktor");
        });

        afterEach(() => {
            vi.unstubAllEnvs();
        });

        it("never hands Docktor secrets or COMPOSE_* variables to a compose child", async () => {
            const runner = createRunner();

            await new DockerExecutor(runner).up("my-stack");

            const env = runner.mock.calls[0]?.[2].env ?? {};
            expect(env.PATH).toBe("/usr/bin");
            expect(Object.keys(env)).not.toContain("BETTER_AUTH_SECRET");
            expect(Object.keys(env)).not.toContain("DATABASE_URL");
            expect(Object.keys(env)).not.toContain("COMPOSE_PROJECT_NAME");
        });
    });
});
