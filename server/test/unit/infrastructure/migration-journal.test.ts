import {afterEach, beforeEach, describe, expect, it} from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {MigrationJournalDocument, MigrationOperation} from "@docktor/shared";
import {MigrationJournal} from "../../../src/infrastructure/migration-journal.js";
import {AppError} from "../../../src/lib/errors.js";

function operation(id: string): MigrationOperation {
    return {
        id,
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
}

function documentFor(id: string, ledger: MigrationJournalDocument["ledger"] = []): MigrationJournalDocument {
    return {version: 1, operation: operation(id), originalDir: "/opt/app", ledger};
}

describe("MigrationJournal", () => {
    let root: string;
    let directory: string;
    let journal: MigrationJournal;

    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), "docktor-journal-"));
        directory = path.join(root, ".docktor", "migration-journal");
        journal = new MigrationJournal(() => directory);
    });

    afterEach(async () => {
        await fs.rm(root, {recursive: true, force: true});
    });

    describe("write", () => {
        it("creates the directory and writes <id>.json with the document", async () => {
            const document = documentFor("op-1", [{kind: "created_directory", stackId: "my-app"}]);

            await journal.write(document);

            const stored: unknown = JSON.parse(await fs.readFile(path.join(directory, "op-1.json"), "utf-8"));
            expect(stored).toEqual(document);
        });

        it.skipIf(process.platform === "win32")("creates the directory with mode 0700 and the file with mode 0600", async () => {
            await journal.write(documentFor("op-1"));

            expect((await fs.stat(directory)).mode & 0o777).toBe(0o700);
            expect((await fs.stat(path.join(directory, "op-1.json"))).mode & 0o777).toBe(0o600);
        });

        it("replaces the content on a second write and leaves no temporary file behind", async () => {
            await journal.write(documentFor("op-1"));
            await journal.write(documentFor("op-1", [{kind: "deploy_started", stackId: "my-app"}]));

            const stored = JSON.parse(await fs.readFile(path.join(directory, "op-1.json"), "utf-8")) as MigrationJournalDocument;
            expect(stored.ledger).toEqual([{kind: "deploy_started", stackId: "my-app"}]);
            expect(await fs.readdir(directory)).toEqual(["op-1.json"]);
        });

        it.each(["../escape", "a/b", "a\\b", "op.1", "", "a".repeat(65)])("rejects the id %j before any path is built", async (id) => {
            await expect(journal.write(documentFor(id))).rejects.toBeInstanceOf(AppError);
            await expect(fs.stat(directory)).rejects.toHaveProperty("code", "ENOENT");
        });

        it("wraps a filesystem failure in an AppError that keeps the cause", async () => {
            await fs.mkdir(path.join(root, ".docktor"));
            await fs.writeFile(directory, "a file where the directory belongs", "utf-8");

            const attempt = journal.write(documentFor("op-1"));

            await expect(attempt).rejects.toBeInstanceOf(AppError);
            await expect(attempt).rejects.toHaveProperty("cause");
        });
    });

    describe("remove", () => {
        it("deletes the journal file", async () => {
            await journal.write(documentFor("op-1"));

            await journal.remove("op-1");

            expect(await fs.readdir(directory)).toEqual([]);
        });

        it("ignores a missing file and a missing directory", async () => {
            await expect(journal.remove("op-1")).resolves.toBeUndefined();
            await journal.write(documentFor("op-2"));
            await expect(journal.remove("op-1")).resolves.toBeUndefined();
        });

        it("rejects an id with a slash or dots", async () => {
            await expect(journal.remove("../op-1")).rejects.toBeInstanceOf(AppError);
            await expect(journal.remove("op.1")).rejects.toBeInstanceOf(AppError);
        });
    });

    describe("list", () => {
        it("returns empty lists when the directory does not exist", async () => {
            await expect(journal.list()).resolves.toEqual({documents: [], invalid: []});
        });

        it("returns every valid document", async () => {
            await journal.write(documentFor("op-1"));
            await journal.write(documentFor("op-2", [{kind: "created_record", stackId: "my-app"}]));

            const {documents, invalid} = await journal.list();

            expect(invalid).toEqual([]);
            expect(documents.map((document) => document.operation.id).sort()).toEqual(["op-1", "op-2"]);
        });

        it("sets an unparsable file aside as <name>.invalid and reports it", async () => {
            await fs.mkdir(directory, {recursive: true});
            await fs.writeFile(path.join(directory, "broken.json"), "{not json", "utf-8");
            await journal.write(documentFor("op-1"));

            const {documents, invalid} = await journal.list();

            expect(documents.map((document) => document.operation.id)).toEqual(["op-1"]);
            expect(invalid).toEqual(["broken.json"]);
            expect((await fs.readdir(directory)).sort()).toEqual(["broken.json.invalid", "op-1.json"]);
        });

        it("sets a schema-invalid file aside, and a file whose name is not its operation id", async () => {
            await fs.mkdir(directory, {recursive: true});
            await fs.writeFile(path.join(directory, "old.json"), JSON.stringify({...documentFor("old"), version: 2}), "utf-8");
            await fs.writeFile(path.join(directory, "other.json"), JSON.stringify(documentFor("not-other")), "utf-8");

            const {documents, invalid} = await journal.list();

            expect(documents).toEqual([]);
            expect(invalid.sort()).toEqual(["old.json", "other.json"]);
            expect((await fs.readdir(directory)).sort()).toEqual(["old.json.invalid", "other.json.invalid"]);
        });

        it("ignores leftover temporary files and files that are not journals", async () => {
            await fs.mkdir(directory, {recursive: true});
            await fs.writeFile(path.join(directory, ".op-1.json.tmp-123"), "{partial", "utf-8");
            await fs.writeFile(path.join(directory, "notes.txt"), "hello", "utf-8");
            await fs.writeFile(path.join(directory, "set-aside.json.invalid"), "x", "utf-8");

            await expect(journal.list()).resolves.toEqual({documents: [], invalid: []});
            expect((await fs.readdir(directory)).sort()).toEqual([".op-1.json.tmp-123", "notes.txt", "set-aside.json.invalid"]);
        });
    });

    it("evaluates the directory on every call", async () => {
        let current = directory;
        const moving = new MigrationJournal(() => current);
        await moving.write(documentFor("op-1"));

        current = path.join(root, "elsewhere");

        await expect(moving.list()).resolves.toEqual({documents: [], invalid: []});
    });
});
