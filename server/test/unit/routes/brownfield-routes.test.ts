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

// The preview now runs the same eligibility checks as migrate (G-18-7); give it
// a record store with nothing in it and a self-stack lookup that finds nothing.
vi.mock("../../../src/repositories/stack-repository.js", () => ({
    StackRepository: class {},
    stackRepository: {
        exists: vi.fn(async () => false),
        listLocations: vi.fn(async () => []),
    },
}));

vi.mock("../../../src/infrastructure/docker-self-stack.js", () => ({
    dockerSelfStack: {composeFilePaths: vi.fn(async () => [])},
}));

import Fastify from "fastify";
import {serializerCompiler, validatorCompiler, type ZodTypeProvider} from "fastify-type-provider-zod";
import importRoutes from "../../../src/routes/imports.js";
import setupRoutes from "../../../src/routes/setup.js";
import {migrationService} from "../../../src/application/migration-service.js";

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
    await app.register(setupRoutes);
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
        vi.restoreAllMocks();
        onboardingFake.adoptInPlace.mockReset();
        onboardingFake.isWizardComplete.mockReset();
        onboardingFake.isWizardComplete.mockResolvedValue(false);
        onboardingFake.hasAnyUser.mockReset();
        onboardingFake.hasAnyUser.mockResolvedValue(true);
        await app.close();
        await fs.rm(tmpDir, {recursive: true, force: true});
    });

    describe("POST /api/stacks/import/migrate/preview (MIG-02)", () => {
        const url = "/api/stacks/import/migrate/preview";

        it("returns a real UnifiedDiff computed from the compose file", async () => {
            const res = await app.inject({
                method: "POST",
                url,
                payload: {composePath, displayName: "My App", volumeSelections: [], namedVolumeSelections: {pgdata: true}},
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
            expect(body.target.stackId).toBe("my-app");
            expect(body.target.inPlace).toBe(false);
        });

        it("rejects a body without displayName with 400", async () => {
            const res = await app.inject({
                method: "POST",
                url,
                payload: {composePath, volumeSelections: [], namedVolumeSelections: {pgdata: true}},
            });

            expect(res.statusCode).toBe(400);
        });

        it.each([
            ["a relative path", "docker-compose.yml"],
            ["a non-compose file", "/etc/passwd"],
            ["a look-alike file name", "/opt/app/my-docker-compose.yml"],
        ])("rejects %s with 400", async (_label, badPath) => {
            const res = await app.inject({
                method: "POST",
                url,
                payload: {composePath: badPath, displayName: "My App", volumeSelections: [], namedVolumeSelections: {}},
            });

            expect(res.statusCode).toBe(400);
        });

        it("rejects a body without namedVolumeSelections with 400", async () => {
            const res = await app.inject({
                method: "POST",
                url,
                payload: {composePath, displayName: "My App", volumeSelections: []},
            });

            expect(res.statusCode).toBe(400);
        });
    });

    describe("POST /api/setup/migrate/preview", () => {
        it("returns a UnifiedDiff-shaped diff", async () => {
            const res = await app.inject({
                method: "POST",
                url: "/api/setup/migrate/preview",
                payload: {composePath, displayName: "My App", volumeSelections: [], namedVolumeSelections: {pgdata: true}},
            });

            expect(res.statusCode).toBe(200);
            const body = res.json();
            expect(body.diff.hunks.length).toBeGreaterThan(0);
            expect(typeof body.diff.added).toBe("number");
            expect(typeof body.diff.removed).toBe("number");
            expect(body.target.stackId).toBe("my-app");
        });

        it("rejects a body without displayName with 400", async () => {
            const res = await app.inject({
                method: "POST",
                url: "/api/setup/migrate/preview",
                payload: {composePath, volumeSelections: [], namedVolumeSelections: {pgdata: true}},
            });

            expect(res.statusCode).toBe(400);
        });

        it("answers 410 once the wizard is complete (T-05-09 gate unchanged)", async () => {
            onboardingFake.isWizardComplete.mockResolvedValue(true);

            const res = await app.inject({
                method: "POST",
                url: "/api/setup/migrate/preview",
                payload: {composePath, displayName: "My App", volumeSelections: [], namedVolumeSelections: {}},
            });

            expect(res.statusCode).toBe(410);
        });
    });

    describe.each([
        ["/api/setup/migrate/preview", "previewMigration"],
        ["/api/setup/migrate", "migrate"],
    ] as const)("POST %s before an admin account exists (WR-03)", (url, method) => {
        function payload() {
            return {
                composePath,
                displayName: "My App",
                volumeSelections: [],
                namedVolumeSelections: {},
                backup: true,
                stopOldStack: true,
            };
        }

        it("answers 400 and never reaches MigrationService", async () => {
            onboardingFake.hasAnyUser.mockResolvedValue(false);
            const spy = vi.spyOn(migrationService, method).mockRejectedValue(new Error("must not be called"));

            const res = await app.inject({method: "POST", url, payload: payload()});

            expect(res.statusCode).toBe(400);
            expect(spy).not.toHaveBeenCalled();
        });

        it("still answers 410 first once the wizard is complete", async () => {
            onboardingFake.hasAnyUser.mockResolvedValue(false);
            onboardingFake.isWizardComplete.mockResolvedValue(true);

            const res = await app.inject({method: "POST", url, payload: payload()});

            expect(res.statusCode).toBe(410);
        });
    });

    it("leaves the /api/stacks/import/migrate/preview route unaffected by the admin-account guard", async () => {
        onboardingFake.hasAnyUser.mockResolvedValue(false);

        const res = await app.inject({
            method: "POST",
            url: "/api/stacks/import/migrate/preview",
            payload: {composePath, displayName: "My App", volumeSelections: [], namedVolumeSelections: {pgdata: true}},
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().diff.hunks.length).toBeGreaterThan(0);
    });

    describe.each(["/api/stacks/import/adopt", "/api/setup/adopt"])("POST %s", (url) => {
        it("delegates to onboardingService.adoptInPlace and returns its value", async () => {
            onboardingFake.adoptInPlace.mockResolvedValue({stackId: "my-app"});

            const res = await app.inject({method: "POST", url, payload: {composePath, displayName: "My App"}});

            expect(res.statusCode).toBe(200);
            expect(onboardingFake.adoptInPlace).toHaveBeenCalledWith(composePath, "My App");
            expect(res.json()).toEqual({stackId: "my-app"});
        });

        it("rejects a non-compose path with 400 and never adopts", async () => {
            const res = await app.inject({
                method: "POST",
                url,
                payload: {composePath: "/etc/passwd", displayName: "My App"},
            });

            expect(res.statusCode).toBe(400);
            expect(onboardingFake.adoptInPlace).not.toHaveBeenCalled();
        });

        it("rejects an empty displayName with 400", async () => {
            const res = await app.inject({method: "POST", url, payload: {composePath, displayName: ""}});

            expect(res.statusCode).toBe(400);
            expect(onboardingFake.adoptInPlace).not.toHaveBeenCalled();
        });
    });

    describe.each(["/api/stacks/import/migrate", "/api/setup/migrate"])("POST %s", (url) => {
        it("passes the validated body to migrationService.migrate with a Map for named volumes", async () => {
            const resolved = {success: true, stackId: "my-app", originalPath: "/opt/app"};
            const spy = vi.spyOn(migrationService, "migrate").mockResolvedValue(resolved);
            const volumeSelections = [{originalPath: "/srv/data", newPath: "./volumes/data", convert: true}];

            const res = await app.inject({
                method: "POST",
                url,
                payload: {
                    composePath,
                    displayName: "My App",
                    volumeSelections,
                    namedVolumeSelections: {pgdata: true},
                    backup: true,
                    stopOldStack: false,
                },
            });

            expect(res.statusCode).toBe(200);
            expect(spy).toHaveBeenCalledTimes(1);
            const input = spy.mock.calls[0]?.[0];
            expect(input?.composePath).toBe(composePath);
            expect(input?.displayName).toBe("My App");
            expect(input?.volumeSelections).toEqual(volumeSelections);
            expect(input?.namedVolumeSelections).toBeInstanceOf(Map);
            expect([...(input?.namedVolumeSelections ?? [])]).toEqual([["pgdata", true]]);
            expect(input?.backup).toBe(true);
            expect(input?.stopOldStack).toBe(false);
            expect(res.json()).toEqual(resolved);
        });

        it.each([
            ["backup", {stopOldStack: true}],
            ["stopOldStack", {backup: true}],
        ])("rejects a body without %s with 400 and never migrates (D-12)", async (_missing, flags) => {
            const spy = vi.spyOn(migrationService, "migrate").mockResolvedValue({
                success: true,
                originalPath: "/unused",
            });

            const res = await app.inject({
                method: "POST",
                url,
                payload: {
                    composePath,
                    displayName: "My App",
                    volumeSelections: [],
                    namedVolumeSelections: {},
                    ...flags,
                },
            });

            expect(res.statusCode).toBe(400);
            expect(spy).not.toHaveBeenCalled();
        });

        it("rejects a non-compose path with 400 and never migrates", async () => {
            // Resolved stub so a validation regression can never reach the real migration.
            const spy = vi.spyOn(migrationService, "migrate").mockResolvedValue({
                success: true,
                originalPath: "/unused",
            });

            const res = await app.inject({
                method: "POST",
                url,
                payload: {
                    composePath: "/etc/passwd",
                    displayName: "My App",
                    volumeSelections: [],
                    namedVolumeSelections: {},
                    backup: true,
                    stopOldStack: true,
                },
            });

            expect(res.statusCode).toBe(400);
            expect(spy).not.toHaveBeenCalled();
        });
    });
});
