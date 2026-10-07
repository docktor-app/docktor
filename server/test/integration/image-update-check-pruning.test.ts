import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it} from "vitest";
import type {FastifyInstance} from "fastify";
import {cleanDatabase, createTestUser, getApp, getPrisma, startContainer, stopContainer} from "./setup.js";

describe("ImageUpdateCheck pruning (Issue #29)", () => {
    let app: FastifyInstance;
    let cookie: string;

    beforeAll(async () => {
        await startContainer();
        app = await getApp();
    }, 60_000);

    afterAll(async () => {
        // try/finally: stopContainer() must run even if cleanDatabase() throws.
        try {
            await cleanDatabase();
        } finally {
            await stopContainer();
        }
    });

    beforeEach(async () => {
        await cleanDatabase();
        const user = await createTestUser();
        cookie = user.cookie;
    });

    afterEach(async () => {
        // Test-owned cleanup: cleanDatabase() does not touch imageUpdateCheck.
        await getPrisma().imageUpdateCheck.deleteMany({});
    });

    async function seedRows(imageRefs: string[]): Promise<void> {
        await getPrisma().imageUpdateCheck.createMany({
            data: imageRefs.map((imageRef) => ({imageRef, lastCheckedAt: new Date(), hasUpdate: false})),
        });
    }

    async function remainingRefs(): Promise<string[]> {
        const rows = await getPrisma().imageUpdateCheck.findMany({select: {imageRef: true}});
        return rows.map((r) => r.imageRef).sort();
    }

    async function createStack(displayName: string, composeContent: string): Promise<string> {
        const res = await app.inject({
            method: "POST",
            url: "/api/stacks",
            headers: {cookie},
            payload: {displayName, composeContent},
        });
        expect(res.statusCode).toBe(201);
        return res.json().id as string;
    }

    const COMPOSE = "services:\n  web:\n    image: nginx:1.27\n  cache:\n    image: docker.io/library/redis:7\n";

    it("prunes only rows no service produces, keeping docker.io/library-prefixed services' normalised refs", async () => {
        const {imageUpdateCheckRepository} = await import("../../src/repositories/index.js");
        await createStack("Prune Stack", COMPOSE);
        await seedRows(["nginx:1.27", "redis:7", "nginx:1.25", "postgres:16"]);

        const tracked = await imageUpdateCheckRepository.findTrackedImageRefs();
        expect([...tracked].sort()).toEqual(["nginx:1.27", "redis:7"]);

        const deleted = await imageUpdateCheckRepository.deleteAllExcept(tracked);

        expect(deleted).toBe(2);
        expect(await remainingRefs()).toEqual(["nginx:1.27", "redis:7"]);
    });

    it("ImageUpdateCheckPruner with production defaults removes a freshly seeded orphan row", async () => {
        const {ImageUpdateCheckPruner} = await import("../../src/jobs/image-update-check-pruner.js");
        await createStack("Prune Stack", COMPOSE);
        await seedRows(["nginx:1.27", "orphan:0.1"]);

        await (new ImageUpdateCheckPruner() as unknown as {run(): Promise<void>}).run();

        expect(await remainingRefs()).toEqual(["nginx:1.27"]);
    });
});
