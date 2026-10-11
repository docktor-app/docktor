import {beforeEach, describe, expect, it, vi} from "vitest";
import type {FastifyRequest} from "fastify";

// auth.ts builds the real better-auth instance (database client, env); the
// middleware only needs getSession and the setting read.
const getSession = vi.fn();
const isTwoFactorMandatory = vi.fn();
vi.mock("../../../src/lib/auth.js", () => ({
    auth: {api: {getSession: (...args: unknown[]) => getSession(...args)}},
    isTwoFactorMandatory: () => isTwoFactorMandatory(),
}));

import {requireAuth, requireSession} from "../../../src/lib/auth-middleware.js";
import {ForbiddenError, UnauthorizedError} from "../../../src/lib/errors.js";

function makeRequest(): FastifyRequest {
    // Safe: the middleware only reads `headers` and assigns `session` / `user`.
    return {headers: {cookie: "better-auth.session_token=abc"}} as unknown as FastifyRequest;
}

function sessionFor(twoFactorEnabled: boolean | null | undefined): {session: {id: string}; user: {id: string; twoFactorEnabled?: boolean | null}} {
    return {session: {id: "s1"}, user: {id: "u1", twoFactorEnabled}};
}

describe("requireSession", () => {
    beforeEach(() => {
        getSession.mockReset();
        isTwoFactorMandatory.mockReset();
    });

    it("rejects with UnauthorizedError when there is no session", async () => {
        getSession.mockResolvedValue(null);

        await expect(requireSession(makeRequest())).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("attaches the session and user to the request without reading the setting", async () => {
        const session = sessionFor(false);
        getSession.mockResolvedValue(session);
        const request = makeRequest();

        await requireSession(request);

        expect(request.user).toBe(session.user);
        expect(request.session).toBe(session.session);
        expect(isTwoFactorMandatory).not.toHaveBeenCalled();
    });
});

describe("requireAuth", () => {
    beforeEach(() => {
        getSession.mockReset();
        isTwoFactorMandatory.mockReset();
    });

    it("rejects with UnauthorizedError when there is no session", async () => {
        getSession.mockResolvedValue(null);

        await expect(requireAuth(makeRequest())).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("passes a user with two-factor without reading the setting", async () => {
        getSession.mockResolvedValue(sessionFor(true));

        await expect(requireAuth(makeRequest())).resolves.toBeUndefined();
        expect(isTwoFactorMandatory).not.toHaveBeenCalled();
    });

    it("refuses a user without two-factor while the requirement is on", async () => {
        getSession.mockResolvedValue(sessionFor(false));
        isTwoFactorMandatory.mockResolvedValue(true);

        const failure = await requireAuth(makeRequest()).catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(ForbiddenError);
        expect(failure).toMatchObject({statusCode: 403, code: "TWO_FACTOR_ENROLLMENT_REQUIRED"});
    });

    it("refuses a user whose twoFactorEnabled is null while the requirement is on", async () => {
        getSession.mockResolvedValue(sessionFor(null));
        isTwoFactorMandatory.mockResolvedValue(true);

        await expect(requireAuth(makeRequest())).rejects.toMatchObject({code: "TWO_FACTOR_ENROLLMENT_REQUIRED"});
    });

    it("passes a user without two-factor while the requirement is off", async () => {
        getSession.mockResolvedValue(sessionFor(false));
        isTwoFactorMandatory.mockResolvedValue(false);

        await expect(requireAuth(makeRequest())).resolves.toBeUndefined();
    });

    it("fails closed when the setting cannot be read", async () => {
        getSession.mockResolvedValue(sessionFor(false));
        isTwoFactorMandatory.mockRejectedValue(new Error("db down"));

        await expect(requireAuth(makeRequest())).rejects.toThrow("db down");
    });
});
