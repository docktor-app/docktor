import {describe, expect, it, vi} from "vitest";
import {ExternalStackControl, type ComposeCommandRunner} from "../../../src/infrastructure/external-stack-control.js";
import {AppError} from "../../../src/lib/errors.js";

const COMPOSE_PATH = "/host/opt/app/docker-compose.yml";

function createRunner() {
    return vi.fn<ComposeCommandRunner>().mockResolvedValue({stdout: "", stderr: ""});
}

describe("ExternalStackControl", () => {
    it.each([
        ["stop", "stop"],
        ["start", "start"],
    ] as const)("%s runs docker compose -f <path> %s with argv only, the compose dir as cwd and a 120s timeout", async (method, subcommand) => {
        const runner = createRunner();

        await new ExternalStackControl(runner)[method](COMPOSE_PATH);

        expect(runner).toHaveBeenCalledTimes(1);
        const [file, args, options] = runner.mock.calls[0] ?? [];
        expect(file).toBe("docker");
        expect(args).toEqual(["compose", "-f", COMPOSE_PATH, subcommand]);
        expect(options?.timeout).toBe(120_000);
        expect(options?.cwd.replaceAll("\\", "/")).toBe("/host/opt/app");
    });

    it.each(["stop", "start"] as const)("%s passes the injected environment to the compose child", async (method) => {
        const runner = createRunner();
        const environment: NodeJS.ProcessEnv = {PATH: "/usr/bin", DOCKER_HOST: "unix:///var/run/docker.sock"};

        await new ExternalStackControl(runner, () => environment)[method](COMPOSE_PATH);

        expect(runner.mock.calls[0]?.[2].env).toBe(environment);
    });

    it("by default hands the compose child only allowlisted variables, never Docktor secrets or COMPOSE_*", async () => {
        vi.stubEnv("PATH", "/usr/bin");
        vi.stubEnv("DATABASE_URL", "postgres://user:pw@db/app");
        vi.stubEnv("BETTER_AUTH_SECRET", "secret");
        vi.stubEnv("COMPOSE_PROJECT_NAME", "docktor");
        try {
            const runner = createRunner();

            await new ExternalStackControl(runner).stop(COMPOSE_PATH);

            const env = runner.mock.calls[0]?.[2].env ?? {};
            expect(env.PATH).toBe("/usr/bin");
            expect(Object.keys(env)).not.toContain("DATABASE_URL");
            expect(Object.keys(env)).not.toContain("BETTER_AUTH_SECRET");
            expect(Object.keys(env)).not.toContain("COMPOSE_PROJECT_NAME");
        } finally {
            vi.unstubAllEnvs();
        }
    });

    it("never uses the recreate-capable up command", async () => {
        const runner = createRunner();
        const control = new ExternalStackControl(runner);

        await control.stop(COMPOSE_PATH);
        await control.start(COMPOSE_PATH);

        const subcommands = runner.mock.calls.map((call) => call[1].at(-1));
        expect(subcommands).toEqual(["stop", "start"]);
    });

    it("wraps a runner failure in an AppError carrying stderr and the original cause", async () => {
        const failure = Object.assign(new Error("Command failed"), {stderr: "no such service: web\n"});
        const runner = vi.fn<ComposeCommandRunner>().mockRejectedValue(failure);

        const error = await new ExternalStackControl(runner).stop(COMPOSE_PATH).catch((err: unknown) => err);

        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.message).toContain("stop");
        expect(appError.message).toContain(COMPOSE_PATH);
        expect(appError.message).toContain("no such service: web");
        expect(appError.cause).toBe(failure);
    });

    it("falls back to the error message when the failure carries no stderr", async () => {
        const runner = vi.fn<ComposeCommandRunner>().mockRejectedValue(new Error("spawn docker ENOENT"));

        const error = await new ExternalStackControl(runner).start(COMPOSE_PATH).catch((err: unknown) => err);

        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).message).toContain("start");
        expect((error as AppError).message).toContain("spawn docker ENOENT");
    });
});
