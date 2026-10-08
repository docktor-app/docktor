import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import type {FastifyInstance} from "fastify";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type {AddressInfo} from "node:net";
import type Dockerode from "dockerode";
import {cleanDatabase, createTestUser, getApp, getPrisma, startContainer, stopContainer} from "./setup.js";
import {domainEventBus} from "../../src/infrastructure/event-bus.js";
import {StackFilesystem} from "../../src/infrastructure/stack-filesystem.js";
import {ProbeTransport} from "../../src/infrastructure/probe-transport.js";
import {stackRepository} from "../../src/repositories/index.js";
import {HealthProbeJob} from "../../src/jobs/health-probe-job.js";

interface HealthEventBody {
    serviceName: string;
    fromStatus: string | null;
    toStatus: string | null;
    source: string;
    message: string | null;
}

interface UptimeBody {
    incidents: Array<{cause: string; endedAt: string | null}>;
}

// Started long before the test, so no startup grace applies to the failures.
const STARTED_AT = new Date(Date.now() - 60 * 60_000).toISOString();
const TICK_MS = 30_001;

function composeWithProbe(port: number): string {
    return [
        "services:",
        "  web:",
        "    image: nginx",
        "    x-docktor:",
        "      health-probe:",
        `        url: http://localhost:${port}/health`,
        "",
    ].join("\n");
}

describe("HTTP health probe pipeline (#23)", () => {
    let app: FastifyInstance;
    let cookie: string;
    let stacksRoot: string;
    let server: http.Server;
    let serverStatus: number;
    let clockNow: number;
    let job: HealthProbeJob;
    // A fresh stack id per test: the application singletons (incident tracker,
    // probe state) cache per stack and would otherwise carry state across the
    // database cleanup between tests.
    let stackId: string;
    let stackCounter = 0;

    beforeAll(async () => {
        await startContainer();
        app = await getApp();
        stacksRoot = await fs.mkdtemp(path.join(os.tmpdir(), "docktor-probe-test-"));
        process.env.DOCKTOR_STACKS_DIR = stacksRoot;
        server = http.createServer((_req, res) => res.writeHead(serverStatus).end());
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    }, 60_000);

    afterAll(async () => {
        try {
            await cleanDatabase();
        } finally {
            server.closeAllConnections();
            await new Promise<void>((resolve) => server.close(() => resolve()));
            await stopContainer();
            await fs.rm(stacksRoot, {recursive: true, force: true}).catch(() => {});
        }
    });

    beforeEach(async () => {
        await cleanDatabase();
        cookie = (await createTestUser()).cookie;
        serverStatus = 200;
        clockNow = Date.now();
        stackId = `probe-${++stackCounter}`;

        const port = (server.address() as AddressInfo).port;
        const hostPath = path.join(stacksRoot, stackId);
        await fs.mkdir(hostPath, {recursive: true});
        await fs.writeFile(path.join(hostPath, "docker-compose.yml"), composeWithProbe(port), "utf-8");
        await getPrisma().stack.create({data: {id: stackId, displayName: stackId, hostPath, status: "RUNNING"}});
        await getPrisma().service.create({
            data: {
                stackId,
                serviceName: "web",
                image: "nginx",
                containerId: "c1",
                containerState: "running",
                healthStatus: null,
            },
        });

        // Docker is faked: the container "lives" on loopback, where the local server listens.
        const docker = {
            inspectContainer: vi.fn(async () => ({
                State: {StartedAt: STARTED_AT},
                Config: {Labels: {}},
                NetworkSettings: {Networks: {probe_default: {IPAddress: "127.0.0.1"}}},
            }) as unknown as Dockerode.ContainerInspectInfo),
        };
        job = new HealthProbeJob({
            store: {listStacks: () => stackRepository.findAll()},
            readCompose: (id) => new StackFilesystem().readCompose(id),
            transport: new ProbeTransport(docker),
            bus: domainEventBus,
            now: () => clockNow,
        });
    });

    afterEach(() => {
        job.stop();
    });

    async function tick(): Promise<void> {
        await (job as unknown as {run(): Promise<void>}).run();
        clockNow += TICK_MS;
    }

    async function healthEvents(): Promise<HealthEventBody[]> {
        const res = await app.inject({method: "GET", url: `/api/stacks/${stackId}/health-events`, headers: {cookie}});
        expect(res.statusCode).toBe(200);
        return res.json() as HealthEventBody[];
    }

    async function stackStatus(): Promise<string> {
        const res = await app.inject({method: "GET", url: `/api/stacks/${stackId}`, headers: {cookie}});
        expect(res.statusCode).toBe(200);
        return (res.json() as {status: string}).status;
    }

    async function incidents(): Promise<UptimeBody["incidents"]> {
        const res = await app.inject({method: "GET", url: `/api/stacks/${stackId}/uptime`, headers: {cookie}});
        expect(res.statusCode).toBe(200);
        return (res.json() as UptimeBody).incidents;
    }

    it("turns a stack healthy on a 200 and unhealthy after three failed checks, opening one incident", async () => {
        // First tick only schedules the probe inside its stagger window.
        await tick();
        await tick();

        await expect.poll(async () => (await healthEvents()).length, {timeout: 5000}).toBe(1);
        const [healthy] = await healthEvents();
        expect(healthy).toMatchObject({
            serviceName: "web",
            fromStatus: null,
            toStatus: "healthy",
            source: "http-probe",
            message: "Responded with HTTP 200",
        });
        await expect.poll(stackStatus, {timeout: 5000}).toBe("HEALTHY");

        serverStatus = 503;
        await tick();
        await tick();
        await tick();

        await expect.poll(async () => (await healthEvents())[0]?.toStatus, {timeout: 5000}).toBe("unhealthy");
        const [unhealthy] = await healthEvents();
        expect(unhealthy).toMatchObject({
            serviceName: "web",
            fromStatus: "healthy",
            toStatus: "unhealthy",
            source: "http-probe",
            message: "Responded with HTTP 503 after 3 failed checks",
        });
        await expect.poll(stackStatus, {timeout: 5000}).toBe("UNHEALTHY");
        await expect.poll(async () => (await incidents()).length, {timeout: 5000}).toBe(1);
        expect((await incidents())[0]).toMatchObject({cause: "UNHEALTHY", endedAt: null});
    });

    it("records nothing while the response stays the same", async () => {
        await tick();
        await tick();
        await expect.poll(async () => (await healthEvents()).length, {timeout: 5000}).toBe(1);

        await tick();
        await tick();
        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(await healthEvents()).toHaveLength(1);
    });
});
