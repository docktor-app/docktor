import type {FastifyPluginAsyncZod} from "fastify-type-provider-zod";
import {requireAuth} from "../lib/auth-middleware.js";
import {templateService} from "../application/index.js";

// Issue #19/T-12-24: every template route requires authentication.
const templateRoutes: FastifyPluginAsyncZod = async (app) => {
    app.addHook("onRequest", requireAuth);

    app.get("/api/templates", async () => {
        return templateService.listTemplates();
    });
};

export default templateRoutes;
