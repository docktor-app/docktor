import type {FastifyPluginAsyncZod} from "fastify-type-provider-zod";
import {requireAuth} from "../lib/auth-middleware.js";
import {storageService} from "../application/index.js";

const storageRoutes: FastifyPluginAsyncZod = async (app) => {
    app.addHook("onRequest", requireAuth);

    // Disk usage per stack and per volume, the stack-local backups and the
    // totals (#27). Fed by the daily DiskUsageJob, so it is a read of stored
    // measurements and never shells out. A top-level path on purpose: a
    // static /api/stacks/<word> route would collide with /api/stacks/:id.
    app.get("/api/storage", async () => {
        return storageService.getStorageOverview();
    });
};

export default storageRoutes;
