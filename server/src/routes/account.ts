import type {FastifyPluginAsyncZod} from "fastify-type-provider-zod";
import {mandatoryTwoFactorSchema} from "@docktor/shared";
import {requireSession} from "../lib/auth-middleware.js";
import {accountSecurityService} from "../application/index.js";

const accountRoutes: FastifyPluginAsyncZod = async (app) => {
    // requireSession, not requireAuth: the enrollment-gated preHandler would
    // answer 403 to a user who still owes two-factor, who must be able to
    // reach these endpoints to enroll (15-RESEARCH Pitfall 11).
    app.addHook("onRequest", requireSession);

    app.get("/api/account/security", async (request) => accountSecurityService.getStatus(request.user.id));

    app.put(
        "/api/account/security/mandatory-2fa",
        {schema: {body: mandatoryTwoFactorSchema}},
        async (request) => accountSecurityService.setMandatory(request.user.id, request.body.enabled),
    );
};

export default accountRoutes;
