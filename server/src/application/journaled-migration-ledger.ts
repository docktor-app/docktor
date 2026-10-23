import type {MigrationJournalDocument, MigrationLedgerEntry} from "@docktor/shared";
import {InMemoryMigrationLedger, type MigrationLedger} from "../domain/migration-rollback.js";
import type {MigrationJournalPort} from "./ports/migration-journal-port.js";

/**
 * The write-ahead journal of one migration run (D-06): every entry is in the
 * journal on disk before `record` resolves, and the run awaits `record` before
 * the next side effect, so a restart always finds what the run did (or was
 * about to do). The entry is kept in memory first: an entry recorded after its
 * side effect must still be rolled back in this process when the write fails.
 */
export class JournaledMigrationLedger implements MigrationLedger {
    private readonly recorded = new InMemoryMigrationLedger();

    constructor(
        private readonly journal: MigrationJournalPort,
        private readonly document: Omit<MigrationJournalDocument, "ledger">,
    ) {}

    /** Writes the journal with an empty ledger; the run only starts once this resolved. */
    async start(): Promise<void> {
        await this.persist();
    }

    async record(entry: MigrationLedgerEntry): Promise<void> {
        await this.recorded.record(entry);
        await this.persist();
    }

    entries(): readonly MigrationLedgerEntry[] {
        return this.recorded.entries();
    }

    /** Removes the journal because the run ended and its outcome is recorded. */
    async discard(): Promise<void> {
        await this.journal.remove(this.document.operation.id);
    }

    private async persist(): Promise<void> {
        await this.journal.write({...this.document, ledger: [...this.recorded.entries()]});
    }
}
