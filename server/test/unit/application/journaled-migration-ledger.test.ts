import {describe, expect, it, vi} from "vitest";
import type {MigrationJournalDocument, MigrationLedgerEntry, MigrationOperation} from "@docktor/shared";
import {JournaledMigrationLedger} from "../../../src/application/journaled-migration-ledger.js";
import type {MigrationJournalPort} from "../../../src/application/ports/migration-journal-port.js";

const OPERATION: MigrationOperation = {
    id: "op-1",
    stackId: "my-app",
    displayName: "My App",
    composePath: "/opt/app/docker-compose.yml",
    backup: true,
    stopOldStack: true,
    status: "running",
    step: "starting",
    stepDetail: null,
    startedAt: "2026-01-01T10:00:00.000Z",
    finishedAt: null,
    result: null,
};

const CREATED: MigrationLedgerEntry = {kind: "created_directory", stackId: "my-app"};
const RECORD: MigrationLedgerEntry = {kind: "created_record", stackId: "my-app"};

function fakeJournal(): {journal: MigrationJournalPort; write: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>} {
    const write = vi.fn(async (_document: MigrationJournalDocument) => undefined);
    const remove = vi.fn(async (_operationId: string) => undefined);
    return {journal: {write, remove, list: vi.fn()}, write, remove};
}

function ledgerWith(journal: MigrationJournalPort): JournaledMigrationLedger {
    return new JournaledMigrationLedger(journal, {version: 1, operation: OPERATION, originalDir: "/opt/app"});
}

describe("JournaledMigrationLedger", () => {
    it("start writes the document with an empty ledger", async () => {
        const {journal, write} = fakeJournal();

        await ledgerWith(journal).start();

        expect(write).toHaveBeenCalledWith({version: 1, operation: OPERATION, originalDir: "/opt/app", ledger: []});
    });

    it("record appends the entry and writes the whole document before it resolves", async () => {
        const {journal, write} = fakeJournal();
        const ledger = ledgerWith(journal);
        await ledger.start();

        await ledger.record(CREATED);
        await ledger.record(RECORD);

        expect(write).toHaveBeenCalledTimes(3);
        expect(write.mock.calls[1]?.[0]).toMatchObject({ledger: [CREATED]});
        expect(write.mock.calls[2]?.[0]).toMatchObject({ledger: [CREATED, RECORD]});
        expect(ledger.entries()).toEqual([CREATED, RECORD]);
    });

    it("does not resolve record before the write finished", async () => {
        const {journal, write} = fakeJournal();
        let finish!: () => void;
        write.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
        const ledger = ledgerWith(journal);
        let resolved = false;

        const recording = ledger.record(CREATED).then(() => {
            resolved = true;
        });
        await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1));
        expect(resolved).toBe(false);
        finish();
        await recording;

        expect(resolved).toBe(true);
    });

    it("rejects record when the write fails, so the side effect after it never runs", async () => {
        const {journal, write} = fakeJournal();
        const ledger = ledgerWith(journal);
        await ledger.start();
        write.mockRejectedValueOnce(new Error("disk full"));

        await expect(ledger.record(CREATED)).rejects.toThrow("disk full");
    });

    it("start rejects when the first write fails", async () => {
        const {journal, write} = fakeJournal();
        write.mockRejectedValueOnce(new Error("read-only"));

        await expect(ledgerWith(journal).start()).rejects.toThrow("read-only");
    });

    it("discard removes the journal of the operation", async () => {
        const {journal, remove} = fakeJournal();

        await ledgerWith(journal).discard();

        expect(remove).toHaveBeenCalledWith("op-1");
    });
});
