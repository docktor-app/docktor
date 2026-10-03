import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import {cleanDatabase, createTestUser, getApp, getPrisma, startContainer, stopContainer} from "./setup.js";
import type {FastifyInstance} from "fastify";

// Issue #19: DOCKTOR_DEFAULT_TEMPLATE_REPO_URL="" must be set before the app
// is built so GET /api/templates never attempts a real outbound git clone
// in this suite — every template row here is seeded directly via Prisma.
process.env.DOCKTOR_DEFAULT_TEMPLATE_REPO_URL = "";

describe("Templates API", () => {
    let app: FastifyInstance;
    let cookie: string;

    beforeAll(async () => {
        await startContainer();
        app = await getApp();
    }, 60_000);

    afterAll(async () => {
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

    it("GET /api/templates → 200 with the seeded template and variant summaries (no composeContent in the list)", async () => {
        const prisma = getPrisma();
        const repo = await prisma.templateRepo.create({
            data: {
                url: "https://example.invalid/templates.git",
                isDefault: true,
                lastSyncAttemptAt: new Date(),
                lastSyncedAt: new Date(),
            },
        });
        const template = await prisma.template.create({
            data: {
                repoId: repo.id,
                slug: "nextcloud",
                name: "Nextcloud",
                description: "A file sync server",
                category: "productivity",
            },
        });
        await prisma.templateVariant.create({
            data: {
                templateId: template.id,
                slug: "default",
                name: "Default",
                description: "Nextcloud with SQLite",
                composeContent: "services:\n  app:\n    image: nextcloud:latest\n",
                contentHash: "hash1",
            },
        });

        const res = await app.inject({
            method: "GET",
            url: "/api/templates",
            headers: {cookie},
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.repos).toHaveLength(1);
        expect(body.repos[0].url).toBe("https://example.invalid/templates.git");
        expect(body.templates).toHaveLength(1);
        expect(body.templates[0].slug).toBe("nextcloud");
        expect(body.templates[0].variants).toHaveLength(1);
        expect(body.templates[0].variants[0].slug).toBe("default");
        expect(body.templates[0].variants[0].composeContent).toBeUndefined();
    });

    it("GET /api/templates without a session cookie → 401", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/api/templates",
        });

        expect(res.statusCode).toBe(401);
    });
});
