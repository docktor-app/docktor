import type {FastifyPluginAsyncZod} from "fastify-type-provider-zod";
import {
    addTemplateRepoSchema,
    createStackSchema,
    templateRepoParamsSchema,
    templateVariantParamsSchema,
} from "@docktor/shared";
import {requireAuth} from "../lib/auth-middleware.js";
import {templateService} from "../application/index.js";

// Issue #19/T-12-24: every template route requires authentication.
const templateRoutes: FastifyPluginAsyncZod = async (app) => {
    app.addHook("onRequest", requireAuth);

    app.get("/api/templates", async () => {
        return templateService.listTemplates();
    });

    app.get("/api/templates/variants/:variantId", {
        schema: {params: templateVariantParamsSchema},
    }, async (request) => {
        return templateService.getVariant(request.params.variantId);
    });

    // Issue #19/D-08/threat #2: delegates to StackService.createStack via
    // TemplateService.createStackFromVariant — the single create path, so
    // this gets the exact same compose-check/428-confirmation enforcement
    // as POST /api/stacks.
    app.post("/api/templates/variants/:variantId/stacks", {
        schema: {params: templateVariantParamsSchema, body: createStackSchema},
    }, async (request, reply) => {
        const stack = await templateService.createStackFromVariant(request.params.variantId, request.body);
        return reply.status(201).send(stack);
    });

    // Issue #19 "users can add additional template repositories": listing
    // never syncs; adding validates the url against addTemplateRepoSchema
    // (T-12-37's allowlist) before it ever reaches GitExecutor.
    app.get("/api/template-repos", async () => {
        return templateService.listRepos();
    });

    app.post("/api/template-repos", {
        schema: {body: addTemplateRepoSchema},
    }, async (request, reply) => {
        const repo = await templateService.addRepo(request.body.url);
        return reply.status(201).send(repo);
    });

    app.post("/api/template-repos/:repoId/sync", {
        schema: {params: templateRepoParamsSchema},
    }, async (request) => {
        return templateService.syncRepo(request.params.repoId);
    });
};

export default templateRoutes;
