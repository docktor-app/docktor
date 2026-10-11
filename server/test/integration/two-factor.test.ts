import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import type {FastifyInstance} from "fastify";
import {TWO_FACTOR_DISABLED_PATHS} from "../../src/lib/auth-config.js";
import {totpFromUri} from "../helpers/totp.js";
import {
    cleanDatabase,
    createTestUser,
    enrollTwoFactor,
    extractCookie,
    getApp,
    getPrisma,
    getSetCookies,
    SESSION_COOKIE_NAME,
    signIn,
    startContainer,
    stopContainer,
    TEST_ORIGIN,
    TRUST_DEVICE_COOKIE_NAME,
    TWO_FACTOR_COOKIE_NAME,
} from "./setup.js";

// Rate limiting stays off in this file (it does not opt in), so the flows can
// sign in repeatedly from the same IP. Recovery codes, secrets and TOTP URIs
// are never printed.

interface EnrolledUser {
    email: string;
    password: string;
    cookie: string;
    totpURI: string;
    backupCodes: string[];
}

describe("TOTP two-factor authentication (#45)", () => {
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

    function post(path: string, payload: Record<string, unknown>, cookie?: string) {
        return app.inject({
            method: "POST",
            url: `/api/auth${path}`,
            headers: {origin: TEST_ORIGIN, ...(cookie ? {cookie} : {})},
            payload,
        });
    }

    async function enrolledUser(): Promise<EnrolledUser> {
        const {cookie, email, password} = await createTestUser();
        const enrolled = await enrollTwoFactor(cookie, password);
        return {email, password, ...enrolled};
    }

    /** Signs in and returns the pending two-factor cookie. */
    async function startChallenge(user: EnrolledUser): Promise<string> {
        const res = await signIn(user.email, user.password);
        const pending = extractCookie(res, TWO_FACTOR_COOKIE_NAME);
        if (!pending) throw new Error(`startChallenge(): no pending cookie (status ${res.statusCode})`);
        return pending;
    }

    async function userRow(email: string) {
        return getPrisma().user.findUniqueOrThrow({where: {email}});
    }

    describe("enrollment", () => {
        it("enable returns a TOTP URI and ten recovery codes without enabling 2FA yet", async () => {
            const {cookie, email, password} = await createTestUser();

            const res = await post("/two-factor/enable", {password}, cookie);

            expect(res.statusCode).toBe(200);
            const body = res.json<{totpURI: string; backupCodes: string[]}>();
            expect(body.totpURI.startsWith("otpauth://totp/")).toBe(true);
            expect(body.backupCodes).toHaveLength(10);
            for (const code of body.backupCodes) {
                expect(code).toMatch(/^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/);
            }
            expect((await userRow(email)).twoFactorEnabled).toBe(false);
        });

        it("the first valid TOTP code turns 2FA on", async () => {
            const {cookie, email, password} = await createTestUser();
            const enable = await post("/two-factor/enable", {password}, cookie);
            const {totpURI} = enable.json<{totpURI: string}>();
            const sessionAfterEnable = extractCookie(enable, SESSION_COOKIE_NAME) ?? cookie;

            const res = await post("/two-factor/verify-totp", {code: totpFromUri(totpURI)}, sessionAfterEnable);

            expect(res.statusCode).toBe(200);
            expect((await userRow(email)).twoFactorEnabled).toBe(true);
        });
    });

    describe("sign-in second step", () => {
        it("answers twoFactorRedirect with a pending cookie and no session", async () => {
            const user = await enrolledUser();

            const res = await signIn(user.email, user.password);

            expect(res.statusCode).toBe(200);
            expect(res.json<{twoFactorRedirect?: boolean}>().twoFactorRedirect).toBe(true);
            expect(extractCookie(res, TWO_FACTOR_COOKIE_NAME)).not.toBeNull();
            expect(extractCookie(res, SESSION_COOKIE_NAME)).toBeNull();
        });

        it("a valid TOTP code on the pending cookie issues the session", async () => {
            const user = await enrolledUser();
            const pending = await startChallenge(user);

            const res = await post("/two-factor/verify-totp", {code: totpFromUri(user.totpURI)}, pending);

            expect(res.statusCode).toBe(200);
            const session = extractCookie(res, SESSION_COOKIE_NAME);
            expect(session).not.toBeNull();

            const current = await app.inject({
                method: "GET",
                url: "/api/auth/get-session",
                headers: {cookie: session as string},
            });
            expect(current.statusCode).toBe(200);
            expect(current.json<{user: {email: string}} | null>()?.user.email).toBe(user.email);
        });

        it("a wrong TOTP code is rejected and issues no session", async () => {
            const user = await enrolledUser();
            const pending = await startChallenge(user);
            const valid = totpFromUri(user.totpURI);
            const wrong = valid === "000000" ? "111111" : "000000";

            const res = await post("/two-factor/verify-totp", {code: wrong}, pending);

            expect(res.statusCode).toBe(401);
            expect(extractCookie(res, SESSION_COOKIE_NAME)).toBeNull();
        });

        it("a recovery code signs in once and is rejected the second time", async () => {
            const user = await enrolledUser();
            const code = user.backupCodes[0];

            const first = await post("/two-factor/verify-backup-code", {code}, await startChallenge(user));
            expect(first.statusCode).toBe(200);
            expect(extractCookie(first, SESSION_COOKIE_NAME)).not.toBeNull();

            const second = await post("/two-factor/verify-backup-code", {code}, await startChallenge(user));
            expect(second.statusCode).toBe(401);
            expect(extractCookie(second, SESSION_COOKIE_NAME)).toBeNull();
        });
    });

    describe("trusted device", () => {
        it("skips the challenge for 30 days when requested, and only then", async () => {
            const user = await enrolledUser();

            const verify = await post(
                "/two-factor/verify-totp",
                {code: totpFromUri(user.totpURI), trustDevice: true},
                await startChallenge(user),
            );
            expect(verify.statusCode).toBe(200);
            const trust = extractCookie(verify, TRUST_DEVICE_COOKIE_NAME);
            expect(trust).not.toBeNull();
            const trustHeader = getSetCookies(verify).find((c) => c.startsWith(`${TRUST_DEVICE_COOKIE_NAME}=`));
            expect(trustHeader).toMatch(/Max-Age=2592000/i);

            const trusted = await signIn(user.email, user.password, [trust as string]);
            expect(trusted.statusCode).toBe(200);
            expect(trusted.json<{twoFactorRedirect?: boolean}>().twoFactorRedirect).toBeUndefined();
            expect(extractCookie(trusted, SESSION_COOKIE_NAME)).not.toBeNull();

            const untrusted = await signIn(user.email, user.password);
            expect(untrusted.json<{twoFactorRedirect?: boolean}>().twoFactorRedirect).toBe(true);
            expect(extractCookie(untrusted, SESSION_COOKIE_NAME)).toBeNull();
        });

        it("does not set a trust cookie when trustDevice is false", async () => {
            const user = await enrolledUser();

            const verify = await post(
                "/two-factor/verify-totp",
                {code: totpFromUri(user.totpURI), trustDevice: false},
                await startChallenge(user),
            );

            expect(verify.statusCode).toBe(200);
            expect(extractCookie(verify, TRUST_DEVICE_COOKIE_NAME)).toBeNull();
        });
    });

    describe("password re-entry", () => {
        it.each(["/two-factor/enable", "/two-factor/disable", "/two-factor/generate-backup-codes"])(
            "%s rejects a wrong password and changes nothing",
            async (path) => {
                const user = await enrolledUser();
                const userId = (await userRow(user.email)).id;
                const before = await getPrisma().twoFactor.findFirstOrThrow({where: {userId}});

                const res = await post(path, {password: "not-the-password"}, user.cookie);

                expect(res.statusCode).toBeGreaterThanOrEqual(400);
                expect((await userRow(user.email)).twoFactorEnabled).toBe(true);
                const after = await getPrisma().twoFactor.findFirstOrThrow({where: {userId}});
                expect(after.backupCodes).toBe(before.backupCodes);
                expect(after.secret).toBe(before.secret);
            },
        );
    });

    describe("closed endpoints", () => {
        it.each([...TWO_FACTOR_DISABLED_PATHS])("POST /api/auth%s answers 404", async (path) => {
            const {cookie} = await createTestUser();

            const res = await post(path, {}, cookie);

            expect(res.statusCode).toBe(404);
        });

        it("exposes no endpoint that returns stored recovery codes", async () => {
            const user = await enrolledUser();
            const userId = (await userRow(user.email)).id;

            const res = await post("/two-factor/view-backup-codes", {userId}, user.cookie);

            expect(res.statusCode).toBe(404);
        });
    });
});
