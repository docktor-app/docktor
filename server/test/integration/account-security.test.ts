import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import type {FastifyInstance} from "fastify";
import {
    cleanDatabase,
    createAdditionalUser,
    createTestUser,
    enrollTwoFactor,
    extractCookie,
    getApp,
    SESSION_COOKIE_NAME,
    signIn,
    startContainer,
    stopContainer,
    TEST_ORIGIN,
} from "./setup.js";

// Mandatory two-factor (#45, D-01/D-02/D-03). Recovery codes, secrets and TOTP
// URIs are never printed.

interface SecurityStatus {
    twoFactorEnabled: boolean;
    mandatory: boolean;
    enrollmentRequired: boolean;
}

describe("Account security and the mandatory two-factor gate (#45)", () => {
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

    function get(url: string, cookie?: string) {
        return app.inject({method: "GET", url, headers: cookie ? {cookie} : {}});
    }

    function setMandatory(enabled: boolean, cookie: string) {
        return app.inject({
            method: "PUT",
            url: "/api/account/security/mandatory-2fa",
            headers: {cookie, origin: TEST_ORIGIN},
            payload: {enabled},
        });
    }

    /** A signed-in user without two-factor, created next to an existing user. */
    async function secondUser(): Promise<{cookie: string; password: string}> {
        const email = `second-${Date.now()}@example.com`;
        const password = "SecondPassword123!";
        await createAdditionalUser(email, password);
        const res = await signIn(email, password);
        const cookie = extractCookie(res, SESSION_COOKIE_NAME);
        if (!cookie) throw new Error(`secondUser(): sign-in failed with status ${res.statusCode}`);
        return {cookie, password};
    }

    it("rejects unauthenticated requests with the unchanged 401 body", async () => {
        const res = await get("/api/account/security");

        expect(res.statusCode).toBe(401);
        expect(res.json()).toEqual({error: "Unauthorized"});
    });

    it("reports a fresh user as not enrolled and not required", async () => {
        const {cookie} = await createTestUser();

        const res = await get("/api/account/security", cookie);

        expect(res.statusCode).toBe(200);
        expect(res.json<SecurityStatus>()).toEqual({
            twoFactorEnabled: false,
            mandatory: false,
            enrollmentRequired: false,
        });
    });

    it("refuses to turn the requirement on for a user without two-factor (D-02)", async () => {
        const {cookie} = await createTestUser();

        const res = await setMandatory(true, cookie);

        expect(res.statusCode).toBe(403);
        expect(res.json()).toMatchObject({code: "TWO_FACTOR_NOT_ENABLED"});
        expect((await get("/api/account/security", cookie)).json<SecurityStatus>().mandatory).toBe(false);
    });

    it("lets a user with two-factor turn the requirement on and off", async () => {
        const user = await createTestUser();
        const enrolled = await enrollTwoFactor(user.cookie, user.password);

        const on = await setMandatory(true, enrolled.cookie);
        expect(on.statusCode).toBe(200);
        expect(on.json<SecurityStatus>()).toEqual({twoFactorEnabled: true, mandatory: true, enrollmentRequired: false});

        const off = await setMandatory(false, enrolled.cookie);
        expect(off.statusCode).toBe(200);
        expect(off.json<SecurityStatus>().mandatory).toBe(false);
    });

    describe("with the requirement on", () => {
        let enrolledCookie: string;

        beforeEach(async () => {
            const user = await createTestUser();
            const enrolled = await enrollTwoFactor(user.cookie, user.password);
            enrolledCookie = enrolled.cookie;
            expect((await setMandatory(true, enrolledCookie)).statusCode).toBe(200);
        });

        it("answers 403 TWO_FACTOR_ENROLLMENT_REQUIRED on gated routes for a user without two-factor", async () => {
            const second = await secondUser();

            for (const url of ["/api/stacks", "/api/settings/general", "/api/events"]) {
                const res = await get(url, second.cookie);
                expect(res.statusCode, url).toBe(403);
                expect(res.json(), url).toMatchObject({code: "TWO_FACTOR_ENROLLMENT_REQUIRED"});
            }
        });

        it("keeps the account security endpoint reachable for that user", async () => {
            const second = await secondUser();

            const res = await get("/api/account/security", second.cookie);

            expect(res.statusCode).toBe(200);
            expect(res.json<SecurityStatus>()).toEqual({
                twoFactorEnabled: false,
                mandatory: true,
                enrollmentRequired: true,
            });
        });

        it("does not let that user lift the requirement for themselves", async () => {
            const second = await secondUser();

            const res = await setMandatory(false, second.cookie);

            expect(res.statusCode).toBe(403);
            expect(res.json()).toMatchObject({code: "TWO_FACTOR_NOT_ENABLED"});
            expect((await get("/api/account/security", enrolledCookie)).json<SecurityStatus>().mandatory).toBe(true);
        });

        it("lets the enrolled user keep using gated routes", async () => {
            expect((await get("/api/stacks", enrolledCookie)).statusCode).toBe(200);
        });

        it("opens the gated routes for the second user once they enroll", async () => {
            const second = await secondUser();
            expect((await get("/api/stacks", second.cookie)).statusCode).toBe(403);

            const enrolled = await enrollTwoFactor(second.cookie, second.password);

            expect((await get("/api/stacks", enrolled.cookie)).statusCode).toBe(200);
        });
    });
});
