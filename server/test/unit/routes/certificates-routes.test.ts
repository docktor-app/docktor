import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

// Both mocks are mandatory: without them, importing the real route module
// transitively loads better-auth (database module graph) and the Prisma-backed
// application services this test exists to avoid needing a database for.
const requireAuth = vi.fn(async () => undefined);
vi.mock("../../../src/lib/auth-middleware.js", () => ({
    requireAuth: (...args: unknown[]) => requireAuth(...args),
}));

const create = vi.fn(async () => ({
    id: "cert1",
    domainPattern: "*.example.com",
    expiresAt: "2027-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
}));
const listAll = vi.fn(async () => []);
const del = vi.fn(async () => undefined);

vi.mock("../../../src/application/index.js", () => ({
    certificateService: {
        create: (...args: unknown[]) => create(...args),
        listAll: (...args: unknown[]) => listAll(...args),
        delete: (...args: unknown[]) => del(...args),
    },
}));

import Fastify from "fastify";
import {serializerCompiler, validatorCompiler, type ZodTypeProvider} from "fastify-type-provider-zod";
import certificateRoutes from "../../../src/routes/certificates.js";

async function buildTestApp() {
    const app = Fastify({logger: false}).withTypeProvider<ZodTypeProvider>();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(certificateRoutes);
    return app;
}

function buildMultipartBody(
    fields: Record<string, string>,
    files: Record<string, {filename: string; content: string; contentType?: string}>,
) {
    const boundary = "----testboundary0123456789";
    const lines: string[] = [];

    for (const [name, value] of Object.entries(fields)) {
        lines.push(`--${boundary}`);
        lines.push(`Content-Disposition: form-data; name="${name}"`);
        lines.push("");
        lines.push(value);
    }

    for (const [name, file] of Object.entries(files)) {
        lines.push(`--${boundary}`);
        lines.push(`Content-Disposition: form-data; name="${name}"; filename="${file.filename}"`);
        lines.push(`Content-Type: ${file.contentType ?? "application/octet-stream"}`);
        lines.push("");
        lines.push(file.content);
    }

    lines.push(`--${boundary}--`);
    lines.push("");

    return {
        payload: lines.join("\r\n"),
        headers: {"content-type": `multipart/form-data; boundary=${boundary}`},
    };
}

const CERT_URL = "/api/certificates";

describe("POST /api/certificates", () => {
    let app: Awaited<ReturnType<typeof buildTestApp>>;

    beforeEach(async () => {
        app = await buildTestApp();
    });

    afterEach(async () => {
        requireAuth.mockClear();
        requireAuth.mockImplementation(async () => undefined);
        create.mockClear();
        listAll.mockClear();
        del.mockClear();
        await app.close();
    });

    it("returns 201 with a body containing id, domainPattern, and expiresAt for a valid multipart upload", async () => {
        const {payload, headers} = buildMultipartBody(
            {domainPattern: "*.example.com"},
            {
                certificate: {filename: "cert.pem", content: "-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----"},
                privateKey: {filename: "key.pem", content: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----"},
            },
        );

        const res = await app.inject({method: "POST", url: CERT_URL, payload, headers});

        expect(res.statusCode).toBe(201);
        const body = res.json();
        expect(body).toHaveProperty("id");
        expect(body).toHaveProperty("domainPattern");
        expect(body).toHaveProperty("expiresAt");
        expect(create).toHaveBeenCalledTimes(1);
    });

    it("never includes privateKey, certificate, or caBundle in the response body", async () => {
        const {payload, headers} = buildMultipartBody(
            {domainPattern: "*.example.com"},
            {
                certificate: {filename: "cert.pem", content: "-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----"},
                privateKey: {filename: "key.pem", content: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----"},
            },
        );

        const res = await app.inject({method: "POST", url: CERT_URL, payload, headers});

        const serialized = res.body;
        expect(serialized).not.toContain("privateKey");
        expect(serialized).not.toContain("caBundle");
        expect(serialized).not.toContain("BEGIN");
    });

    it("returns 400 without calling the service when domainPattern fails the shared pattern regex", async () => {
        const {payload, headers} = buildMultipartBody(
            {domainPattern: "not a hostname"},
            {
                certificate: {filename: "cert.pem", content: "-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----"},
                privateKey: {filename: "key.pem", content: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----"},
            },
        );

        const res = await app.inject({method: "POST", url: CERT_URL, payload, headers});

        expect(res.statusCode).toBe(400);
        expect(create).not.toHaveBeenCalled();
    });

    it("never reaches the handler when the authentication hook rejects the request", async () => {
        requireAuth.mockImplementation(async (_request: unknown, reply: any) => {
            return reply.status(401).send({error: "Unauthorized"});
        });

        const {payload, headers} = buildMultipartBody(
            {domainPattern: "*.example.com"},
            {
                certificate: {filename: "cert.pem", content: "-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----"},
                privateKey: {filename: "key.pem", content: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----"},
            },
        );

        const res = await app.inject({method: "POST", url: CERT_URL, payload, headers});

        expect(res.statusCode).toBe(401);
        expect(create).not.toHaveBeenCalled();
    });
});
