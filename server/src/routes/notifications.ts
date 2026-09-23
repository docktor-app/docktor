import type {FastifyPluginAsyncZod} from "fastify-type-provider-zod"
import {requireAuth} from "../lib/auth-middleware.js"
import {notificationService} from "../application/index.js"

const notificationRoutes: FastifyPluginAsyncZod = async (app) => {
    app.addHook("onRequest", requireAuth)

    app.get("/api/notifications", async () => {
        return notificationService.getRecent(100)
    })
}

export default notificationRoutes
