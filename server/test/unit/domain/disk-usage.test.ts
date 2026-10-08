import {describe, expect, it} from "vitest";
import {summarizeDiskUsage, type DiskUsageRow} from "../../../src/domain/disk-usage.js";

const at = new Date("2026-10-08T00:15:00Z");

function row(volumeSizeBytes: number | null, backupSizeBytes: number | null): DiskUsageRow {
    return {volumeSizeBytes, backupSizeBytes, measuredAt: volumeSizeBytes === null ? null : at};
}

describe("summarizeDiskUsage (#27, D-14 amended)", () => {
    it("returns null totals when there are no rows", () => {
        expect(summarizeDiskUsage([])).toEqual({volumesBytes: null, backupsBytes: null, totalBytes: null});
    });

    it("sums volumes and backups and excludes unmeasured stacks", () => {
        const totals = summarizeDiskUsage([row(100, 50), row(20, null), row(null, null)]);

        expect(totals).toEqual({volumesBytes: 120, backupsBytes: 50, totalBytes: 170});
    });

    it("reports zero backups when measured stacks have no local repository", () => {
        expect(summarizeDiskUsage([row(10, null)])).toEqual({volumesBytes: 10, backupsBytes: 0, totalBytes: 10});
    });

    it("returns null totals when no stack has been measured", () => {
        expect(summarizeDiskUsage([row(null, null), row(null, 5)])).toEqual({
            volumesBytes: null,
            backupsBytes: null,
            totalBytes: null,
        });
    });

    it("counts a measured zero-byte stack as measured", () => {
        expect(summarizeDiskUsage([row(0, null)])).toEqual({volumesBytes: 0, backupsBytes: 0, totalBytes: 0});
    });
});
