import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import type {FastifyInstance} from "fastify";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {cleanDatabase, createTestUser, getApp, getPrisma, startContainer, stopContainer} from "./setup.js";

const COMPOSE = "services:\n  web:\n    image: nginx:1.27\n";
const DAY = 86_400_000;
const HOUR = 3_600_000;

interface UptimeBody {
    stackId: string;
    windowDays: number;
    windowStart: string;
    since: string | null;
    percent: number | null;
    upMs: number;
    downMs: number;
    incidents: Array<{
        id: string;
        cause: string;
        startedAt: string;
        endedAt: string | null;
        durationMs: number | null;
    }>;
}

interface UptimeListBody {
    windowDays: number;
    stacks: Array<{stackId: string; percent: number | null}>;
}

describe("uptime read path (#24, D-09, D-10, D-16)", () => {
    let app: FastifyInstance;
    let cookie: string;
    let stacksRoot: string;

    beforeAll(async () => {
        await startContainer();
        app = await getApp();
        // POST /api/stacks writes the stack's compose file to disk; keep it
        // out of the repo's server/stacks directory.
        stacksRoot = await fs.mkdtemp(path.join(os.tmpdir(), "docktor-uptime-test-"));
        process.env.DOCKTOR_STACKS_DIR = stacksRoot;
    }, 60_000);

    afterAll(async () => {
        // try/finally: stopContainer() must run even if cleanDatabase() throws.
        try {
            await cleanDatabase();
        } finally {
            await stopContainer();
            await fs.rm(stacksRoot, {recursive: true, force: true}).catch(() => {});
        }
    });

    beforeEach(async () => {
        await cleanDatabase();
        const user = await createTestUser();
        cookie = user.cookie;
    });

    async function createStack(displayName: string): Promise<string> {
        const res = await app.inject({
            method: "POST",
            url: "/api/stacks",
            headers: {cookie},
            payload: {displayName, composeContent: COMPOSE},
        });
        expect(res.statusCode).toBe(201);
        return res.json().id as string;
    }

    async function logStatus(stackId: string, toStatus: "RUNNING" | "UNHEALTHY", createdAt: Date): Promise<void> {
        await getPrisma().statusLog.create({data: {stackId, toStatus, createdAt}});
    }

    async function putRetention(retentionDays: unknown): Promise<number> {
        const res = await app.inject({
            method: "PUT",
            url: "/api/settings/health",
            headers: {cookie},
            payload: {retentionDays},
        });
        return res.statusCode;
    }

    describe("/api/settings/health", () => {
        it("defaults to 30 days", async () => {
            const res = await app.inject({method: "GET", url: "/api/settings/health", headers: {cookie}});

            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual({retentionDays: 30});
        });

        it("saves a new window, returns it and serves it on the next GET", async () => {
            const put = await app.inject({
                method: "PUT",
                url: "/api/settings/health",
                headers: {cookie},
                payload: {retentionDays: 7},
            });
            const get = await app.inject({method: "GET", url: "/api/settings/health", headers: {cookie}});

            expect(put.statusCode).toBe(200);
            expect(put.json()).toEqual({retentionDays: 7});
            expect(get.json()).toEqual({retentionDays: 7});
        });

        it.each([0, 366, 1.5, "30"])("rejects retentionDays %j with 400 and keeps the stored value", async (value) => {
            expect(await putRetention(7)).toBe(200);

            expect(await putRetention(value)).toBe(400);

            const get = await app.inject({method: "GET", url: "/api/settings/health", headers: {cookie}});
            expect(get.json()).toEqual({retentionDays: 7});
        });

        it("returns 401 without a session cookie", async () => {
            expect((await app.inject({method: "GET", url: "/api/settings/health"})).statusCode).toBe(401);
            expect(
                (await app.inject({method: "PUT", url: "/api/settings/health", payload: {retentionDays: 7}})).statusCode,
            ).toBe(401);
        });
    });

    describe("GET /api/stacks/:id/uptime", () => {
        it("computes the percentage from StatusLog intervals over the default window", async () => {
            const id = await createStack("uptime-a");
            const now = Date.now();
            const first = new Date(now - 10 * DAY);
            await logStatus(id, "RUNNING", first);
            await logStatus(id, "UNHEALTHY", new Date(now - 9 * DAY));
            await logStatus(id, "RUNNING", new Date(now - 9 * DAY + 6 * HOUR));

            const res = await app.inject({method: "GET", url: `/api/stacks/${id}/uptime`, headers: {cookie}});

            expect(res.statusCode).toBe(200);
            const body = res.json() as UptimeBody;
            expect(body.stackId).toBe(id);
            expect(body.windowDays).toBe(30);
            expect(body.percent).toBeCloseTo(97.5, 1);
            expect(body.since).toBe(first.toISOString());
            expect(body.incidents).toEqual([]);
        });

        it("clamps since to the window start when the history began before the window", async () => {
            const id = await createStack("uptime-b");
            const now = Date.now();
            expect(await putRetention(7)).toBe(200);
            await logStatus(id, "RUNNING", new Date(now - 20 * DAY));
            await logStatus(id, "RUNNING", new Date(now - 10 * DAY));

            const res = await app.inject({method: "GET", url: `/api/stacks/${id}/uptime`, headers: {cookie}});

            const body = res.json() as UptimeBody;
            expect(body.windowDays).toBe(7);
            expect(body.since).toBe(body.windowStart);
            expect(body.percent).toBe(100);
        });

        it("lists incidents that intersect the window, newest first, with open ones ongoing", async () => {
            const id = await createStack("uptime-c");
            const now = Date.now();
            const prisma = getPrisma();
            await prisma.stackIncident.create({
                data: {
                    stackId: id,
                    triggerType: "ERROR",
                    createdAt: new Date(now - 40 * DAY),
                    resolvedAt: new Date(now - 35 * DAY),
                },
            });
            const spanning = await prisma.stackIncident.create({
                data: {
                    stackId: id,
                    triggerType: "UNHEALTHY",
                    createdAt: new Date(now - 31 * DAY),
                    resolvedAt: new Date(now - 29 * DAY),
                },
            });
            const open = await prisma.stackIncident.create({
                data: {stackId: id, triggerType: "ERROR", createdAt: new Date(now - HOUR)},
            });

            const res = await app.inject({method: "GET", url: `/api/stacks/${id}/uptime`, headers: {cookie}});

            const body = res.json() as UptimeBody;
            expect(body.incidents.map((i) => i.id)).toEqual([open.id, spanning.id]);
            expect(body.incidents[0]).toMatchObject({cause: "ERROR", endedAt: null, durationMs: null});
            expect(body.incidents[1]).toMatchObject({cause: "UNHEALTHY", durationMs: 2 * DAY});
        });

        it("returns a null percent for a stack without history", async () => {
            const id = await createStack("uptime-d");
            await getPrisma().statusLog.deleteMany({where: {stackId: id}});

            const res = await app.inject({method: "GET", url: `/api/stacks/${id}/uptime`, headers: {cookie}});

            expect(res.statusCode).toBe(200);
            expect(res.json()).toMatchObject({percent: null, since: null, upMs: 0, downMs: 0});
        });

        it("returns 404 for an unknown stack", async () => {
            const res = await app.inject({method: "GET", url: "/api/stacks/missing/uptime", headers: {cookie}});

            expect(res.statusCode).toBe(404);
        });

        it("returns 401 without a session cookie", async () => {
            const id = await createStack("uptime-e");

            const res = await app.inject({method: "GET", url: `/api/stacks/${id}/uptime`});

            expect(res.statusCode).toBe(401);
        });
    });

    describe("GET /api/uptime/stacks", () => {
        it("lists every stack with its percent, null for a stack without history", async () => {
            const withHistory = await createStack("uptime-f");
            const without = await createStack("uptime-g");
            await getPrisma().statusLog.deleteMany({where: {stackId: without}});
            await getPrisma().statusLog.deleteMany({where: {stackId: withHistory}});
            await logStatus(withHistory, "RUNNING", new Date(Date.now() - 2 * DAY));

            const res = await app.inject({method: "GET", url: "/api/uptime/stacks", headers: {cookie}});

            expect(res.statusCode).toBe(200);
            const body = res.json() as UptimeListBody;
            expect(body.windowDays).toBe(30);
            expect(body.stacks).toHaveLength(2);
            expect(body.stacks.find((s) => s.stackId === withHistory)?.percent).toBe(100);
            expect(body.stacks.find((s) => s.stackId === without)?.percent).toBeNull();
        });

        it("returns 401 without a session cookie", async () => {
            const res = await app.inject({method: "GET", url: "/api/uptime/stacks"});

            expect(res.statusCode).toBe(401);
        });

        it("still serves a stack named 'uptime' from GET /api/stacks/uptime (Pitfall 12)", async () => {
            const id = await createStack("uptime");
            expect(id).toBe("uptime");

            const res = await app.inject({method: "GET", url: "/api/stacks/uptime", headers: {cookie}});

            expect(res.statusCode).toBe(200);
            expect(res.json()).toMatchObject({id: "uptime"});
        });
    });
});
