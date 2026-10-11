import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it} from "vitest";
import type {FastifyInstance} from "fastify";
import {cleanDatabase, createTestUser, getApp, startContainer, stopContainer} from "./setup.js";
import {setEnvironmentReport} from "../../src/lib/environment-report.js";

describe("GET /api/settings/environment (#7, D-13)", () => {
    let app: FastifyInstance;
    let cookie: string;

    beforeAll(async () => {
        await startContainer();
        app = await getApp();
    }, 60_000);

    afterAll(async () => {
        // try/finally: stopContainer() must run even if cleanDatabase() throws.
        try {
            await cleanDatabase();
        } finally {
            await stopContainer();
        }
    });

    beforeEach(async () => {
        await cleanDatabase();
        const user = await createTestUser();
        cookie = user.cookie;
    });

    afterEach(() => {
        setEnvironmentReport({warnings: []});
    });

    it("answers 401 without a session", async () => {
        const res = await app.inject({method: "GET", url: "/api/settings/environment"});

        expect(res.statusCode).toBe(401);
    });

    it("returns an empty warning list when the boot check stored nothing", async () => {
        const res = await app.inject({method: "GET", url: "/api/settings/environment", headers: {cookie}});

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({warnings: []});
    });

    it("returns exactly the warnings stored at boot", async () => {
        const warning = {
            code: "TRUST_PROXY_TRUSTS_ALL",
            variable: "TRUST_PROXY",
            message: "TRUST_PROXY is true, so every hop is trusted.",
        } as const;
        setEnvironmentReport({warnings: [warning]});

        const res = await app.inject({method: "GET", url: "/api/settings/environment", headers: {cookie}});

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({warnings: [warning]});
    });
});
