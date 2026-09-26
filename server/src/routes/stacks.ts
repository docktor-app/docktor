import type {FastifyPluginAsyncZod} from "fastify-type-provider-zod";
import {z} from "zod";
import {
    createStackSchema,
    stackParamsSchema,
    stackServiceParamsSchema,
    updateStackSchema,
    upgradeServiceParamsSchema,
    upgradeServiceSchema,
} from "@docktor/shared";
import {requireAuth} from "../lib/auth-middleware.js";
import {logService, stackService} from "../application/index.js";
import {processDockerLogChunk} from "../lib/docker-log-parser.js";
import {NotFoundError} from "../lib/errors.js";

const stackRoutes: FastifyPluginAsyncZod = async (app) => {
    app.addHook("onRequest", requireAuth);

    // List all stacks
    app.get("/api/stacks", async () => {
        return stackService.listStacks();
    });

    // Create stack
    app.post("/api/stacks", {
        schema: {body: createStackSchema},
    }, async (request, reply) => {
        const stack = await stackService.createStack(request.body);
        return reply.status(201).send(stack);
    });

    // Get stack detail
    app.get("/api/stacks/:id", {
        schema: {params: stackParamsSchema},
    }, async (request, reply) => {
        const stack = await stackService.getStackWithUpdateInfo(request.params.id);
        if (!stack) {
            return reply.status(404).send({error: "Stack not found"});
        }
        return stack;
    });

    // Update stack
    app.put("/api/stacks/:id", {
        schema: {params: stackParamsSchema, body: updateStackSchema},
    }, async (request) => {
        return stackService.updateStack(request.params.id, request.body);
    });

    // Delete stack
    app.delete("/api/stacks/:id", {
        schema: {params: stackParamsSchema},
    }, async (request, reply) => {
        await stackService.deleteStack(request.params.id);
        return reply.status(204).send();
    });

    // Deploy stack
    app.post("/api/stacks/:id/deploy", {
        schema: {params: stackParamsSchema},
    }, async (request) => {
        return stackService.deployStack(request.params.id);
    });

    // Stop stack
    app.post("/api/stacks/:id/stop", {
        schema: {params: stackParamsSchema},
    }, async (request) => {
        await stackService.stopStack(request.params.id);
        return {success: true};
    });

    // Restart stack
    app.post("/api/stacks/:id/restart", {
        schema: {params: stackParamsSchema},
    }, async (request) => {
        await stackService.restartStack(request.params.id);
        return {success: true};
    });

    // Trigger image pull + container recreate (user-initiated, never automatic)
    app.post("/api/stacks/:id/update", {
        schema: {params: stackParamsSchema},
    }, async (request) => {
        const result = await stackService.updateImages(request.params.id);
        return {success: true, noUpdates: result.noUpdates};
    });

    // Get compose file content
    app.get("/api/stacks/:id/compose", {
        schema: {params: stackParamsSchema},
    }, async (request) => {
        const content = await stackService.getComposeContent(
            request.params.id,
        );
        return {content};
    });

    // Get env file content
    app.get("/api/stacks/:id/env", {
        schema: {params: stackParamsSchema},
    }, async (request) => {
        const content = await stackService.getEnvContent(
            request.params.id,
        );
        return {content};
    });

    // Get live container statuses
    app.get("/api/stacks/:id/containers", {
        schema: {params: stackParamsSchema},
    }, async (request) => {
        return stackService.getContainerStatuses(request.params.id);
    });

    // Get persisted upgrade candidates for one service — reads only what the
    // staggered background check already persisted, never the registry.
    app.get("/api/stacks/:id/services/:serviceName/tags", {
        schema: {params: stackServiceParamsSchema},
    }, async (request) => {
        const {id, serviceName} = request.params;
        return stackService.getUpgradeCandidates(id, serviceName);
    });

    // Upgrade a service to a specific version — rewrites the compose file
    // and deploys it (user-initiated, never automatic; see UPD-04)
    app.post("/api/stacks/:id/services/:serviceName/upgrade", {
        schema: {params: upgradeServiceParamsSchema, body: upgradeServiceSchema},
    }, async (request) => {
        const {id, serviceName} = request.params;
        const stack = await stackService.getStack(id);
        if (!stack) throw new NotFoundError("Stack not found");
        if (!stack.services.some((s) => s.serviceName === serviceName)) {
            throw new NotFoundError("Service not found");
        }
        const result = await stackService.upgradeServiceImage(id, serviceName, request.body.targetTag);
        return {...result, success: true};
    });

    // Events query schema
    const eventsQuerySchema = z.object({
        limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    })

    // Get the StackEvent audit trail (config_changed, config_error,
    // update_available) for one stack, newest first. Deliberately a
    // different thing from the status transitions already carried by the
    // stack detail payload — the UAT gap that led to this route was a
    // naming collision between the two.
    app.get("/api/stacks/:id/events", {
        schema: {params: stackParamsSchema, querystring: eventsQuerySchema},
    }, async (request) => {
        const {id} = request.params
        const {limit} = request.query
        return stackService.getStackEvents(id, limit)
    })

    // Log stream query schema
    const logQuerySchema = z.object({
        service: z.string().optional().default("all"),
    })

    // Stream logs via SSE
    app.get("/api/stacks/:id/logs", {
        schema: {params: stackParamsSchema, querystring: logQuerySchema},
    }, async (request, reply) => {
        const {id} = request.params
        const {service} = request.query

        // Resolves the stack's services with a running container, applies
        // the "all"-vs-named-service filter, and opens a log stream per
        // match. Throws NotFoundError("Stack not found") for an unknown
        // stack, which the global error handler turns into the same 404
        // this route always sent.
        const targets = await logService.openLogStreams(id, service)

        if (targets.length === 0) {
            return reply.status(400).send({error: `No running containers for service "${service}"`})
        }

        reply.raw.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        })
        reply.raw.write(": connected\n\n")

        const streams: NodeJS.ReadableStream[] = []

        for (const target of targets) {
            streams.push(target.stream)

            target.stream.on("data", (chunk: Buffer) => {
                processDockerLogChunk(chunk, target.serviceName, (event) => {
                    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
                })
            })
        }

        // MANDATORY: destroy all streams on client disconnect
        request.raw.on("close", () => {
            streams.forEach(s => (s as any).destroy())
        })

        await new Promise<void>((resolve) => {
            request.raw.on("close", resolve)
        })
    })
};

export default stackRoutes;
