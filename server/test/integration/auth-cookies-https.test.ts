import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import type {FastifyInstance} from "fastify";
import {cleanDatabase, getApp, getSetCookies, startContainer, stopContainer} from "./setup.js";

// D-15: with an https BETTER_AUTH_URL the session cookie is Secure and carries
// the __Secure- name prefix. better-auth reads the URL when lib/auth.ts is first
// imported, i.e. before any beforeAll runs, so it has to be set while the
// hoisted code executes. It is removed again in afterAll.
vi.hoisted(() => {
    process.env.BETTER_AUTH_URL = "https://docktor.example.test";
});

describe("Auth cookie attributes over https (#46)", () => {
    let app: FastifyInstance;

    beforeAll(async () => {
        await startContainer();
        app = await getApp();
    }, 60_000);

    afterAll(async () => {
        delete process.env.BETTER_AUTH_URL;
        // try/finally: stopContainer() must run even if cleanDatabase() throws.
        try {
            await cleanDatabase();
        } finally {
            await stopContainer();
        }
    });

    beforeEach(async () => {
        await cleanDatabase();
    });

    it("issues a __Secure- prefixed, Secure, HttpOnly, SameSite=Lax session cookie on sign-up", async () => {
        // Posted here rather than through createTestUser(): that helper looks for the unprefixed cookie name.
        const res = await app.inject({
            method: "POST",
            url: "/api/auth/sign-up/email",
            payload: {name: "Secure User", email: `secure-${Date.now()}@example.com`, password: "TestPassword123!"},
        });

        expect(res.statusCode).toBe(200);
        const header = getSetCookies(res).find((entry) => entry.startsWith("__Secure-better-auth.session_token="));
        expect(header, "the session cookie must carry the __Secure- prefix").toBeDefined();
        expect(header).toMatch(/;\s*Secure/i);
        expect(header).toMatch(/;\s*HttpOnly/i);
        expect(header).toMatch(/;\s*SameSite=Lax/i);
        expect(header).toMatch(/;\s*Path=\//i);
        expect(getSetCookies(res).some((entry) => entry.startsWith("better-auth.session_token="))).toBe(false);
    });
});
