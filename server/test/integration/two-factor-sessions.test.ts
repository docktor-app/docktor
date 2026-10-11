import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import type {FastifyInstance} from "fastify";
import {totpFromUri} from "../helpers/totp.js";
import {
    cleanDatabase,
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

// D-10: enabling, disabling or regenerating recovery codes signs out the
// user's other devices and trusted browsers, keeps the caller signed in, and
// a failed call revokes nothing. Also the guards in front of enable and
// disable. Recovery codes, secrets and TOTP URIs are never printed.

interface EnrolledUser {
    email: string;
    password: string;
    cookie: string;
    totpURI: string;
    backupCodes: string[];
}

describe("Two-factor changes and sessions (#45, D-10)", () => {
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

    function post(path: string, payload: Record<string, unknown>, cookie: string) {
        return app.inject({
            method: "POST",
            url: `/api/auth${path}`,
            headers: {origin: TEST_ORIGIN, cookie},
            payload,
        });
    }

    /** GET /api/auth/get-session answers 200 with a null body for a revoked or unknown session. */
    async function isSessionAccepted(cookie: string): Promise<boolean> {
        const res = await app.inject({method: "GET", url: "/api/auth/get-session", headers: {cookie}});
        return res.statusCode === 200 && res.json<{user?: {id: string}} | null>()?.user !== undefined;
    }

    /** A plain sign-in for a user that has no two-factor yet. */
    async function plainSession(email: string, password: string): Promise<string> {
        const res = await signIn(email, password);
        const cookie = extractCookie(res, SESSION_COOKIE_NAME);
        if (!cookie) throw new Error(`plainSession(): no session (status ${res.statusCode})`);
        return cookie;
    }

    /** Sign-in plus the TOTP second step; optionally asks to trust the device. */
    async function challengedSession(user: EnrolledUser, trustDevice = false): Promise<string> {
        const first = await signIn(user.email, user.password);
        const pending = extractCookie(first, TWO_FACTOR_COOKIE_NAME);
        if (!pending) throw new Error(`challengedSession(): no pending cookie (status ${first.statusCode})`);
        const res = await post("/two-factor/verify-totp", {code: totpFromUri(user.totpURI), trustDevice}, pending);
        const cookie = extractCookie(res, SESSION_COOKIE_NAME);
        if (!cookie) throw new Error(`challengedSession(): no session (status ${res.statusCode})`);
        return cookie;
    }

    async function enrolledUser(): Promise<EnrolledUser> {
        const {cookie, email, password} = await createTestUser();
        const enrolled = await enrollTwoFactor(cookie, password);
        return {email, password, ...enrolled};
    }

    async function enableMandatory(cookie: string): Promise<void> {
        const res = await app.inject({
            method: "PUT",
            url: "/api/account/security/mandatory-2fa",
            headers: {cookie, origin: TEST_ORIGIN},
            payload: {enabled: true},
        });
        if (res.statusCode !== 200) throw new Error(`enableMandatory(): status ${res.statusCode}`);
    }

    it("enabling two-factor signs out the user's other session and keeps the re-issued one", async () => {
        const {cookie: c1, email, password} = await createTestUser();
        const c2 = await plainSession(email, password);
        expect(await isSessionAccepted(c1)).toBe(true);
        expect(await isSessionAccepted(c2)).toBe(true);

        const enrolled = await enrollTwoFactor(c1, password);

        expect(await isSessionAccepted(c2)).toBe(false);
        expect(await isSessionAccepted(enrolled.cookie)).toBe(true);

        // The revoked session's get-session answer is a null body, not an error.
        const revoked = await app.inject({method: "GET", url: "/api/auth/get-session", headers: {cookie: c2}});
        expect(revoked.json()).toBeNull();
    });

    it("regenerating recovery codes signs out other sessions, returns ten new codes and retires the old ones", async () => {
        const user = await enrolledUser();
        const c3 = await challengedSession(user);
        expect(await isSessionAccepted(c3)).toBe(true);

        const res = await post("/two-factor/generate-backup-codes", {password: user.password}, user.cookie);

        expect(res.statusCode).toBe(200);
        const {backupCodes} = res.json<{backupCodes: string[]}>();
        expect(backupCodes).toHaveLength(10);
        expect(await isSessionAccepted(c3)).toBe(false);
        expect(await isSessionAccepted(user.cookie)).toBe(true);

        const challenge = await signIn(user.email, user.password);
        const pending = extractCookie(challenge, TWO_FACTOR_COOKIE_NAME) as string;
        const oldCode = await post("/two-factor/verify-backup-code", {code: user.backupCodes[0]}, pending);
        expect(oldCode.statusCode).toBe(401);
        const newCode = await post("/two-factor/verify-backup-code", {code: backupCodes[0]}, pending);
        expect(newCode.statusCode).toBe(200);
    });

    it("disabling two-factor signs out other sessions and trusted browsers but keeps the caller", async () => {
        const user = await enrolledUser();
        const c4 = await challengedSession(user, true);
        const prisma = getPrisma();
        const userRow = await prisma.user.findUniqueOrThrow({where: {email: user.email}});
        const trustRows = () =>
            prisma.verification.count({where: {identifier: {startsWith: "trust-device-"}, value: userRow.id}});
        expect(await trustRows()).toBe(1);

        const res = await post("/two-factor/disable", {password: user.password}, user.cookie);

        expect(res.statusCode).toBe(200);
        const reissued = extractCookie(res, SESSION_COOKIE_NAME);
        expect(reissued).not.toBeNull();
        expect(await isSessionAccepted(c4)).toBe(false);
        expect(await isSessionAccepted(reissued as string)).toBe(true);
        expect(await trustRows()).toBe(0);
    });

    it.each(["/two-factor/disable", "/two-factor/generate-backup-codes"])(
        "%s with a wrong password fails and revokes nothing",
        async (path) => {
            const user = await enrolledUser();
            const c3 = await challengedSession(user);

            const res = await post(path, {password: `${user.password}-wrong`}, user.cookie);

            expect(res.statusCode).toBeGreaterThanOrEqual(400);
            expect(await isSessionAccepted(c3)).toBe(true);
            expect(await isSessionAccepted(user.cookie)).toBe(true);
        },
    );

    it("a plain TOTP re-verification by an enrolled user revokes nothing", async () => {
        const user = await enrolledUser();
        const c3 = await challengedSession(user);

        const res = await post("/two-factor/verify-totp", {code: totpFromUri(user.totpURI)}, user.cookie);

        expect(res.statusCode).toBe(200);
        expect(await isSessionAccepted(c3)).toBe(true);
        expect(await isSessionAccepted(user.cookie)).toBe(true);
    });

    it("refuses to disable two-factor while the instance requires it", async () => {
        const user = await enrolledUser();
        await enableMandatory(user.cookie);

        const res = await post("/two-factor/disable", {password: user.password}, user.cookie);

        expect(res.statusCode).toBe(403);
        expect(res.json<{message?: string}>().message).toContain("Turn off the instance-wide two-factor requirement");
        const row = await getPrisma().user.findUniqueOrThrow({where: {email: user.email}});
        expect(row.twoFactorEnabled).toBe(true);
    });

    it("refuses to enable two-factor twice and keeps the stored secret", async () => {
        const user = await enrolledUser();
        const prisma = getPrisma();
        const userRow = await prisma.user.findUniqueOrThrow({where: {email: user.email}});
        const before = await prisma.twoFactor.findFirstOrThrow({where: {userId: userRow.id}});

        const res = await post("/two-factor/enable", {password: user.password}, user.cookie);

        expect(res.statusCode).toBe(400);
        const after = await prisma.twoFactor.findFirstOrThrow({where: {userId: userRow.id}});
        expect(after.secret).toBe(before.secret);
    });
});
