import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import {cleanDatabase, createTestUser, getApp, startContainer, stopContainer} from "./setup.js";
import type {FastifyInstance} from "fastify";

describe("Compose Checks Settings API (Issue #20/D-04/D-10, plan 12-05 Task 2)", () => {
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

    const COMPOSE_CONTENT = "services:\n  web:\n    image: nginx:latest\n";

    it("GET /api/settings/compose-checks → defaults", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/api/settings/compose-checks",
            headers: {cookie},
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({
            skipReview: false,
            checks: {namedVolume: true, inlineEnv: true, missingEnvFile: true},
        });
    });

    it("PUT /api/settings/compose-checks with a valid body → 200 and a following GET reflects it", async () => {
        const putRes = await app.inject({
            method: "PUT",
            url: "/api/settings/compose-checks",
            headers: {cookie},
            payload: {
                skipReview: true,
                checks: {namedVolume: false, inlineEnv: true, missingEnvFile: false},
            },
        });

        expect(putRes.statusCode).toBe(200);

        const getRes = await app.inject({
            method: "GET",
            url: "/api/settings/compose-checks",
            headers: {cookie},
        });
        expect(getRes.json()).toEqual({
            skipReview: true,
            checks: {namedVolume: false, inlineEnv: true, missingEnvFile: false},
        });
    });

    it("PUT with an extra 'privileged' key under checks is rejected or ignored such that GET never contains it", async () => {
        const putRes = await app.inject({
            method: "PUT",
            url: "/api/settings/compose-checks",
            headers: {cookie},
            payload: {
                skipReview: false,
                checks: {namedVolume: true, inlineEnv: true, missingEnvFile: true, privileged: false},
            },
        });

        // Zod's default strip-unknown-keys behavior: the extra key is
        // dropped, not rejected — assert on the observable contract (GET
        // never reflects a privileged key) rather than the specific status
        // code, since either "ignored" or "rejected" satisfies #20/D-11's
        // prohibition on a privileged toggle existing at all.
        if (putRes.statusCode === 200) {
            const getRes = await app.inject({
                method: "GET",
                url: "/api/settings/compose-checks",
                headers: {cookie},
            });
            expect(getRes.json().checks).not.toHaveProperty("privileged");
        } else {
            expect(putRes.statusCode).toBe(400);
        }
    });

    it("PUT with a malformed body → 400", async () => {
        const res = await app.inject({
            method: "PUT",
            url: "/api/settings/compose-checks",
            headers: {cookie},
            payload: {skipReview: "not-a-boolean", checks: {}},
        });

        expect(res.statusCode).toBe(400);
    });

    it("GET without a session cookie → 401", async () => {
        const res = await app.inject({method: "GET", url: "/api/settings/compose-checks"});

        expect(res.statusCode).toBe(401);
    });

    it("PUT without a session cookie → 401", async () => {
        const res = await app.inject({
            method: "PUT",
            url: "/api/settings/compose-checks",
            payload: {skipReview: false, checks: {namedVolume: true, inlineEnv: true, missingEnvFile: true}},
        });

        expect(res.statusCode).toBe(401);
    });

    it("with skipReview true, PUT /api/stacks/:id with a benign compose change and no confirmed flag → 200", async () => {
        await app.inject({
            method: "PUT",
            url: "/api/settings/compose-checks",
            headers: {cookie},
            payload: {skipReview: true, checks: {namedVolume: true, inlineEnv: true, missingEnvFile: true}},
        });
        await app.inject({
            method: "POST",
            url: "/api/stacks",
            headers: {cookie},
            payload: {displayName: "Skip Review Benign", composeContent: COMPOSE_CONTENT},
        });

        const res = await app.inject({
            method: "PUT",
            url: "/api/stacks/skip-review-benign",
            headers: {cookie},
            payload: {composeContent: "services:\n  web:\n    image: nginx:1.27\n"},
        });

        expect(res.statusCode).toBe(200);
    });

    it("with skipReview true, PUT /api/stacks/:id with a change adding privileged: true and no confirmed flag → 428", async () => {
        await app.inject({
            method: "PUT",
            url: "/api/settings/compose-checks",
            headers: {cookie},
            payload: {skipReview: true, checks: {namedVolume: true, inlineEnv: true, missingEnvFile: true}},
        });
        await app.inject({
            method: "POST",
            url: "/api/stacks",
            headers: {cookie},
            payload: {displayName: "Skip Review Dangerous", composeContent: COMPOSE_CONTENT},
        });

        const res = await app.inject({
            method: "PUT",
            url: "/api/stacks/skip-review-dangerous",
            headers: {cookie},
            payload: {
                composeContent: "services:\n  web:\n    image: nginx:latest\n    privileged: true\n",
            },
        });

        expect(res.statusCode).toBe(428);
    });
});
