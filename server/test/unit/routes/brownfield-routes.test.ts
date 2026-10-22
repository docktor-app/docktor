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

// The preview resolves the old compose project (#102); no Docker daemon is involved here, so the
// project is the one predicted from the files and no container runs.
vi.mock("../../../src/infrastructure/compose-project-resolver.js", () => ({
    composeProjectResolver: {
        resolve: vi.fn(async () => ({
            kind: "resolved",
            project: {name: "docktor-brownfield-routes", source: "files", containers: []},
        })),
        listContainers: vi.fn(async () => []),
    },
}));

// The preview checks the Docker volumes it would copy (#101); no Docker daemon is involved here.
vi.mock("../../../src/infrastructure/volume-migrator.js", () => ({
    volumeMigrator: {volumeExists: vi.fn(async () => true)},
}));

import Fastify from "fastify";
import {serializerCompiler, validatorCompiler, type ZodTypeProvider} from "fastify-type-provider-zod";
import importRoutes from "../../../src/routes/imports.js";
import setupRoutes from "../../../src/routes/setup.js";
import {migrationService, type MigrationPlan} from "../../../src/application/migration-service.js";
import {requireAuth} from "../../../src/lib/auth-middleware.js";
import {ConflictError, UnauthorizedError} from "../../../src/lib/errors.js";

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
        vi.mocked(requireAuth).mockClear();
        onboardingFake.scan.mockReset();
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
        ["/api/setup/migrate", "preflight"],
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

    describe("setup brownfield routes without a session (WR-02)", () => {
        const composeBody = () => ({
            composePath,
            displayName: "My App",
            volumeSelections: [],
            namedVolumeSelections: {},
            backup: true,
            stopOldStack: true,
        });

        it.each([
            ["POST", "/api/setup/scan", () => ({directories: [tmpDir]})],
            ["POST", "/api/setup/adopt", () => ({composePath, displayName: "My App"})],
            ["POST", "/api/setup/migrate/preview", composeBody],
            ["POST", "/api/setup/migrate", composeBody],
            ["GET", "/api/setup/migrations", () => undefined],
            ["GET", "/api/setup/migrations/some-id", () => undefined],
        ] as const)("%s %s answers 401 and does no work", async (method, url, payload) => {
            vi.mocked(requireAuth).mockRejectedValueOnce(new UnauthorizedError());

            const res = await app.inject({method, url, payload: payload()});

            expect(res.statusCode).toBe(401);
            expect(onboardingFake.scan).not.toHaveBeenCalled();
            expect(onboardingFake.adoptInPlace).not.toHaveBeenCalled();
        });

        it("answers 400 before an admin exists without consulting the session", async () => {
            onboardingFake.hasAnyUser.mockResolvedValue(false);

            const res = await app.inject({method: "POST", url: "/api/setup/scan", payload: {directories: [tmpDir]}});

            expect(res.statusCode).toBe(400);
            expect(requireAuth).not.toHaveBeenCalled();
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

    describe.each([
        ["/api/stacks/import/migrate", "/api/stacks/import/migrations"],
        ["/api/setup/migrate", "/api/setup/migrations"],
    ] as const)("POST %s", (url, operationsUrl) => {
        function payload(overrides: Record<string, unknown> = {}) {
            return {
                composePath,
                displayName: "My App",
                volumeSelections: [],
                namedVolumeSelections: {},
                backup: true,
                stopOldStack: false,
                ...overrides,
            };
        }

        function planFor(stackId: string): MigrationPlan {
            return {
                stackId,
                displayName: "My App",
                composePath,
                originalDir: "/opt/app",
                targetDir: "/data/stacks/my-app",
                volumeSelections: [],
                namedVolumeSelections: new Map(),
                backup: true,
                stopOldStack: false,
                inPlace: null,
            };
        }

        async function finishedOperation(id: string) {
            let body: Record<string, unknown> = {};
            await vi.waitFor(async () => {
                const res = await app.inject({method: "GET", url: `${operationsUrl}/${id}`});
                expect(res.statusCode).toBe(200);
                body = res.json();
                expect(body.status).not.toBe("running");
            });
            return body;
        }

        it("answers 202 with a running operation and hands the validated body to preflight with a Map for named volumes", async () => {
            const resolved = {success: true, stackId: "my-app", originalPath: "/opt/app"};
            const preflight = vi.spyOn(migrationService, "preflight").mockResolvedValue(planFor("my-app"));
            vi.spyOn(migrationService, "execute").mockResolvedValue(resolved);
            const volumeSelections = [{originalPath: "/srv/data", newPath: "./volumes/data", convert: true}];

            const res = await app.inject({
                method: "POST",
                url,
                payload: payload({volumeSelections, namedVolumeSelections: {pgdata: true}}),
            });

            expect(res.statusCode).toBe(202);
            const body = res.json();
            expect(typeof body.id).toBe("string");
            expect(body).toMatchObject({
                stackId: "my-app",
                displayName: "My App",
                composePath,
                backup: true,
                stopOldStack: false,
                status: "running",
                result: null,
            });
            expect(preflight).toHaveBeenCalledTimes(1);
            const input = preflight.mock.calls[0]?.[0];
            expect(input?.composePath).toBe(composePath);
            expect(input?.displayName).toBe("My App");
            expect(input?.volumeSelections).toEqual(volumeSelections);
            expect(input?.namedVolumeSelections).toBeInstanceOf(Map);
            expect([...(input?.namedVolumeSelections ?? [])]).toEqual([["pgdata", true]]);
            expect(input?.backup).toBe(true);
            expect(input?.stopOldStack).toBe(false);
            await finishedOperation(body.id);
        });

        it("makes the final result readable by id once the background run ends", async () => {
            vi.spyOn(migrationService, "preflight").mockResolvedValue(planFor("my-app"));
            vi.spyOn(migrationService, "execute").mockResolvedValue({
                success: true,
                stackId: "my-app",
                originalPath: "/opt/app",
            });

            const started = await app.inject({method: "POST", url, payload: payload()});
            const finished = await finishedOperation(started.json().id);

            expect(finished.status).toBe("succeeded");
            expect(finished.step).toBe("finished");
            expect(finished.result).toEqual({success: true, stackId: "my-app", originalPath: "/opt/app"});
            expect(typeof finished.finishedAt).toBe("string");
        });

        it("ends as failed with the migration error when execute reports a failure", async () => {
            vi.spyOn(migrationService, "preflight").mockResolvedValue(planFor("my-app"));
            vi.spyOn(migrationService, "execute").mockResolvedValue({
                success: false,
                error: "Migration failed: boom.",
                originalPath: "/opt/app",
            });

            const started = await app.inject({method: "POST", url, payload: payload()});
            const finished = await finishedOperation(started.json().id);

            expect(finished.status).toBe("failed");
            expect(finished.result).toMatchObject({success: false, error: "Migration failed: boom."});
        });

        it("answers 409 for a preflight conflict and creates no operation", async () => {
            vi.spyOn(migrationService, "preflight").mockRejectedValue(new ConflictError("Stack already exists"));
            const execute = vi.spyOn(migrationService, "execute");

            const res = await app.inject({method: "POST", url, payload: payload()});

            expect(res.statusCode).toBe(409);
            expect(execute).not.toHaveBeenCalled();
            const lookup = await app.inject({method: "GET", url: `${operationsUrl}/unknown-id`});
            expect(lookup.statusCode).toBe(404);
        });

        it.each([
            ["backup", {stopOldStack: true}],
            ["stopOldStack", {backup: true}],
        ])("rejects a body without %s with 400 and never runs preflight (D-12)", async (_missing, flags) => {
            const preflight = vi.spyOn(migrationService, "preflight").mockResolvedValue(planFor("my-app"));

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
            expect(preflight).not.toHaveBeenCalled();
        });

        it("rejects a non-compose path with 400 and never runs preflight", async () => {
            const preflight = vi.spyOn(migrationService, "preflight").mockResolvedValue(planFor("my-app"));

            const res = await app.inject({
                method: "POST",
                url,
                payload: payload({composePath: "/etc/passwd", stopOldStack: true}),
            });

            expect(res.statusCode).toBe(400);
            expect(preflight).not.toHaveBeenCalled();
        });
    });

    describe("migration operation lists", () => {
        function startPayload(displayName: string) {
            return {
                composePath,
                displayName,
                volumeSelections: [],
                namedVolumeSelections: {},
                backup: true,
                stopOldStack: false,
            };
        }

        function stubMigration(stackId: string): void {
            vi.spyOn(migrationService, "preflight").mockResolvedValue({
                stackId,
                displayName: stackId,
                composePath,
                originalDir: "/opt/app",
                targetDir: "/data/stacks/new",
                volumeSelections: [],
                namedVolumeSelections: new Map(),
                backup: true,
                stopOldStack: false,
                inPlace: null,
            });
            vi.spyOn(migrationService, "execute").mockResolvedValue({
                success: true,
                stackId,
                originalPath: "/opt/app",
            });
        }

        it.each(["/api/stacks/import/migrations", "/api/setup/migrations"])(
            "GET %s lists an operation started through either route family",
            async (listUrl) => {
                stubMigration("listed-app");
                const startUrl =
                    listUrl === "/api/setup/migrations" ? "/api/stacks/import/migrate" : "/api/setup/migrate";
                const started = await app.inject({
                    method: "POST",
                    url: startUrl,
                    payload: startPayload("Listed App"),
                });
                const {id} = started.json();
                await vi.waitFor(async () => {
                    const one = await app.inject({method: "GET", url: `${listUrl}/${id}`});
                    expect(one.json().status).toBe("succeeded");
                });

                const res = await app.inject({method: "GET", url: listUrl});

                expect(res.statusCode).toBe(200);
                const ids: string[] = res.json().operations.map((operation: {id: string}) => operation.id);
                expect(ids).toContain(id);
            },
        );

        it.each(["/api/setup/migrations", "/api/setup/migrations/some-id"])(
            "GET %s answers 400 before an admin account exists (18-07 guard)",
            async (url) => {
                onboardingFake.hasAnyUser.mockResolvedValue(false);

                const res = await app.inject({method: "GET", url});

                expect(res.statusCode).toBe(400);
            },
        );

        it.each(["/api/setup/migrations", "/api/setup/migrations/some-id"])(
            "GET %s answers 410 once the wizard is complete",
            async (url) => {
                onboardingFake.isWizardComplete.mockResolvedValue(true);

                const res = await app.inject({method: "GET", url});

                expect(res.statusCode).toBe(410);
            },
        );

        it("leaves the import operation routes unaffected by both setup gates", async () => {
            onboardingFake.hasAnyUser.mockResolvedValue(false);
            onboardingFake.isWizardComplete.mockResolvedValue(true);

            const res = await app.inject({method: "GET", url: "/api/stacks/import/migrations"});

            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.json().operations)).toBe(true);
        });
    });
});
