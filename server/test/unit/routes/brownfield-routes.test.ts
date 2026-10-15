import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

// Both mocks are mandatory: without them, importing the real route modules
// transitively loads better-auth and the Prisma-backed onboarding service.
// migration-service is deliberately NOT mocked so the preview runs for real.
vi.mock("../../../src/lib/auth-middleware.js", () => ({
    requireAuth: vi.fn(async () => undefined),
}));

const onboardingFake = vi.hoisted(() => ({
    scan: vi.fn(),
    adoptInPlace: vi.fn(),
    isWizardComplete: vi.fn(async () => false),
    hasAnyUser: vi.fn(async () => true),
}));

vi.mock("../../../src/application/onboarding-service.js", () => ({
    onboardingService: onboardingFake,
}));

import Fastify from "fastify";
import {serializerCompiler, validatorCompiler, type ZodTypeProvider} from "fastify-type-provider-zod";
import importRoutes from "../../../src/routes/imports.js";

const COMPOSE_FIXTURE = [
    "services:",
    "  db:",
    "    image: postgres:16",
    "    volumes:",
    "      - pgdata:/var/lib/postgresql/data",
    "volumes:",
    "  pgdata: {}",
    "",
].join("\n");

async function buildTestApp() {
    const app = Fastify({logger: false}).withTypeProvider<ZodTypeProvider>();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(importRoutes);
    return app;
}

describe("brownfield routes", () => {
    let app: Awaited<ReturnType<typeof buildTestApp>>;
    let tmpDir: string;
    let composePath: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "docktor-brownfield-routes-"));
        composePath = path.join(tmpDir, "docker-compose.yml");
        await fs.writeFile(composePath, COMPOSE_FIXTURE, "utf-8");
        app = await buildTestApp();
    });

    afterEach(async () => {
        await app.close();
        await fs.rm(tmpDir, {recursive: true, force: true});
    });

    describe("POST /api/stacks/import/migrate/preview (MIG-02)", () => {
        const url = "/api/stacks/import/migrate/preview";

        it("returns a real UnifiedDiff computed from the compose file", async () => {
            const res = await app.inject({
                method: "POST",
                url,
                payload: {composePath, volumeSelections: [], namedVolumeSelections: {pgdata: true}},
            });

            expect(res.statusCode).toBe(200);
            const body = res.json();
            expect(Array.isArray(body.diff.hunks)).toBe(true);
            expect(body.diff.hunks.length).toBeGreaterThan(0);
            expect(body.diff.added).toBeGreaterThanOrEqual(1);
            expect(body.diff.removed).toBeGreaterThanOrEqual(1);
            const lines: {kind: string; text: string}[] = body.diff.hunks.flatMap(
                (hunk: {lines: {kind: string; text: string}[]}) => hunk.lines,
            );
            expect(lines.some((l) => l.kind === "added" && l.text.includes("./volumes/pgdata"))).toBe(true);
            expect(typeof body.extractedEnv).toBe("string");
        });

        it.each([
            ["a relative path", "docker-compose.yml"],
            ["a non-compose file", "/etc/passwd"],
            ["a look-alike file name", "/opt/app/my-docker-compose.yml"],
        ])("rejects %s with 400", async (_label, badPath) => {
            const res = await app.inject({
                method: "POST",
                url,
                payload: {composePath: badPath, volumeSelections: [], namedVolumeSelections: {}},
            });

            expect(res.statusCode).toBe(400);
        });

        it("rejects a body without namedVolumeSelections with 400", async () => {
            const res = await app.inject({
                method: "POST",
                url,
                payload: {composePath, volumeSelections: []},
            });

            expect(res.statusCode).toBe(400);
        });
    });
});

