import type {FastifyPluginAsync} from "fastify";
import {auth} from "../lib/auth.js";
import {CLIENT_IP_HEADER} from "../lib/auth-config.js";
import {toNodeHandler} from "better-auth/node";

const authRoutes: FastifyPluginAsync = async (app) => {
    const handler = toNodeHandler(auth);

    // Prevent Fastify from consuming the request body —
    // better-auth needs to read the raw stream itself.
    app.removeAllContentTypeParsers();
    app.addContentTypeParser("*", function (_request, _payload, done) {
        done(null);
    });

    app.all("/api/auth/*", async (request, reply) => {
        // Always overwrite: never trust a client-supplied copy of this header.
        // request.ip honours TRUST_PROXY (D-13): the TCP peer address by
        // default, the forwarded client only when the operator opted in.
        request.raw.headers[CLIENT_IP_HEADER] = request.ip;
        reply.hijack();
        return handler(request.raw, reply.raw);
    });
};

export default authRoutes;
