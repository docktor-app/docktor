import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

// Both mocks are mandatory: without them, importing the real route module
// transitively loads better-auth (database module graph) and the Prisma-backed
// application services this test exists to avoid needing a database for.
vi.mock("../../../src/lib/auth-middleware.js", () => ({
    requireAuth: vi.fn(async () => undefined),
}));

const assignDomain = vi.fn(async () => ({id: "pc1", domain: "app.example.com"}));

vi.mock("../../../src/application/index.js", () => ({
    proxyService: {
        listByStack: vi.fn(),
        assignDomain: (...args: unknown[]) => assignDomain(...args),
        removeDomain: vi.fn(),
        getProxyStackState: vi.fn(),
        updateProxySettingsAndSync: vi.fn(),
        deployProxyStack: vi.fn(),
    },
}));

import Fastify from "fastify";
import {serializerCompiler, validatorCompiler, type ZodTypeProvider} from "fastify-type-provider-zod";
import proxyRoutes from "../../../src/routes/proxy.js";

async function buildTestApp() {
    const app = Fastify({logger: false}).withTypeProvider<ZodTypeProvider>();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(proxyRoutes);
    return app;
}

const POST_URL = "/api/stacks/web-stack/services/web/proxy";

describe("POST /api/stacks/:id/services/:serviceName/proxy — request validation", () => {
    let app: Awaited<ReturnType<typeof buildTestApp>>;

    beforeEach(async () => {
        app = await buildTestApp();
    });

    afterEach(async () => {
        assignDomain.mockClear();
        await app.close();
    });

    it("rejects the exact G-06-3 payload with 400 and never calls assignDomain", async () => {
        const res = await app.inject({
            method: "POST",
            url: POST_URL,
            payload: {domain: "not a hostname", internalPort: 8080, tlsEnabled: true},
        });

        expect(res.statusCode).toBe(400);
        expect(assignDomain).not.toHaveBeenCalled();
    });

    it.each([
        ["a dotless label", "nodot"],
        ["a leading-hyphen label", "-bad.example.com"],
        ["a trailing-hyphen label", "bad-.example.com"],
        ["an over-long label", `${"a".repeat(64)}.example.com`],
        ["an empty domain", ""],
    ])("rejects %s with 400", async (_description, domain) => {
        const res = await app.inject({
            method: "POST",
            url: POST_URL,
            payload: {domain, internalPort: 8080, tlsEnabled: true},
        });

        expect(res.statusCode).toBe(400);
        expect(assignDomain).not.toHaveBeenCalled();
    });

    it("rejects an out-of-range internalPort with 400", async () => {
        const res = await app.inject({
            method: "POST",
            url: POST_URL,
            payload: {domain: "app.example.com", internalPort: 70000, tlsEnabled: true},
        });

        expect(res.statusCode).toBe(400);
        expect(assignDomain).not.toHaveBeenCalled();
    });

    it("accepts a valid payload with 201 and calls assignDomain exactly once", async () => {
        const res = await app.inject({
            method: "POST",
            url: POST_URL,
            payload: {domain: "app.example.com", internalPort: 8080, tlsEnabled: true},
        });

        expect(res.statusCode).toBe(201);
        expect(assignDomain).toHaveBeenCalledTimes(1);
    });

    it("lowercases a mixed-case domain before it reaches assignDomain", async () => {
        const res = await app.inject({
            method: "POST",
            url: POST_URL,
            payload: {domain: "APP.Example.COM", internalPort: 8080, tlsEnabled: true},
        });

        expect(res.statusCode).toBe(201);
        expect(assignDomain).toHaveBeenCalledTimes(1);
        expect(assignDomain).toHaveBeenCalledWith(
            "web-stack",
            "web",
            expect.objectContaining({domain: "app.example.com"}),
        );
    });
});
