import type {FastifyPluginAsyncZod} from "fastify-type-provider-zod";
import multipart from "@fastify/multipart";
import {z} from "zod";
import {createCertificateSchema} from "@docktor/shared";
import {requireAuth} from "../lib/auth-middleware.js";
import {certificateService} from "../application/index.js";
import {BadRequestError} from "../lib/errors.js";

// Certificates and keys are small PEM text — anything larger than this is
// not a certificate, and this limit is the denial-of-service mitigation
// (T-09-32) for this route's file-upload surface.
export const CERT_UPLOAD_MAX_BYTES = 64 * 1024;

// @fastify/multipart's own code for a file exceeding limits.fileSize.
const MULTIPART_FILE_TOO_LARGE_CODE = "FST_REQ_FILE_TOO_LARGE";

const certificateParamsSchema = z.object({id: z.string()});

const certificateRoutes: FastifyPluginAsyncZod = async (app) => {
    app.addHook("onRequest", requireAuth);

    // Registered inside this plugin (encapsulated) so no other route's body
    // parsing changes.
    await app.register(multipart, {
        limits: {fileSize: CERT_UPLOAD_MAX_BYTES, files: 3, fields: 2},
    });

    app.get("/api/certificates", async () => {
        return certificateService.listAll();
    });

    app.post("/api/certificates", async (request, reply) => {
        const fields: Record<string, string> = {};
        const files: Record<string, Buffer> = {};

        try {
            for await (const part of request.parts()) {
                if (part.type === "file") {
                    files[part.fieldname] = await part.toBuffer();
                } else {
                    fields[part.fieldname] = String(part.value);
                }
            }
        } catch (err) {
            // server/src/app.ts's global error handler only maps AppError
            // subclasses, Zod validation errors, and error.name === "ZodError"
            // to a client-facing status — any other error (including this
            // one, which @fastify/multipart gives a real statusCode: 413)
            // falls through to a generic 500. Mapped explicitly here so an
            // over-limit upload is a 4xx, not an unhandled-looking 500.
            if (err && typeof err === "object" && "code" in err && err.code === MULTIPART_FILE_TOO_LARGE_CODE) {
                throw new BadRequestError("Uploaded file exceeds the certificate upload size limit");
            }
            throw err;
        }

        // A multipart body cannot use the {schema: {body: zodSchema}}
        // JSON-body mechanism the other routes use, so domainPattern is
        // validated here, explicitly, before the service is ever called.
        const parsedInput = createCertificateSchema.safeParse({domainPattern: fields.domainPattern});
        if (!parsedInput.success) {
            throw new BadRequestError(
                parsedInput.error.issues[0]?.message ?? "domainPattern is invalid",
            );
        }

        if (!files.certificate) {
            throw new BadRequestError("Missing required certificate file part");
        }
        if (!files.privateKey) {
            throw new BadRequestError("Missing required privateKey file part");
        }

        const created = await certificateService.create({
            domainPattern: parsedInput.data.domainPattern,
            certificatePem: files.certificate.toString("utf-8"),
            privateKeyPem: files.privateKey.toString("utf-8"),
            caBundlePem: files.caBundle ? files.caBundle.toString("utf-8") : null,
        });

        return reply.status(201).send(created);
    });

    app.delete(
        "/api/certificates/:id",
        {schema: {params: certificateParamsSchema}},
        async (request, reply) => {
            await certificateService.delete(request.params.id);
            return reply.status(204).send();
        },
    );
};

export default certificateRoutes;
