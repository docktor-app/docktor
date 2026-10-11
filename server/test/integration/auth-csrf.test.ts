import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import type {FastifyInstance} from "fastify";
import {
    cleanDatabase,
    createTestUser,
    getApp,
    startContainer,
    stopContainer,
    TEST_ORIGIN,
} from "./setup.js";

// #46 / D-14: cross-origin state changes are refused, with the user's session
// cookie attached. Fastify routes are guarded by lib/origin-guard.ts,
// /api/auth/* by better-auth's own origin check (kept on under NODE_ENV=test
// by `advanced.disableOriginCheck: false`). Requests that carry neither Origin
// nor Sec-Fetch-Site (curl, scripts, the other suites) must keep working.

const HOSTILE_ORIGIN = "https://evil.example";
const CROSS_ORIGIN_BODY = {error: "Cross-origin request blocked", code: "CROSS_ORIGIN_REQUEST_REJECTED"};

describe("CSRF protection (#46)", () => {
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
        cookie = (await createTestUser()).cookie;
    });

    function deployUnknownStack(headers: Record<string, string>) {
        return app.inject({
            method: "POST",
            url: "/api/stacks/does-not-exist/deploy",
            headers: {cookie, ...headers},
        });
    }

    describe("Fastify routes (Origin guard)", () => {
        it("refuses a state-changing request from a hostile origin before the route runs", async () => {
            const res = await deployUnknownStack({origin: HOSTILE_ORIGIN});

            expect(res.statusCode).toBe(403);
            expect(res.json()).toEqual(CROSS_ORIGIN_BODY);
        });

        it("lets the same request through from the trusted origin (the route's own 404 for an unknown stack)", async () => {
            const res = await deployUnknownStack({origin: TEST_ORIGIN});

            expect(res.statusCode).not.toBe(403);
            expect(res.statusCode).toBe(404);
        });

        it("lets a request with no Origin and no Sec-Fetch-Site through (curl, scripts)", async () => {
            const res = await deployUnknownStack({});

            expect(res.statusCode).not.toBe(403);
            expect(res.statusCode).toBe(404);
        });

        it("refuses a same-site request that carries no Origin header", async () => {
            const res = await deployUnknownStack({"sec-fetch-site": "same-site"});

            expect(res.statusCode).toBe(403);
            expect(res.json()).toEqual(CROSS_ORIGIN_BODY);
        });

        it("lets a same-origin browser request without an Origin header through", async () => {
            const res = await deployUnknownStack({"sec-fetch-site": "same-origin"});

            expect(res.statusCode).toBe(404);
        });

        it("refuses a hostile PUT to the settings route", async () => {
            const res = await app.inject({
                method: "PUT",
                url: "/api/settings/general",
                headers: {cookie, origin: HOSTILE_ORIGIN},
                payload: {instanceName: "Pwned"},
            });

            expect(res.statusCode).toBe(403);
            expect(res.json()).toEqual(CROSS_ORIGIN_BODY);
        });

        it("does not touch the data when a hostile request is refused", async () => {
            await app.inject({
                method: "PUT",
                url: "/api/settings/general",
                headers: {cookie, origin: HOSTILE_ORIGIN},
                payload: {instanceName: "Pwned"},
            });

            const res = await app.inject({method: "GET", url: "/api/settings/general", headers: {cookie}});

            expect(res.statusCode).toBe(200);
            expect(res.json()).not.toMatchObject({instanceName: "Pwned"});
        });

        it("refuses a hostile origin even without a session (no work is done for it)", async () => {
            const res = await app.inject({
                method: "POST",
                url: "/api/stacks/does-not-exist/deploy",
                headers: {origin: HOSTILE_ORIGIN},
            });

            expect(res.statusCode).toBe(403);
        });

        it("never blocks reads, whatever the origin", async () => {
            const res = await app.inject({
                method: "GET",
                url: "/api/stacks",
                headers: {cookie, origin: HOSTILE_ORIGIN},
            });

            expect(res.statusCode).toBe(200);
        });
    });

    describe("better-auth routes (built-in origin check)", () => {
        it.each(["/api/auth/sign-out", "/api/auth/two-factor/disable"])(
            "refuses a cookie-bearing POST to %s from a hostile origin",
            async (url) => {
                const res = await app.inject({
                    method: "POST",
                    url,
                    headers: {cookie, origin: HOSTILE_ORIGIN},
                    payload: {password: "TestPassword123!"},
                });

                expect(res.statusCode).toBe(403);
            },
        );

        it("keeps the session alive after a refused cross-origin sign-out", async () => {
            await app.inject({
                method: "POST",
                url: "/api/auth/sign-out",
                headers: {cookie, origin: HOSTILE_ORIGIN},
                payload: {},
            });

            const res = await app.inject({method: "GET", url: "/api/stacks", headers: {cookie}});

            expect(res.statusCode).toBe(200);
        });
    });
});
