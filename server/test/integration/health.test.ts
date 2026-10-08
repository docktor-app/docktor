import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import type {FastifyInstance} from "fastify";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {cleanDatabase, createTestUser, getApp, startContainer, stopContainer} from "./setup.js";
import {domainEventBus} from "../../src/infrastructure/event-bus.js";
import {stackRepository} from "../../src/repositories/index.js";
import type {ServiceHealthChangedEvent} from "../../src/domain/events.js";

interface HealthEventBody {
    serviceName: string;
    fromStatus: string | null;
    toStatus: string | null;
    source: string;
    message: string | null;
    createdAt: string;
}

const COMPOSE = "services:\n  web:\n    image: nginx:1.27\n  db:\n    image: postgres:16\n";

describe("GET /api/stacks/:id/health-events (#23, D-12)", () => {
    let app: FastifyInstance;
    let cookie: string;
    let stacksRoot: string;

    beforeAll(async () => {
        await startContainer();
        app = await getApp();
        // POST /api/stacks writes the stack's compose file to disk; keep it
        // out of the repo's server/stacks directory.
        stacksRoot = await fs.mkdtemp(path.join(os.tmpdir(), "docktor-health-test-"));
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

    function emitHealth(stackId: string, serviceName: string, fromStatus: string | null, toStatus: string | null): void {
        const payload: ServiceHealthChangedEvent = {
            stackId,
            serviceName,
            fromStatus,
            toStatus,
            source: "docker-healthcheck",
        };
        domainEventBus.emit("service.health_changed", payload);
    }

    async function fetchEvents(stackId: string, query = ""): Promise<HealthEventBody[]> {
        const res = await app.inject({
            method: "GET",
            url: `/api/stacks/${stackId}/health-events${query}`,
            headers: {cookie},
        });
        expect(res.statusCode).toBe(200);
        return res.json() as HealthEventBody[];
    }

    it("persists an emitted health transition and serves it newest first with the documented fields", async () => {
        const id = await createStack("health-a");

        emitHealth(id, "web", null, "healthy");

        await expect
            .poll(async () => (await fetchEvents(id)).length, {timeout: 2000})
            .toBe(1);
        const [entry] = await fetchEvents(id);
        expect(entry).toMatchObject({
            serviceName: "web",
            fromStatus: null,
            toStatus: "healthy",
            source: "docker-healthcheck",
            message: null,
        });
        expect(typeof entry?.createdAt).toBe("string");
    });

    it("keeps the history after replaceServices deletes and recreates the Service rows", async () => {
        const id = await createStack("health-b");
        emitHealth(id, "web", null, "healthy");
        await expect.poll(async () => (await fetchEvents(id)).length, {timeout: 2000}).toBe(1);

        await stackRepository.replaceServices(id, {
            hash: "h2",
            services: [{serviceName: "web", image: "nginx", imageTag: "1.28", ports: [], volumes: []}],
        } as Parameters<typeof stackRepository.replaceServices>[1]);

        const events = await fetchEvents(id);
        expect(events).toHaveLength(1);
        expect(events[0]?.toStatus).toBe("healthy");
    });

    it("filters by serviceName and returns [] for a service without history", async () => {
        const id = await createStack("health-c");
        emitHealth(id, "web", null, "healthy");
        await expect.poll(async () => (await fetchEvents(id)).length, {timeout: 2000}).toBe(1);

        expect(await fetchEvents(id, "?serviceName=other")).toEqual([]);
        expect(await fetchEvents(id, "?serviceName=web")).toHaveLength(1);
    });

    it("applies limit per service and orders the merged result newest first", async () => {
        const id = await createStack("health-d");

        // Sequential awaited polls keep createdAt strictly ordered across rows.
        const sequence: Array<[string, string | null, string | null]> = [
            ["web", null, "starting"],
            ["web", "starting", "healthy"],
            ["web", "healthy", "unhealthy"],
            ["db", null, "healthy"],
        ];
        for (const [index, [serviceName, from, to]] of sequence.entries()) {
            emitHealth(id, serviceName, from, to);
            await expect.poll(async () => (await fetchEvents(id, "?limit=200")).length, {timeout: 2000}).toBe(index + 1);
            await new Promise((resolve) => setTimeout(resolve, 5));
        }

        const events = await fetchEvents(id, "?limit=2");

        expect(events).toHaveLength(3);
        expect(events.filter((e) => e.serviceName === "web")).toHaveLength(2);
        expect(events.filter((e) => e.serviceName === "db")).toHaveLength(1);
        const times = events.map((e) => new Date(e.createdAt).getTime());
        expect(times).toEqual([...times].sort((a, b) => b - a));
        expect(events[0]?.serviceName).toBe("db");
        expect(events[1]?.toStatus).toBe("unhealthy");
    });

    it("returns 404 for an unknown stack", async () => {
        const res = await app.inject({method: "GET", url: "/api/stacks/no-such-stack/health-events", headers: {cookie}});
        expect(res.statusCode).toBe(404);
    });

    it("returns 401 without a session cookie", async () => {
        const id = await createStack("health-e");
        const res = await app.inject({method: "GET", url: `/api/stacks/${id}/health-events`});
        expect(res.statusCode).toBe(401);
    });

    it.each(["0", "201", "abc"])("returns 400 for limit=%s", async (limit) => {
        const id = await createStack(`health-f${limit}`);
        const res = await app.inject({
            method: "GET",
            url: `/api/stacks/${id}/health-events?limit=${limit}`,
            headers: {cookie},
        });
        expect(res.statusCode).toBe(400);
    });
});
