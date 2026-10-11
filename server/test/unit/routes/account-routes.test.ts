import {beforeEach, describe, expect, it, vi} from "vitest";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

// Both mocks are mandatory: without them, importing the route module loads
// better-auth and the Prisma-backed services this test must not need a
// database for. requireSession stands in for authentication and sets the user.
const requireSession = vi.fn(async (request: {user?: {id: string}}) => {
    request.user = {id: "u1"};
});
vi.mock("../../../src/lib/auth-middleware.js", () => ({
    requireSession: (...args: [{user?: {id: string}}]) => requireSession(...args),
}));

const status = {twoFactorEnabled: true, mandatory: true, enrollmentRequired: false};
const getStatus = vi.fn(async (_userId: string) => status);
const setMandatory = vi.fn(async (_userId: string, _enabled: boolean) => status);
vi.mock("../../../src/application/index.js", () => ({
    accountSecurityService: {
        getStatus: (userId: string) => getStatus(userId),
        setMandatory: (userId: string, enabled: boolean) => setMandatory(userId, enabled),
    },
}));

import Fastify from "fastify";
import {serializerCompiler, validatorCompiler, type ZodTypeProvider} from "fastify-type-provider-zod";
import accountRoutes from "../../../src/routes/account.js";

async function buildTestApp() {
    const app = Fastify({logger: false}).withTypeProvider<ZodTypeProvider>();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(accountRoutes);
    return app;
}

describe("account routes", () => {
    beforeEach(() => {
        requireSession.mockClear();
        getStatus.mockClear();
        setMandatory.mockClear();
    });

    it("GET /api/account/security returns the service status for the signed-in user", async () => {
        const app = await buildTestApp();

        const res = await app.inject({method: "GET", url: "/api/account/security"});

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual(status);
        expect(getStatus).toHaveBeenCalledWith("u1");
    });

    it("PUT /api/account/security/mandatory-2fa rejects a non-boolean body with 400", async () => {
        const app = await buildTestApp();

        const res = await app.inject({
            method: "PUT",
            url: "/api/account/security/mandatory-2fa",
            payload: {enabled: "yes"},
        });

        expect(res.statusCode).toBe(400);
        expect(setMandatory).not.toHaveBeenCalled();
    });

    it("PUT /api/account/security/mandatory-2fa passes the flag to the service", async () => {
        const app = await buildTestApp();

        const res = await app.inject({
            method: "PUT",
            url: "/api/account/security/mandatory-2fa",
            payload: {enabled: true},
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual(status);
        expect(setMandatory).toHaveBeenCalledWith("u1", true);
    });

    it("authenticates every route through requireSession", async () => {
        const app = await buildTestApp();

        await app.inject({method: "GET", url: "/api/account/security"});

        expect(requireSession).toHaveBeenCalledTimes(1);
    });
});

describe("account routes source", () => {
    it("registers requireSession and never the enrollment-gated requireAuth (would deadlock enrollment)", () => {
        const here = path.dirname(fileURLToPath(import.meta.url));
        const source = fs.readFileSync(path.resolve(here, "../../../src/routes/account.ts"), "utf-8");
        const importLines = source.split("\n").filter((line) => /^\s*import\b/.test(line));

        expect(importLines.some((line) => line.includes("requireSession"))).toBe(true);
        expect(importLines.some((line) => line.includes("requireAuth"))).toBe(false);
    });
});
