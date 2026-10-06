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

    async function seedVariant(composeContent: string) {
        const prisma = getPrisma();
        const repo = await prisma.templateRepo.create({
            data: {
                url: "https://example.invalid/templates.git",
                isDefault: true,
                headCommitSha: "sha-seed",
                lastSyncAttemptAt: new Date(),
                lastSyncedAt: new Date(),
            },
        });
        const template = await prisma.template.create({
            data: {repoId: repo.id, slug: "nextcloud", name: "Nextcloud", description: "d", category: "c"},
        });
        const variant = await prisma.templateVariant.create({
            data: {
                templateId: template.id,
                slug: "default",
                name: "Default",
                description: "d",
                composeContent,
                contentHash: "hash-seed",
            },
        });
        return {repo, template, variant};
    }

    it("GET /api/templates/variants/:id → 200 with composeContent", async () => {
        const {variant} = await seedVariant("services:\n  app:\n    image: nextcloud:latest\n");

        const res = await app.inject({
            method: "GET",
            url: `/api/templates/variants/${variant.id}`,
            headers: {cookie},
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().composeContent).toBe("services:\n  app:\n    image: nextcloud:latest\n");
    });

    it("GET /api/templates/variants/:id without a session cookie → 401", async () => {
        const {variant} = await seedVariant("services:\n  app:\n    image: nextcloud:latest\n");

        const res = await app.inject({method: "GET", url: `/api/templates/variants/${variant.id}`});

        expect(res.statusCode).toBe(401);
    });

    it("POST /api/templates/variants/:id/stacks with a clean compose → 201, stack row carries templatePath/templateContentHash", async () => {
        const {variant} = await seedVariant("services:\n  app:\n    image: nextcloud:latest\n");

        const res = await app.inject({
            method: "POST",
            url: `/api/templates/variants/${variant.id}/stacks`,
            headers: {cookie},
            payload: {displayName: "My Nextcloud", composeContent: "services:\n  app:\n    image: nextcloud:latest\n"},
        });

        expect(res.statusCode).toBe(201);
        const stackId = res.json().id;
        const stack = await getPrisma().stack.findUniqueOrThrow({where: {id: stackId}});
        expect(stack.templatePath).toBe("nextcloud/default");
        expect(stack.templateContentHash).toBe("hash-seed");
        expect(stack.templateCommitSha).toBe("sha-seed");
        expect(stack.templateRepoUrl).toBe("https://example.invalid/templates.git");
    });

    it("POST /api/templates/variants/:id/stacks with a privileged compose and no confirmed flag → 428", async () => {
        const privilegedCompose = "services:\n  app:\n    image: nextcloud:latest\n    privileged: true\n";
        const {variant} = await seedVariant(privilegedCompose);

        const res = await app.inject({
            method: "POST",
            url: `/api/templates/variants/${variant.id}/stacks`,
            headers: {cookie},
            payload: {displayName: "My Nextcloud", composeContent: privilegedCompose},
        });

        expect(res.statusCode).toBe(428);
    });

    it("POST /api/templates/variants/:id/stacks without a session cookie → 401", async () => {
        const {variant} = await seedVariant("services:\n  app:\n    image: nextcloud:latest\n");

        const res = await app.inject({
            method: "POST",
            url: `/api/templates/variants/${variant.id}/stacks`,
            payload: {displayName: "x", composeContent: "services:\n  app:\n    image: nextcloud:latest\n"},
        });

        expect(res.statusCode).toBe(401);
    });

    it("GET /api/template-repos → 200 with the seeded repo, no sync attempted", async () => {
        const prisma = getPrisma();
        await prisma.templateRepo.create({
            data: {url: "https://example.invalid/templates.git", isDefault: true},
        });

        const res = await app.inject({method: "GET", url: "/api/template-repos", headers: {cookie}});

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body).toHaveLength(1);
        expect(body[0].url).toBe("https://example.invalid/templates.git");
        expect(body[0].lastSyncedAt).toBeNull();
    });

    it("GET /api/template-repos without a session cookie → 401", async () => {
        const res = await app.inject({method: "GET", url: "/api/template-repos"});

        expect(res.statusCode).toBe(401);
    });

    it("POST /api/template-repos with a well-formed https url → 201 (sync attempted and fails since no real git remote exists — row still created)", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/api/template-repos",
            headers: {cookie},
            payload: {url: "https://example.invalid/x.git"},
        });

        expect(res.statusCode).toBe(201);
        const body = res.json();
        expect(body.url).toBe("https://example.invalid/x.git");
        const row = await getPrisma().templateRepo.findUniqueOrThrow({where: {id: body.id}});
        expect(row.url).toBe("https://example.invalid/x.git");
    });

    it.each([["file:///etc"], ["ext::sh -c id"], ["-u"]])(
        "POST /api/template-repos with %s → 400 and no row created (T-12-37)",
        async (url) => {
            const res = await app.inject({
                method: "POST",
                url: "/api/template-repos",
                headers: {cookie},
                payload: {url},
            });

            expect(res.statusCode).toBe(400);
            const rows = await getPrisma().templateRepo.findMany();
            expect(rows).toHaveLength(0);
        },
    );

    it("POST /api/template-repos with an already-configured url → 409", async () => {
        const prisma = getPrisma();
        await prisma.templateRepo.create({data: {url: "https://example.invalid/dup.git"}});

        const res = await app.inject({
            method: "POST",
            url: "/api/template-repos",
            headers: {cookie},
            payload: {url: "https://example.invalid/dup.git"},
        });

        expect(res.statusCode).toBe(409);
        const rows = await getPrisma().templateRepo.findMany({where: {url: "https://example.invalid/dup.git"}});
        expect(rows).toHaveLength(1);
    });

    it("POST /api/template-repos without a session cookie → 401", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/api/template-repos",
            payload: {url: "https://example.invalid/x.git"},
        });

        expect(res.statusCode).toBe(401);
    });

    it("POST /api/template-repos/unknown/sync → 404", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/api/template-repos/unknown-id/sync",
            headers: {cookie},
        });

        expect(res.statusCode).toBe(404);
    });

    it("POST /api/template-repos/:repoId/sync without a session cookie → 401", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/api/template-repos/unknown-id/sync",
        });

        expect(res.statusCode).toBe(401);
    });
});
