import {describe, expect, it} from "vitest";

import {DOCKER_CLI_ENV_ALLOWLIST, dockerCliEnvironment} from "../../../src/lib/compose-env.js";

describe("dockerCliEnvironment", () => {
    it("keeps only the variables the docker CLI needs and drops Docktor secrets and COMPOSE_* variables", () => {
        const source: NodeJS.ProcessEnv = {
            PATH: "/usr/bin",
            HOME: "/root",
            DOCKER_HOST: "unix:///var/run/docker.sock",
            HTTP_PROXY: "http://proxy:3128",
            BETTER_AUTH_SECRET: "secret",
            DATABASE_URL: "postgres://user:pw@db/app",
            ENCRYPTION_KEY: "key",
            COMPOSE_PROJECT_NAME: "docktor",
            COMPOSE_FILE: "other.yml",
            DOCKTOR_STACKS_DIR: "/stacks",
        };

        const result = dockerCliEnvironment(source);

        expect(Object.keys(result).sort().join(",")).toBe("DOCKER_HOST,HOME,HTTP_PROXY,PATH");
        expect(result).toEqual({
            PATH: "/usr/bin",
            HOME: "/root",
            DOCKER_HOST: "unix:///var/run/docker.sock",
            HTTP_PROXY: "http://proxy:3128",
        });
    });

    it("omits allowlisted keys whose value is undefined", () => {
        const result = dockerCliEnvironment({PATH: "/usr/bin", HOME: undefined});

        expect(result).toEqual({PATH: "/usr/bin"});
        expect(Object.hasOwn(result, "HOME")).toBe(false);
    });

    it("does not mutate the source environment and returns a new object", () => {
        const source: NodeJS.ProcessEnv = {PATH: "/usr/bin", DATABASE_URL: "postgres://x"};

        const result = dockerCliEnvironment(source);

        expect(result).not.toBe(source);
        expect(source).toEqual({PATH: "/usr/bin", DATABASE_URL: "postgres://x"});
    });

    it("never allowlists a COMPOSE_ or DOCKTOR_ variable or a Docktor secret", () => {
        for (const name of DOCKER_CLI_ENV_ALLOWLIST) {
            expect(name.startsWith("COMPOSE_")).toBe(false);
            expect(name.startsWith("DOCKTOR_")).toBe(false);
        }
        for (const secret of ["BETTER_AUTH_SECRET", "DATABASE_URL", "ENCRYPTION_KEY"]) {
            expect(DOCKER_CLI_ENV_ALLOWLIST).not.toContain(secret);
        }
    });
});
