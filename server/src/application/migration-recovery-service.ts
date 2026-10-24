import {migrationJournal} from "../infrastructure/migration-journal.js";
import {errorMessage} from "./migration-progress.js";
import {migrationOperationService, type MigrationOperationService, type MigrationRecovery} from "./migration-operation-service.js";
import type {MigrationJournalPort} from "./ports/migration-journal-port.js";

const NOTHING_TO_RECOVER: MigrationRecovery = {count: 0, run: () => Promise.resolve()};

/**
 * Boot-time recovery of migrations a Docktor restart interrupted (D-06). It is
 * split in two so it can never delay or break the server start (T-22-24):
 * `prepare` only reads the journal files and registers the operations (this is
 * what locks the stacks involved and shows them as rolling back), and the
 * returned `run`, started after the server listens and not awaited, does the
 * Docker and filesystem work. Neither of them rejects.
 */
export class MigrationRecoveryService {
    constructor(
        private readonly journal: MigrationJournalPort = migrationJournal,
        private readonly operations: Pick<MigrationOperationService, "recoverInterrupted"> = migrationOperationService,
        private readonly logger: Pick<Console, "info" | "error"> = console,
    ) {}

    async prepare(): Promise<MigrationRecovery> {
        try {
            const {documents, invalid} = await this.journal.list();
            for (const name of invalid) {
                this.logger.error(
                    `[migration-recovery] The migration journal file ${name} could not be read and was renamed to ${name}.invalid; it is ignored.`,
                );
            }
            if (documents.length === 0) {
                return NOTHING_TO_RECOVER;
            }
            this.logger.info(
                `[migration-recovery] Found ${documents.length} interrupted migration(s); rolling back once the server accepts requests.`,
            );
            return this.operations.recoverInterrupted(documents);
        } catch (error: unknown) {
            this.logger.error(`[migration-recovery] Could not prepare the recovery of interrupted migrations: ${errorMessage(error)}`);
            return NOTHING_TO_RECOVER;
        }
    }
}

export const migrationRecoveryService = new MigrationRecoveryService();
