import {execFile} from "node:child_process";
import {randomUUID} from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {promisify} from "node:util";

import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {dockerCliEnvironment} from "../../../src/lib/compose-env.js";

const execFileAsync = promisify(execFile);

const COMPOSE_FILE = `services:
  probe:
    image: alpine:3
    environment:
      FROM_STACK: \${DOCKTOR_PROBE_VALUE}
      SECRET_PROBE: \${BETTER_AUTH_SECRET:-not-leaked}
`;

/**
 * #109 decision, proven against the real docker compose CLI: Compose gives the calling environment
 * precedence over a stack's .env, so Docktor hands its children only an allowlist. `${VAR}` then
 * resolves from the stack's own .env, and a Docktor secret never interpolates.
 *
 * Runs only in CI (DOCKTOR_REAL_DOCKER_TESTS=1). `config` creates no containers or networks; the
 * project name is random so concurrent runs cannot collide.
 */
describe.runIf(process.env.DOCKTOR_REAL_DOCKER_TESTS === "1")("docker compose interpolation with the allowlisted environment", () => {
    let directory: string;

    beforeAll(async () => {
        directory = await fs.mkdtemp(path.join(os.tmpdir(), "docktor-test-"));
        await fs.writeFile(path.join(directory, "compose.yml"), COMPOSE_FILE, "utf-8");
        await fs.writeFile(path.join(directory, ".env"), "DOCKTOR_PROBE_VALUE=from-stack-env\n", "utf-8");
    });

    afterAll(async () => {
        await fs.rm(directory, {recursive: true, force: true});
    });

    it("resolves ${VAR} from the stack's .env and never from Docktor's environment", async () => {
        const docktorEnvironment: NodeJS.ProcessEnv = {
            ...process.env,
            BETTER_AUTH_SECRET: "leak-canary",
            DOCKTOR_PROBE_VALUE: "from-docktor",
        };
        const project = `docktor-test-${randomUUID().slice(0, 8)}`;

        const {stdout} = await execFileAsync(
            "docker",
            ["compose", "-p", project, "-f", path.join(directory, "compose.yml"), "config", "--format", "json"],
            {cwd: directory, timeout: 60_000, env: dockerCliEnvironment(docktorEnvironment)},
        );

        const config: unknown = JSON.parse(stdout);
        const environment = readProbeEnvironment(config);
        expect(environment.FROM_STACK).toBe("from-stack-env");
        expect(environment.SECRET_PROBE).toBe("not-leaked");
    });
});

function readProbeEnvironment(config: unknown): Record<string, unknown> {
    const services: unknown = isRecord(config) ? config.services : undefined;
    const probe: unknown = isRecord(services) ? services.probe : undefined;
    const environment: unknown = isRecord(probe) ? probe.environment : undefined;
    if (!isRecord(environment)) {
        throw new Error("docker compose config did not report the probe service environment");
    }
    return environment;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
