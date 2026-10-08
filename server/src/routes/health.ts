import type {FastifyPluginAsyncZod} from "fastify-type-provider-zod";
import {serviceHealthEventsQuerySchema, stackParamsSchema} from "@docktor/shared";
import {requireAuth} from "../lib/auth-middleware.js";
import {serviceHealthHistoryService, uptimeService} from "../application/index.js";

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

    // One stack's uptime percentage over the retention window plus its
    // incidents (#24, D-09, D-11).
    app.get("/api/stacks/:id/uptime", {
        schema: {params: stackParamsSchema},
    }, async (request) => {
        return uptimeService.getStackUptime(request.params.id);
    });

    // Every stack's uptime percentage in one call, for the stack list (#24,
    // D-16). Deliberately outside /api/stacks/ so a stack whose id is
    // "uptime" is never shadowed by a static route (RESEARCH Pitfall 12).
    app.get("/api/uptime/stacks", async () => {
        return uptimeService.listStackUptimes();
    });
};

export default healthRoutes;
