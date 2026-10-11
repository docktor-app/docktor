import {beforeEach, describe, expect, it, vi} from "vitest";
import {APIError} from "better-auth/api";

// getSessionFromCtx is the only better-auth runtime the hooks call besides
// APIError; everything else comes in through the fake context below.
const getSessionFromCtx = vi.fn();
vi.mock("better-auth/api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("better-auth/api")>()),
    getSessionFromCtx: (...args: unknown[]) => getSessionFromCtx(...args),
}));

import {createTwoFactorAfterHook, createTwoFactorBeforeHook} from "../../../src/lib/two-factor-hooks.js";

type HookContext = Parameters<ReturnType<typeof createTwoFactorBeforeHook>>[0];

const listSessions = vi.fn();
const deleteSession = vi.fn();
const isMandatory = vi.fn();
const deleteTrustDeviceRecords = vi.fn();

const deps = {
    isMandatory: () => isMandatory() as Promise<boolean>,
    deleteTrustDeviceRecords: (userId: string) => deleteTrustDeviceRecords(userId) as Promise<number>,
};

interface FakeContextOptions {
    returned?: unknown;
    newSessionToken?: string;
}

/**
 * One fake call, as in better-auth: the before and after hooks see the same
 * `context` object, and `settle()` plays the endpoint writing its result to it.
 */
function makeCall(path: string, options: FakeContextOptions = {}): {ctx: HookContext; settle: () => void} {
    const context = {
        returned: undefined as unknown,
        newSession: null as {session: {token: string}} | null,
        internalAdapter: {listSessions, deleteSession},
    };
    return {
        // Safe: the hooks read only `path` and `context`, both provided here.
        ctx: {path, context} as unknown as HookContext,
        settle: () => {
            context.returned = options.returned;
            context.newSession = options.newSessionToken ? {session: {token: options.newSessionToken}} : null;
        },
    };
}

function sessionOf(token: string, twoFactorEnabled: boolean) {
    return {session: {token}, user: {id: "u1", twoFactorEnabled}};
}

describe("two-factor better-auth hooks", () => {
    const before = createTwoFactorBeforeHook(deps);
    const after = createTwoFactorAfterHook(deps);

    beforeEach(() => {
        getSessionFromCtx.mockReset();
        listSessions.mockReset();
        deleteSession.mockReset();
        isMandatory.mockReset();
        deleteTrustDeviceRecords.mockReset();
        listSessions.mockResolvedValue([{token: "a"}, {token: "b"}, {token: "c"}]);
        deleteSession.mockResolvedValue(undefined);
        deleteTrustDeviceRecords.mockResolvedValue(1);
    });

    describe("before: /two-factor/enable", () => {
        it("rejects with 400 when two-factor is already enabled", async () => {
            getSessionFromCtx.mockResolvedValue(sessionOf("a", true));

            const failure = await before(makeCall("/two-factor/enable").ctx).catch((error: unknown) => error);

            expect(failure).toBeInstanceOf(APIError);
            expect(failure).toMatchObject({statusCode: 400});
        });

        it("lets a user without two-factor start enrollment", async () => {
            getSessionFromCtx.mockResolvedValue(sessionOf("a", false));

            await expect(before(makeCall("/two-factor/enable").ctx)).resolves.toBeUndefined();
        });
    });

    describe("before: /two-factor/disable", () => {
        it("rejects with 403 and the instruction message while the requirement is on", async () => {
            isMandatory.mockResolvedValue(true);

            const failure = await before(makeCall("/two-factor/disable").ctx).catch((error: unknown) => error);

            expect(failure).toBeInstanceOf(APIError);
            expect(failure).toMatchObject({statusCode: 403});
            expect((failure as APIError).message).toContain("Turn off the instance-wide two-factor requirement");
        });

        it("allows disabling while the requirement is off", async () => {
            isMandatory.mockResolvedValue(false);
            getSessionFromCtx.mockResolvedValue(sessionOf("a", true));

            await expect(before(makeCall("/two-factor/disable").ctx)).resolves.toBeUndefined();
        });
    });

    describe("after: session revocation (D-10)", () => {
        it("signs out other sessions and purges trust records after enabling verify-totp, keeping the re-issued session", async () => {
            getSessionFromCtx.mockResolvedValue(sessionOf("a", false));
            const call = makeCall("/two-factor/verify-totp", {returned: {token: "b"}, newSessionToken: "b"});

            await before(call.ctx);
            call.settle();
            await after(call.ctx);

            expect(deleteSession.mock.calls.map((args) => args[0]).sort()).toEqual(["a", "c"]);
            expect(deleteTrustDeviceRecords).toHaveBeenCalledWith("u1");
        });

        it("keeps the acting session after generate-backup-codes (no re-issue)", async () => {
            getSessionFromCtx.mockResolvedValue(sessionOf("a", true));
            const call = makeCall("/two-factor/generate-backup-codes", {returned: {status: true}});

            await before(call.ctx);
            call.settle();
            await after(call.ctx);

            expect(deleteSession.mock.calls.map((args) => args[0]).sort()).toEqual(["b", "c"]);
            expect(deleteTrustDeviceRecords).toHaveBeenCalledWith("u1");
        });

        it("revokes after a successful disable, keeping the re-issued session", async () => {
            isMandatory.mockResolvedValue(false);
            getSessionFromCtx.mockResolvedValue(sessionOf("a", true));
            const call = makeCall("/two-factor/disable", {returned: {status: true}, newSessionToken: "c"});

            await before(call.ctx);
            call.settle();
            await after(call.ctx);

            expect(deleteSession.mock.calls.map((args) => args[0]).sort()).toEqual(["a", "b"]);
        });

        it("revokes nothing when the call failed (wrong password)", async () => {
            getSessionFromCtx.mockResolvedValue(sessionOf("a", true));
            const call = makeCall("/two-factor/generate-backup-codes", {
                returned: new APIError("BAD_REQUEST", {message: "Invalid password"}),
            });

            await before(call.ctx);
            call.settle();
            await after(call.ctx);

            expect(deleteSession).not.toHaveBeenCalled();
            expect(deleteTrustDeviceRecords).not.toHaveBeenCalled();
        });

        it("revokes nothing on the sign-in challenge (no acting session)", async () => {
            getSessionFromCtx.mockResolvedValue(null);
            const call = makeCall("/two-factor/verify-totp", {returned: {token: "x"}, newSessionToken: "x"});

            await before(call.ctx);
            call.settle();
            await after(call.ctx);

            expect(deleteSession).not.toHaveBeenCalled();
        });

        it("revokes nothing for a plain re-verification by a user who already has two-factor", async () => {
            getSessionFromCtx.mockResolvedValue(sessionOf("a", true));
            const call = makeCall("/two-factor/verify-totp", {returned: {token: "a"}});

            await before(call.ctx);
            call.settle();
            await after(call.ctx);

            expect(deleteSession).not.toHaveBeenCalled();
        });

        it("ignores unrelated paths", async () => {
            const call = makeCall("/sign-in/email", {returned: {token: "x"}});

            await before(call.ctx);
            call.settle();
            await after(call.ctx);

            expect(getSessionFromCtx).not.toHaveBeenCalled();
            expect(deleteSession).not.toHaveBeenCalled();
        });
    });
});
