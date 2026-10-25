import {describe, expect, it, vi} from "vitest";
import type {MigrationJournalDocument, MigrationOperation} from "@docktor/shared";
import {MigrationRecoveryService} from "../../../src/application/migration-recovery-service.js";
import type {MigrationJournalPort} from "../../../src/application/ports/migration-journal-port.js";

const OPERATION: MigrationOperation = {
    id: "op-1",
    stackId: "my-app",
    displayName: "My App",
    composePath: "/opt/app/docker-compose.yml",
    backup: true,
    stopOldStack: true,
    status: "running",
    step: "deploying",
    stepDetail: null,
    startedAt: "2026-01-01T10:00:00.000Z",
    finishedAt: null,
    result: null,
};

const DOCUMENT: MigrationJournalDocument = {version: 1, operation: OPERATION, originalDir: "/opt/app", ledger: []};

function setup(listing: Awaited<ReturnType<MigrationJournalPort["list"]>> | Error) {
    const list = vi.fn(async () => {
        if (listing instanceof Error) {
            throw listing;
        }
        return listing;
    });
    const journal: MigrationJournalPort = {write: vi.fn(), remove: vi.fn(), list};
    const run = vi.fn(async () => undefined);
    const recoverInterrupted = vi.fn((documents: readonly MigrationJournalDocument[]) => ({count: documents.length, run}));
    const logger = {info: vi.fn(), error: vi.fn()};
    return {service: new MigrationRecoveryService(journal, {recoverInterrupted}, logger), recoverInterrupted, run, logger};
}

describe("MigrationRecoveryService.prepare", () => {
    it("returns a no-op without touching the operations when nothing is journalled", async () => {
        const {service, recoverInterrupted, logger} = setup({documents: [], invalid: []});

        const recovery = await service.prepare();

        expect(recovery.count).toBe(0);
        await expect(recovery.run()).resolves.toBeUndefined();
        expect(recoverInterrupted).not.toHaveBeenCalled();
        expect(logger.info).not.toHaveBeenCalled();
    });

    it("logs the number of interrupted migrations and delegates them to the operation service", async () => {
        const {service, recoverInterrupted, run, logger} = setup({documents: [DOCUMENT], invalid: []});

        const recovery = await service.prepare();

        expect(recoverInterrupted).toHaveBeenCalledWith([DOCUMENT]);
        expect(recovery.count).toBe(1);
        expect(logger.info).toHaveBeenCalledWith(expect.stringMatching(/^\[migration-recovery\].*1/));
        expect(run).not.toHaveBeenCalled();
        await recovery.run();
        expect(run).toHaveBeenCalledTimes(1);
    });

    it("logs every invalid journal with the prefix and still recovers the valid ones", async () => {
        const {service, recoverInterrupted, logger} = setup({documents: [DOCUMENT], invalid: ["broken.json", "old.json"]});

        const recovery = await service.prepare();

        expect(logger.error).toHaveBeenCalledTimes(2);
        expect(logger.error).toHaveBeenCalledWith(expect.stringMatching(/^\[migration-recovery\].*broken\.json/));
        expect(logger.error).toHaveBeenCalledWith(expect.stringMatching(/^\[migration-recovery\].*old\.json/));
        expect(recoverInterrupted).toHaveBeenCalledWith([DOCUMENT]);
        expect(recovery.count).toBe(1);
    });

    it("never rejects: a list failure is logged and yields the no-op", async () => {
        const {service, recoverInterrupted, logger} = setup(new Error("EACCES: permission denied"));

        const recovery = await service.prepare();

        expect(recovery.count).toBe(0);
        await expect(recovery.run()).resolves.toBeUndefined();
        expect(recoverInterrupted).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalledWith(expect.stringMatching(/^\[migration-recovery\].*EACCES/));
    });

    it("never rejects when the operation service throws while registering the recovery", async () => {
        const {service, recoverInterrupted, logger} = setup({documents: [DOCUMENT], invalid: []});
        recoverInterrupted.mockImplementation(() => {
            throw new Error("boom");
        });

        const recovery = await service.prepare();

        expect(recovery.count).toBe(0);
        expect(logger.error).toHaveBeenCalledWith(expect.stringMatching(/^\[migration-recovery\].*boom/));
    });
});
