import type {MigrationJournalDocument} from "@docktor/shared";

/** What the journal found on disk: the documents it could read, and the files it set aside because it could not. */
export interface MigrationJournalListing {
    readonly documents: readonly MigrationJournalDocument[];
    /** File names that were unreadable or invalid and have been renamed to `<name>.invalid`. */
    readonly invalid: readonly string[];
}

/**
 * Port for the durable migration journal (D-06): one document per running
 * migration, in persistent storage that survives a Docktor restart. Declared
 * here so the application layer depends on a port, not on the filesystem
 * adapter.
 */
export interface MigrationJournalPort {
    /**
     * Stores the document under its operation id, replacing an earlier one. The
     * write is durable and atomic: a reader sees the old or the new document,
     * never a partial one. Rejects when it could not be written.
     */
    write(document: MigrationJournalDocument): Promise<void>;

    /** Deletes the journal of an operation; a journal that does not exist is not an error. */
    remove(operationId: string): Promise<void>;

    /**
     * Every journal on disk. One bad file never makes this reject: it is set
     * aside and named in `invalid`, the others are still returned.
     */
    list(): Promise<MigrationJournalListing>;
}
