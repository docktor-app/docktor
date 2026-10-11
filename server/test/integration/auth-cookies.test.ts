import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import type {FastifyInstance} from "fastify";
import {totpFromUri} from "../helpers/totp.js";
import {
    cleanDatabase,
    createTestUser,
    enrollTwoFactor,
    extractCookie,
    getApp,
    getSetCookies,
    SESSION_COOKIE_NAME,
    signIn,
    startContainer,
    stopContainer,
    TEST_ORIGIN,
    TRUST_DEVICE_COOKIE_NAME,
    TWO_FACTOR_COOKIE_NAME,
} from "./setup.js";

// #46 / D-15: every auth cookie is HttpOnly, SameSite=Lax and Path=/. This file
// runs over plain http (BETTER_AUTH_URL unset), so none of them may be Secure;
// the https counterpart is auth-cookies-https.test.ts.

describe("Auth cookie attributes over http (#46)", () => {
    let app: FastifyInstance;

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
    });

    function setCookieHeader(res: Parameters<typeof getSetCookies>[0], name: string): string {
        const header = getSetCookies(res).find((entry) => entry.startsWith(`${name}=`));
        if (header === undefined) throw new Error(`Response did not set the ${name} cookie`);
        return header;
    }

    function expectHardened(header: string): void {
        expect(header).toMatch(/;\s*HttpOnly/i);
        expect(header).toMatch(/;\s*SameSite=Lax/i);
        expect(header).toMatch(/;\s*Path=\//i);
        expect(header).not.toMatch(/;\s*Secure/i);
    }

    it("hardens the session cookie issued by sign-up", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/api/auth/sign-up/email",
            payload: {name: "Cookie User", email: `cookies-${Date.now()}@example.com`, password: "TestPassword123!"},
        });

        expect(res.statusCode).toBe(200);
        expectHardened(setCookieHeader(res, SESSION_COOKIE_NAME));
    });

    it("hardens the session cookie issued by sign-in", async () => {
        const {email, password} = await createTestUser();

        const res = await signIn(email, password);

        expect(res.statusCode).toBe(200);
        expectHardened(setCookieHeader(res, SESSION_COOKIE_NAME));
    });

    it("hardens the pending two-factor cookie and the 30-day trust-device cookie", async () => {
        const {cookie, email, password} = await createTestUser();
        const {totpURI} = await enrollTwoFactor(cookie, password);

        const challenge = await signIn(email, password);
        const pending = extractCookie(challenge, TWO_FACTOR_COOKIE_NAME);
        expect(pending).not.toBeNull();
        expectHardened(setCookieHeader(challenge, TWO_FACTOR_COOKIE_NAME));

        const verify = await app.inject({
            method: "POST",
            url: "/api/auth/two-factor/verify-totp",
            headers: {origin: TEST_ORIGIN, cookie: pending as string},
            payload: {code: totpFromUri(totpURI), trustDevice: true},
        });

        expect(verify.statusCode).toBe(200);
        const trustHeader = setCookieHeader(verify, TRUST_DEVICE_COOKIE_NAME);
        expectHardened(trustHeader);
        expect(trustHeader).toMatch(/Max-Age=2592000/i);
        expectHardened(setCookieHeader(verify, SESSION_COOKIE_NAME));
    });
});
