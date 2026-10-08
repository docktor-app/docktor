import {describe, expect, it, vi} from "vitest";
import {StorageService} from "../../../src/application/storage-service.js";
import type {StorageRow} from "../../../src/repositories/stack-disk-usage-repository.js";

function makeRow(overrides: Partial<StorageRow> & Pick<StorageRow, "stackId">): StorageRow {
    return {
        displayName: overrides.stackId,
        volumeSizeBytes: null,
        backupSizeBytes: null,
        measuredAt: null,
        volumes: [],
        ...overrides,
    };
}

function serviceWith(rows: StorageRow[]) {
    const repo = {findStorageRows: vi.fn().mockResolvedValue(rows)};
    return new StorageService(repo);
}

describe("StorageService.getStorageOverview (#27)", () => {
    it("returns null totals and an empty overview when nothing has been measured", async () => {
        const overview = await serviceWith([makeRow({stackId: "a"})]).getStorageOverview();

        expect(overview.measuredAt).toBeNull();
        expect(overview.totals).toEqual({volumesBytes: null, backupsBytes: null, totalBytes: null});
        expect(overview.backups).toEqual([]);
        expect(overview.stacks).toEqual([
            {stackId: "a", displayName: "a", volumeSizeBytes: null, measuredAt: null, volumes: []},
        ]);
    });

    it("serves volumes sorted by size then name, and totals = volumes + backups", async () => {
        const older = new Date("2026-10-07T00:15:00Z");
        const newer = new Date("2026-10-08T00:15:00Z");
        const overview = await serviceWith([
            makeRow({
                stackId: "a",
                volumeSizeBytes: 1_050_624,
                backupSizeBytes: 500,
                measuredAt: older,
                volumes: [
                    {name: "uploads", sizeBytes: 2048},
                    {name: "db", sizeBytes: 1_048_576},
                    {name: "cache", sizeBytes: 2048},
                ],
            }),
            makeRow({stackId: "b", volumeSizeBytes: 0, measuredAt: newer}),
        ]).getStorageOverview();

        expect(overview.stacks[0]!.volumes.map((v) => v.name)).toEqual(["db", "cache", "uploads"]);
        expect(overview.stacks[0]!.measuredAt).toBe(older.toISOString());
        expect(overview.measuredAt).toBe(newer.toISOString());
        expect(overview.totals).toEqual({volumesBytes: 1_050_624, backupsBytes: 500, totalBytes: 1_051_124});
    });

    it("lists backups only for stacks with a local repository, largest first", async () => {
        const at = new Date("2026-10-08T00:15:00Z");
        const overview = await serviceWith([
            makeRow({stackId: "small", displayName: "Small", volumeSizeBytes: 1, backupSizeBytes: 10, measuredAt: at}),
            makeRow({stackId: "none", volumeSizeBytes: 1, backupSizeBytes: null, measuredAt: at}),
            makeRow({stackId: "big", displayName: "Big", volumeSizeBytes: 1, backupSizeBytes: 900, measuredAt: at}),
        ]).getStorageOverview();

        expect(overview.backups).toEqual([
            {stackId: "big", displayName: "Big", sizeBytes: 900},
            {stackId: "small", displayName: "Small", sizeBytes: 10},
        ]);
    });
});
