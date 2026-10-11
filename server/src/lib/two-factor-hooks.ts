import {APIError, getSessionFromCtx, type createAuthMiddleware} from "better-auth/api";
import {isTwoFactorChangePath, planSessionRevocation} from "../domain/two-factor-policy.js";

/** The context better-auth hands to a createAuthMiddleware handler. */
type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

export interface TwoFactorHookDeps {
    isMandatory: () => Promise<boolean>;
    deleteTrustDeviceRecords: (userId: string) => Promise<number>;
}

interface ActorCapture {
    userId: string;
    actorSessionToken: string;
    twoFactorEnabledBefore: boolean;
}

// What the before hook saw of the caller, for the after hook of the same call.
// better-auth passes both hook phases the same per-call `ctx.context` object
// (the endpoint result is written to it as `returned`), so it is the key. A
// WeakMap entry disappears with the call even if the after hook never runs.
const captures = new WeakMap<object, ActorCapture>();

const ALREADY_ENABLED_MESSAGE = "Two-factor authentication is already enabled. Disable it before setting it up again.";
const DISABLE_WHILE_MANDATORY_MESSAGE =
    "Turn off the instance-wide two-factor requirement before disabling two-factor on your account.";

async function rejectEnableWhenAlreadyEnabled(ctx: HookContext): Promise<void> {
    // Calling enable twice would replace the stored secret and recovery codes
    // and silently break the user's working authenticator.
    const session = await getSessionFromCtx(ctx);
    if (session?.user.twoFactorEnabled === true) {
        throw new APIError("BAD_REQUEST", {message: ALREADY_ENABLED_MESSAGE});
    }
}

async function rejectDisableWhenMandatory(deps: TwoFactorHookDeps): Promise<void> {
    if (await deps.isMandatory()) {
        throw new APIError("FORBIDDEN", {message: DISABLE_WHILE_MANDATORY_MESSAGE});
    }
}

async function captureActor(ctx: HookContext): Promise<void> {
    // No session means the sign-in challenge (only the pending two_factor
    // cookie is present): nothing to revoke afterwards, so nothing is captured.
    const session = await getSessionFromCtx(ctx);
    if (!session) return;
    captures.set(ctx.context, {
        userId: session.user.id,
        actorSessionToken: session.session.token,
        twoFactorEnabledBefore: session.user.twoFactorEnabled === true,
    });
}

/** Guards for /two-factor/enable and /disable, and the caller capture for D-10. */
export function createTwoFactorBeforeHook(deps: TwoFactorHookDeps): (ctx: HookContext) => Promise<void> {
    return async (ctx) => {
        if (ctx.path === "/two-factor/enable") await rejectEnableWhenAlreadyEnabled(ctx);
        if (ctx.path === "/two-factor/disable") await rejectDisableWhenMandatory(deps);
        if (isTwoFactorChangePath(ctx.path)) await captureActor(ctx);
    };
}

async function signOutOtherSessions(ctx: HookContext, userId: string, keepToken: string): Promise<void> {
    const {internalAdapter} = ctx.context;
    const sessions = await internalAdapter.listSessions(userId);
    await Promise.all(
        sessions.filter((session) => session.token !== keepToken).map((session) => internalAdapter.deleteSession(session.token)),
    );
}

/** D-10: after a successful credential-factor change, sign out every other device and trusted browser. */
export function createTwoFactorAfterHook(deps: TwoFactorHookDeps): (ctx: HookContext) => Promise<void> {
    return async (ctx) => {
        if (!isTwoFactorChangePath(ctx.path)) return;
        const captured = captures.get(ctx.context);
        if (!captured) return;
        captures.delete(ctx.context);

        const plan = planSessionRevocation({
            path: ctx.path,
            succeeded: !(ctx.context.returned instanceof APIError),
            actorSessionToken: captured.actorSessionToken,
            twoFactorEnabledBefore: captured.twoFactorEnabledBefore,
            reissuedSessionToken: ctx.context.newSession?.session.token ?? null,
        });
        if (!plan.revoke) return;

        await signOutOtherSessions(ctx, captured.userId, plan.keepToken);
        await deps.deleteTrustDeviceRecords(captured.userId);
    };
}
