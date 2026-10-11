import type {FastifyRequest} from "fastify";
import {fromNodeHeaders} from "better-auth/node";
import {ACCOUNT_SECURITY_ERROR_CODES} from "@docktor/shared";
import {auth, isTwoFactorMandatory, type AuthSession, type AuthUser} from "./auth.js";
import {isEnrollmentRequired} from "../domain/two-factor-policy.js";
import {ForbiddenError, UnauthorizedError} from "./errors.js";

declare module "fastify" {
    interface FastifyRequest {
        session: AuthSession;
        user: AuthUser;
    }
}

/**
 * Authentication only: resolves the session onto the request. Used by
 * /api/account/*, which users who still owe two-factor enrollment must be able
 * to reach (the gated requireAuth there would deadlock enrollment).
 */
export async function requireSession(request: FastifyRequest): Promise<void> {
    const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
    });

    if (!session) {
        throw new UnauthorizedError();
    }

    request.session = session.session;
    request.user = session.user;
}

/**
 * Authentication plus the D-01 enrollment gate: while the instance requires
 * two-factor, a user without it gets 403 TWO_FACTOR_ENROLLMENT_REQUIRED on
 * every route behind this hook. The setting is only read for users without
 * two-factor, so enrolled users pay no extra query.
 */
export async function requireAuth(request: FastifyRequest): Promise<void> {
    await requireSession(request);

    if (request.user.twoFactorEnabled === true) return;

    const mandatory = await isTwoFactorMandatory();
    if (isEnrollmentRequired({mandatory, twoFactorEnabled: request.user.twoFactorEnabled})) {
        throw new ForbiddenError(
            "Two-factor authentication must be set up before using Docktor",
            ACCOUNT_SECURITY_ERROR_CODES.TWO_FACTOR_ENROLLMENT_REQUIRED,
        );
    }
}
