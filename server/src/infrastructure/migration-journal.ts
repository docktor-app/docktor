import {randomBytes} from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {MIGRATION_JOURNAL_ID_PATTERN, migrationJournalSchema, type MigrationJournalDocument} from "@docktor/shared";
import type {MigrationJournalListing, MigrationJournalPort} from "../application/ports/migration-journal-port.js";
import {AppError, BadRequestError, hasErrorCode} from "../lib/errors.js";
import {getStacksDir} from "../lib/stacks-dir.js";

const JOURNAL_SUFFIX = ".json";
const INVALID_SUFFIX = ".invalid";
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;

/**
 * T-22-22: the journal directory sits in the persistent stacks directory. The
 * leading dot keeps it out of the slug-named stack directories (slugify never
 * produces one), and the file watcher only reacts to compose and .env files.
 */
function defaultDirectory(): string {
    return path.join(getStacksDir(), ".docktor", "migration-journal");
}

/** An operation id becomes a file name, so only the id pattern ever reaches a path join (T-22-22). */
function assertJournalId(operationId: string): void {
    if (!MIGRATION_JOURNAL_ID_PATTERN.test(operationId)) {
        throw new BadRequestError("Invalid migration operation id");
    }
}

/**
 * File-based {@link MigrationJournalPort}: `<directory>/<operation id>.json`,
 * written through a temporary file in the same directory and a rename, with
 * the directory at mode 0700 and the files at 0600. The directory is
 * evaluated on every call, like the stacks directory itself.
 */
export class MigrationJournal implements MigrationJournalPort {
    constructor(private readonly directory: () => string = defaultDirectory) {}

    async write(document: MigrationJournalDocument): Promise<void> {
        const operationId = document.operation.id;
        assertJournalId(operationId);
        const directory = this.directory();
        const target = path.join(directory, `${operationId}${JOURNAL_SUFFIX}`);
        const temporary = path.join(directory, `.${operationId}${JOURNAL_SUFFIX}.tmp-${randomBytes(6).toString("hex")}`);
        try {
            // A document the boot recovery could not read back is worthless: refuse it now, while the
            // run can still stop before its next side effect (WR-03).
            const serialized = JSON.stringify(migrationJournalSchema.parse(document));
            await fs.mkdir(directory, {recursive: true, mode: DIRECTORY_MODE});
            await writeDurably(temporary, serialized);
            await fs.rename(temporary, target);
            await syncDirectory(directory);
        } catch (error: unknown) {
            await fs.rm(temporary, {force: true}).catch(() => undefined);
            throw new AppError(`Failed to write the migration journal ${target}`, 500, undefined, {cause: error});
        }
    }

    async remove(operationId: string): Promise<void> {
        assertJournalId(operationId);
        const target = path.join(this.directory(), `${operationId}${JOURNAL_SUFFIX}`);
        try {
            await fs.rm(target, {force: true});
        } catch (error: unknown) {
            throw new AppError(`Failed to remove the migration journal ${target}`, 500, undefined, {cause: error});
        }
    }

    async list(): Promise<MigrationJournalListing> {
        const directory = this.directory();
        const names = await this.journalNames(directory);
        const documents: MigrationJournalDocument[] = [];
        const invalid: string[] = [];
        for (const name of names) {
            const document = await readDocument(path.join(directory, name), name);
            if (document === null) {
                invalid.push(name);
                await setAside(path.join(directory, name));
            } else if (document.completedAt === undefined) {
                documents.push(document);
            } else {
                // A finished run whose journal could not be removed at the time: nothing to roll back (CR-02).
                await this.remove(document.operation.id).catch(() => undefined);
            }
        }
        return {documents, invalid};
    }

    /** The journal files: `<id>.json` only, never temporary files, set-aside files or foreign files. */
    private async journalNames(directory: string): Promise<string[]> {
        try {
            const names = await fs.readdir(directory);
            return names.filter((name) => name.endsWith(JOURNAL_SUFFIX) && !name.startsWith(".")).sort();
        } catch (error: unknown) {
            if (hasErrorCode(error, "ENOENT")) {
                return [];
            }
            throw new AppError(`Failed to read the migration journal directory ${directory}`, 500, undefined, {cause: error});
        }
    }
}

/** Writes and syncs the file, so a crash right after the rename cannot leave an empty journal. */
async function writeDurably(file: string, content: string): Promise<void> {
    const handle = await fs.open(file, "wx", FILE_MODE);
    try {
        await handle.writeFile(content, "utf-8");
        await handle.sync();
    } finally {
        await handle.close();
    }
}

/**
 * Syncs the directory entry of a renamed file: fsyncing the file alone does not make the rename itself
 * durable across a power loss (IN-06). Platforms that cannot open or sync a directory (Windows) skip it.
 */
async function syncDirectory(directory: string): Promise<void> {
    let handle: Awaited<ReturnType<typeof fs.open>>;
    try {
        handle = await fs.open(directory, "r");
    } catch (error: unknown) {
        if (hasErrorCode(error, "EISDIR") || hasErrorCode(error, "EPERM") || hasErrorCode(error, "EACCES")) {
            return;
        }
        throw error;
    }
    try {
        await handle.sync();
    } catch (error: unknown) {
        if (!hasErrorCode(error, "EINVAL") && !hasErrorCode(error, "EPERM") && !hasErrorCode(error, "ENOTSUP")) {
            throw error;
        }
    } finally {
        await handle.close();
    }
}

/** The document in a journal file, or null when the file is unreadable, not the known shape, or not named after its operation. */
async function readDocument(file: string, name: string): Promise<MigrationJournalDocument | null> {
    try {
        const parsed = migrationJournalSchema.safeParse(JSON.parse(await fs.readFile(file, "utf-8")));
        if (!parsed.success || `${parsed.data.operation.id}${JOURNAL_SUFFIX}` !== name) {
            return null;
        }
        return parsed.data;
    } catch {
        return null;
    }
}

/** Renames an unusable file to `<name>.invalid` so it is not read again; a failure to rename is not worth failing the listing. */
async function setAside(file: string): Promise<void> {
    await fs.rename(file, `${file}${INVALID_SUFFIX}`).catch(() => undefined);
}

export const migrationJournal = new MigrationJournal();
