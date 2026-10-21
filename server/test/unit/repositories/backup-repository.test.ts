import {beforeEach, describe, expect, it, vi} from "vitest";

const {groupBy} = vi.hoisted(() => ({groupBy: vi.fn()}));

vi.mock("../../../src/lib/db.js", () => ({
    prisma: {backup: {groupBy}},
}));

import {BackupRepository} from "../../../src/repositories/backup-repository.js";

describe("BackupRepository.findStackIdsWithSnapshot", () => {
    beforeEach(() => {
        groupBy.mockReset();
    });

    it("runs one groupBy over completed manual and scheduled backups (D-04)", async () => {
        groupBy.mockResolvedValue([]);

        await new BackupRepository().findStackIdsWithSnapshot();

        expect(groupBy).toHaveBeenCalledTimes(1);
        expect(groupBy).toHaveBeenCalledWith({
            by: ["stackId"],
            where: {status: "COMPLETED", trigger: {in: ["MANUAL", "SCHEDULED"]}},
        });
    });

    it("returns the grouped stack ids as a Set", async () => {
        groupBy.mockResolvedValue([{stackId: "a"}, {stackId: "b"}]);

        const ids = await new BackupRepository().findStackIdsWithSnapshot();

        expect(ids).toEqual(new Set(["a", "b"]));
    });

    it("returns an empty Set when no stack has a snapshot", async () => {
        groupBy.mockResolvedValue([]);

        const ids = await new BackupRepository().findStackIdsWithSnapshot();

        expect(ids.size).toBe(0);
    });
});
