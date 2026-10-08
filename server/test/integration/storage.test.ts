import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import type {FastifyInstance} from "fastify";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {cleanDatabase, createTestUser, getApp, getPrisma, startContainer, stopContainer} from "./setup.js";
import {DiskUsageJob} from "../../src/jobs/disk-usage-job.js";
import type {DiskUsageScannerPort} from "../../src/application/ports/disk-usage-scanner-port.js";

const COMPOSE = "services:\n  web:\n    image: nginx:1.27\n";

interface StorageBody {
    measuredAt: string | null;
    totals: {volumesBytes: number | null; backupsBytes: number | null; totalBytes: number | null};
    stacks: Array<{
        stackId: string;
        displayName: string;
        volumeSizeBytes: number | null;
        measuredAt: string | null;
        volumes: Array<{name: string; sizeBytes: number}>;
    }>;
    backups: Array<{stackId: string; displayName: string; sizeBytes: number}>;
}

/** A scanner that never touches the filesystem or runs du (the dev host is Windows). */
function fakeScanner(volumes: Record<string, number>): DiskUsageScannerPort {
    return {
        listVolumeDirectories: vi.fn(async () => Object.keys(volumes)),
        measureBytes: vi.fn(async (p: string) => volumes[path.basename(p)] ?? null),
    };
}

describe("GET /api/storage (#27, D-13, D-15)", () => {
    let app: FastifyInstance;
    let cookie: string;
    let stacksRoot: string;

    beforeAll(async () => {
        await startContainer();
        app = await getApp();
        // POST /api/stacks writes the stack's compose file to disk; keep it
        // out of the repo's server/stacks directory.
        stacksRoot = await fs.mkdtemp(path.join(os.tmpdir(), "docktor-storage-test-"));
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

    async function fetchStorage(): Promise<StorageBody> {
        const res = await app.inject({method: "GET", url: "/api/storage", headers: {cookie}});
        expect(res.statusCode).toBe(200);
        return res.json() as StorageBody;
    }

    it("serves null totals and an unmeasured stack before the first scan", async () => {
        await createStack("disk-pending");

        const body = await fetchStorage();

        expect(body.measuredAt).toBeNull();
        expect(body.totals).toEqual({volumesBytes: null, backupsBytes: null, totalBytes: null});
        expect(body.stacks).toHaveLength(1);
        expect(body.stacks[0]).toMatchObject({stackId: "disk-pending", volumeSizeBytes: null, volumes: []});
        expect(body.backups).toEqual([]);
    });

    it("serves the measured volumes and totals after a scan, and keeps the stack endpoints working", async () => {
        const id = await createStack("disk-a");
        const job = new DiskUsageJob(undefined, fakeScanner({db: 1_048_576, uploads: 2048}));

        await job.kickoff();

        const body = await fetchStorage();
        expect(body.totals).toEqual({volumesBytes: 1_050_624, backupsBytes: 0, totalBytes: 1_050_624});
        expect(body.measuredAt).not.toBeNull();
        expect(body.stacks[0]).toMatchObject({stackId: id, volumeSizeBytes: 1_050_624});
        expect(body.stacks[0]!.volumes).toEqual([
            {name: "db", sizeBytes: 1_048_576},
            {name: "uploads", sizeBytes: 2048},
        ]);
        expect(body.backups).toEqual([]);

        // RESEARCH Finding 5: a non-null BigInt must not break the stack endpoints.
        const list = await app.inject({method: "GET", url: "/api/stacks", headers: {cookie}});
        expect(list.statusCode).toBe(200);
        const listed = (list.json() as Array<{id: string; volumeSizeBytes: unknown}>).find((s) => s.id === id);
        expect(listed?.volumeSizeBytes).toBe(1_050_624);

        const detail = await app.inject({method: "GET", url: `/api/stacks/${id}`, headers: {cookie}});
        expect(detail.statusCode).toBe(200);
        expect(detail.json().volumeSizeBytes).toBe(1_050_624);

        const update = await app.inject({
            method: "PUT",
            url: `/api/stacks/${id}`,
            headers: {cookie},
            payload: {description: "measured"},
        });
        expect(update.statusCode).toBe(200);
        expect(update.json().volumeSizeBytes).toBe(1_050_624);
    });

    it("replaces the per-volume rows on the next scan", async () => {
        const id = await createStack("disk-b");

        await new DiskUsageJob(undefined, fakeScanner({db: 4096, uploads: 2048})).kickoff();
        await new DiskUsageJob(undefined, fakeScanner({db: 8192})).kickoff();

        const rows = await getPrisma().stackVolumeUsage.findMany({where: {stackId: id}});
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({name: "db", sizeBytes: 8192n});
        const body = await fetchStorage();
        expect(body.totals.volumesBytes).toBe(8192);
    });

    it("lists a stack with a stored backup size in the backups list, largest first, and counts it in the total", async () => {
        const small = await createStack("disk-small");
        const big = await createStack("disk-big");
        await new DiskUsageJob(undefined, fakeScanner({db: 1024})).kickoff();
        const prisma = getPrisma();
        await prisma.stack.update({where: {id: small}, data: {backupSizeBytes: 100n}});
        await prisma.stack.update({where: {id: big}, data: {backupSizeBytes: 900n}});

        const body = await fetchStorage();

        expect(body.backups.map((b) => b.stackId)).toEqual([big, small]);
        expect(body.totals).toEqual({volumesBytes: 2048, backupsBytes: 1000, totalBytes: 3048});
    });

    it("returns 401 without a session cookie", async () => {
        const res = await app.inject({method: "GET", url: "/api/storage"});
        expect(res.statusCode).toBe(401);
    });
});
