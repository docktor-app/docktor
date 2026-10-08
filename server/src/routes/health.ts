import type {FastifyPluginAsyncZod} from "fastify-type-provider-zod";
import {serviceHealthEventsQuerySchema, stackParamsSchema} from "@docktor/shared";
import {requireAuth} from "../lib/auth-middleware.js";
import {serviceHealthHistoryService} from "../application/index.js";

const healthRoutes: FastifyPluginAsyncZod = async (app) => {
    app.addHook("onRequest", requireAuth);

    // Per-service health transitions for one stack, newest first (#23, D-12).
    // Without ?serviceName: the latest `limit` per service. With it: only
    // that service's.
    app.get("/api/stacks/:id/health-events", {
        schema: {params: stackParamsSchema, querystring: serviceHealthEventsQuerySchema},
    }, async (request) => {
        return serviceHealthHistoryService.listHealthEvents(request.params.id, request.query);
    });
};

export default healthRoutes;
