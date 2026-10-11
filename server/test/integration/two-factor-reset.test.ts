import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import type {FastifyInstance} from "fastify";
import {totpFromUri} from "../helpers/totp.js";
import {
    cleanDatabase,
    createAdditionalUser,
    createTestUser,
    enrollTwoFactor,
    extractCookie,
    getApp,
    getPrisma,
    SESSION_COOKIE_NAME,
    signIn,
    startContainer,
    stopContainer,
    TEST_ORIGIN,
    TWO_FACTOR_COOKIE_NAME,
} from "./setup.js";

// D-09: the on-box reset (scripts/reset-two-factor.ts calls this service
// method). Recovery codes and secrets are never printed.

describe("Two-factor reset (D-09)", () => {
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

    async function resetService() {
        // Imported after getApp(): application/index.ts wires the singletons against the test database.
        return (await import("../../src/application/index.js")).accountSecurityService;
    }

    /** Enrolls a user, then leaves them with two sessions and a trusted device. */
    async function enrolledUserWithSessionsAndTrustedDevice() {
        const {cookie, email, password} = await createTestUser();
        const enrolled = await enrollTwoFactor(cookie, password);

        const challenge = await signIn(email, password);
        const pending = extractCookie(challenge, TWO_FACTOR_COOKIE_NAME);
        if (pending === null) throw new Error("expected a two-factor challenge");
        const verify = await app.inject({
            method: "POST",
            url: "/api/auth/two-factor/verify-totp",
            headers: {origin: TEST_ORIGIN, cookie: pending},
            payload: {code: totpFromUri(enrolled.totpURI), trustDevice: true},
        });
        expect(verify.statusCode).toBe(200);
        expect(extractCookie(verify, SESSION_COOKIE_NAME)).not.toBeNull();

        const user = await getPrisma().user.findUniqueOrThrow({where: {email}});
        return {email, password, userId: user.id};
    }

    it("disables 2FA, signs the user out everywhere and forgets trusted devices", async () => {
        const {email, userId} = await enrolledUserWithSessionsAndTrustedDevice();
        const prisma = getPrisma();
        expect(await prisma.session.count({where: {userId}})).toBeGreaterThanOrEqual(2);
        expect(await prisma.verification.count({where: {identifier: {startsWith: "trust-device-"}, value: userId}})).toBe(1);
        const service = await resetService();

        await expect(service.resetTwoFactor(email)).resolves.toEqual({userId});

        const user = await prisma.user.findUniqueOrThrow({where: {id: userId}});
        expect(user.twoFactorEnabled).toBe(false);
        expect(await prisma.twoFactor.count({where: {userId}})).toBe(0);
        expect(await prisma.session.count({where: {userId}})).toBe(0);
        expect(
            await prisma.verification.count({
                where: {
                    value: userId,
                    OR: [{identifier: {startsWith: "trust-device-"}}, {identifier: {startsWith: "2fa-"}}],
                },
            }),
        ).toBe(0);
    });

    it("lets the user sign in with the password alone afterwards", async () => {
        const {email, password} = await enrolledUserWithSessionsAndTrustedDevice();
        const service = await resetService();

        await service.resetTwoFactor(email);
        const res = await signIn(email, password);

        expect(res.statusCode).toBe(200);
        expect(res.json<{twoFactorRedirect?: boolean}>().twoFactorRedirect).toBeUndefined();
        expect(extractCookie(res, SESSION_COOKIE_NAME)).not.toBeNull();
    });

    it("leaves other users untouched", async () => {
        const {userId: resetUserId, email} = await enrolledUserWithSessionsAndTrustedDevice();
        const other = await createOtherEnrolledUser();
        const service = await resetService();

        await service.resetTwoFactor(email);

        const prisma = getPrisma();
        expect(resetUserId).not.toBe(other.userId);
        expect((await prisma.user.findUniqueOrThrow({where: {id: other.userId}})).twoFactorEnabled).toBe(true);
        expect(await prisma.twoFactor.count({where: {userId: other.userId}})).toBe(1);
        expect(await prisma.session.count({where: {userId: other.userId}})).toBeGreaterThan(0);
    });

    it("rejects an unknown email without changing anything", async () => {
        const {userId} = await enrolledUserWithSessionsAndTrustedDevice();
        const service = await resetService();

        await expect(service.resetTwoFactor("nobody@example.com")).rejects.toMatchObject({statusCode: 404});

        expect((await getPrisma().user.findUniqueOrThrow({where: {id: userId}})).twoFactorEnabled).toBe(true);
    });

    async function createOtherEnrolledUser(): Promise<{userId: string}> {
        const email = `other-${Date.now()}@example.com`;
        const password = "OtherPassword123!";
        const {id} = await createAdditionalUser(email, password);
        const login = await signIn(email, password);
        const cookie = extractCookie(login, SESSION_COOKIE_NAME);
        if (cookie === null) throw new Error("expected a session for the additional user");
        await enrollTwoFactor(cookie, password);
        return {userId: id};
    }
});
