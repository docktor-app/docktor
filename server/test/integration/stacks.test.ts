import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import {cleanDatabase, createTestUser, getApp, getPrisma, startContainer, stopContainer} from "./setup.js";
import type {FastifyInstance} from "fastify";

describe("Stacks API", () => {
    let app: FastifyInstance;
    let cookie: string;

    beforeAll(async () => {
        await startContainer();
        app = await getApp();
    }, 60_000);

    afterAll(async () => {
        // try/finally: stopContainer() must run even if cleanDatabase() throws
        // (e.g. startContainer() failed partway and left prismaClient unset) —
        // otherwise a failed run strands the testcontainers Postgres container.
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

    const COMPOSE_CONTENT = "services:\n  web:\n    image: nginx:latest\n";

    it("POST /api/stacks → 201", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/api/stacks",
            headers: {cookie},
            payload: {
                displayName: "Test Stack",
                composeContent: COMPOSE_CONTENT,
            },
        });

        expect(res.statusCode).toBe(201);
        const body = res.json();
        expect(body.id).toBe("test-stack");
        expect(body.displayName).toBe("Test Stack");
    });

    it("GET /api/stacks → lists stacks", async () => {
        await app.inject({
            method: "POST",
            url: "/api/stacks",
            headers: {cookie},
            payload: {
                displayName: "Stack One",
                composeContent: COMPOSE_CONTENT,
            },
        });

        const res = await app.inject({
            method: "GET",
            url: "/api/stacks",
            headers: {cookie},
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body).toHaveLength(1);
        expect(body[0].id).toBe("stack-one");
    });

    it("GET /api/stacks carries updateAvailable/latestTag per service from a seeded ImageUpdateCheck row (D-09)", async () => {
        // web:1.25 has a stored row (hasUpdate: true); db:16 has none — the
        // ref must match buildImageRefFromService's tag-qualified spelling
        // (image + ":" + imageTag), not the untagged `image` column, or the
        // web service would never match its own row.
        const composeContent = "services:\n  web:\n    image: nginx:1.25\n  db:\n    image: postgres:16\n";
        const imageRef = "nginx:1.25";

        await getPrisma().imageUpdateCheck.create({
            data: {
                imageRef,
                lastCheckedAt: new Date(),
                latestTag: "9.9.9",
                hasUpdate: true,
            },
        });

        try {
            await app.inject({
                method: "POST",
                url: "/api/stacks",
                headers: {cookie},
                payload: {
                    displayName: "Update Info Stack",
                    composeContent,
                },
            });

            const res = await app.inject({
                method: "GET",
                url: "/api/stacks",
                headers: {cookie},
            });

            expect(res.statusCode).toBe(200);
            const body = res.json();
            const stack = body.find((s: {id: string}) => s.id === "update-info-stack");
            expect(stack).toBeDefined();

            const webService = stack.services.find((s: {serviceName: string}) => s.serviceName === "web");
            const dbService = stack.services.find((s: {serviceName: string}) => s.serviceName === "db");

            expect(webService).toMatchObject({updateAvailable: true, latestTag: "9.9.9"});
            expect(dbService).toMatchObject({updateAvailable: false, latestTag: null});
        } finally {
            // Test-owned cleanup: cleanDatabase() (run in the next test's
            // beforeEach) does not touch imageUpdateCheck, so this row must
            // be removed here or it would leak into every later test run
            // against this same container.
            await getPrisma().imageUpdateCheck.deleteMany({where: {imageRef}});
        }
    });

    it("GET /api/stacks/:id → 404 for missing", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/api/stacks/non-existent",
            headers: {cookie},
        });

        expect(res.statusCode).toBe(404);
    });

    it("PUT /api/stacks/:id → updates metadata", async () => {
        await app.inject({
            method: "POST",
            url: "/api/stacks",
            headers: {cookie},
            payload: {
                displayName: "Update Me",
                composeContent: COMPOSE_CONTENT,
            },
        });

        const res = await app.inject({
            method: "PUT",
            url: "/api/stacks/update-me",
            headers: {cookie},
            payload: {
                displayName: "Updated Name",
                description: "New description",
            },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.displayName).toBe("Updated Name");
        expect(body.description).toBe("New description");
    });

    it("PUT /api/stacks/:id with changed compose and no confirmed flag → 428, file on disk untouched (Issue #18/D-01/D-03)", async () => {
        await app.inject({
            method: "POST",
            url: "/api/stacks",
            headers: {cookie},
            payload: {
                displayName: "Review Me",
                composeContent: COMPOSE_CONTENT,
            },
        });

        const res = await app.inject({
            method: "PUT",
            url: "/api/stacks/review-me",
            headers: {cookie},
            payload: {
                composeContent: "services:\n  web:\n    image: nginx:1.27\n",
            },
        });

        expect(res.statusCode).toBe(428);

        const composeRes = await app.inject({
            method: "GET",
            url: "/api/stacks/review-me/compose",
            headers: {cookie},
        });
        expect(composeRes.json().content).toBe(COMPOSE_CONTENT);
    });

    it("PUT /api/stacks/:id with changed compose and confirmed: true → 200, writes the new content", async () => {
        await app.inject({
            method: "POST",
            url: "/api/stacks",
            headers: {cookie},
            payload: {
                displayName: "Confirm Me",
                composeContent: COMPOSE_CONTENT,
            },
        });

        const newContent = "services:\n  web:\n    image: nginx:1.27\n";
        const res = await app.inject({
            method: "PUT",
            url: "/api/stacks/confirm-me",
            headers: {cookie},
            payload: {
                composeContent: newContent,
                confirmed: true,
            },
        });

        expect(res.statusCode).toBe(200);

        const composeRes = await app.inject({
            method: "GET",
            url: "/api/stacks/confirm-me/compose",
            headers: {cookie},
        });
        expect(composeRes.json().content).toBe(newContent);
    });

    it("POST /api/stacks/:id/preview → 200 with hasChanges: true and a non-empty compose.hunks, writes nothing", async () => {
        await app.inject({
            method: "POST",
            url: "/api/stacks",
            headers: {cookie},
            payload: {
                displayName: "Preview Me",
                composeContent: COMPOSE_CONTENT,
            },
        });

        const res = await app.inject({
            method: "POST",
            url: "/api/stacks/preview-me/preview",
            headers: {cookie},
            payload: {
                composeContent: "services:\n  web:\n    image: nginx:1.27\n",
            },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.hasChanges).toBe(true);
        expect(body.confirmationRequired).toBe(true);
        expect(body.compose.hunks.length).toBeGreaterThan(0);

        const composeRes = await app.inject({
            method: "GET",
            url: "/api/stacks/preview-me/compose",
            headers: {cookie},
        });
        expect(composeRes.json().content).toBe(COMPOSE_CONTENT);
    });

    it("POST /api/stacks/preview → 200 {confirmationRequired, findings}, writes nothing", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/api/stacks/preview",
            headers: {cookie},
            payload: {
                displayName: "Preview New Stack",
                composeContent: "services:\n  web:\n    image: nginx:latest\n    privileged: true\n",
            },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.confirmationRequired).toBe(true);
        expect(body.findings).toHaveLength(1);
        expect(body.findings[0]).toMatchObject({ruleId: "privileged", introduced: true});

        const getRes = await app.inject({
            method: "GET",
            url: "/api/stacks",
            headers: {cookie},
        });
        expect(getRes.json()).toHaveLength(0);
    });

    it("POST /api/stacks with a privileged compose and no confirmed flag → 428, and GET /api/stacks lists nothing (Issue #20/D-02/T-12-20)", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/api/stacks",
            headers: {cookie},
            payload: {
                displayName: "Dangerous New Stack",
                composeContent: "services:\n  web:\n    image: nginx:latest\n    privileged: true\n",
            },
        });

        expect(res.statusCode).toBe(428);

        const getRes = await app.inject({
            method: "GET",
            url: "/api/stacks",
            headers: {cookie},
        });
        expect(getRes.json()).toHaveLength(0);
    });

    it("POST /api/stacks with a privileged compose and confirmed: true → 201 (Issue #20/D-02/T-12-20)", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/api/stacks",
            headers: {cookie},
            payload: {
                displayName: "Confirmed Dangerous Stack",
                composeContent: "services:\n  web:\n    image: nginx:latest\n    privileged: true\n",
                confirmed: true,
            },
        });

        expect(res.statusCode).toBe(201);
        expect(res.json().id).toBe("confirmed-dangerous-stack");
    });

    it("DELETE /api/stacks/:id → 204", async () => {
        await app.inject({
            method: "POST",
            url: "/api/stacks",
            headers: {cookie},
            payload: {
                displayName: "Delete Me",
                composeContent: COMPOSE_CONTENT,
            },
        });

        const res = await app.inject({
            method: "DELETE",
            url: "/api/stacks/delete-me",
            headers: {cookie},
        });

        expect(res.statusCode).toBe(204);

        const getRes = await app.inject({
            method: "GET",
            url: "/api/stacks/delete-me",
            headers: {cookie},
        });
        expect(getRes.statusCode).toBe(404);
    });

    it("returns 401 without authentication", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/api/stacks",
        });

        expect(res.statusCode).toBe(401);
    });
});
