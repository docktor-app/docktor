import {afterEach, beforeEach, describe, expect, it} from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {StackFilesystem} from "../../../src/infrastructure/stack-filesystem.js";
import {AppError, ConflictError} from "../../../src/lib/errors.js";

describe("StackFilesystem directory creation", () => {
    let tmpRoot: string;
    let previousStacksDir: string | undefined;

    beforeEach(async () => {
        tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "docktor-stackfs-"));
        previousStacksDir = process.env.DOCKTOR_STACKS_DIR;
        process.env.DOCKTOR_STACKS_DIR = tmpRoot;
    });

    afterEach(async () => {
        if (previousStacksDir === undefined) {
            delete process.env.DOCKTOR_STACKS_DIR;
        } else {
            process.env.DOCKTOR_STACKS_DIR = previousStacksDir;
        }
        await fs.rm(tmpRoot, {recursive: true, force: true});
    });

    describe("createDirectoryExclusive", () => {
        it("creates a fresh stack directory and resolves with its path", async () => {
            const created = await new StackFilesystem().createDirectoryExclusive("fresh");

            expect(created).toBe(path.join(tmpRoot, "fresh"));
            expect((await fs.stat(created)).isDirectory()).toBe(true);
        });

        it("rejects with a ConflictError caused by EEXIST and leaves an existing directory untouched", async () => {
            const taken = path.join(tmpRoot, "taken");
            await fs.mkdir(taken);
            await fs.writeFile(path.join(taken, "marker.txt"), "mine", "utf-8");

            const attempt = new StackFilesystem().createDirectoryExclusive("taken");

            await expect(attempt).rejects.toBeInstanceOf(ConflictError);
            await expect(attempt).rejects.toThrow(taken);
            await expect(attempt).rejects.toThrow("already exists");
            await expect(attempt).rejects.toHaveProperty("cause.code", "EEXIST");
            expect(await fs.readFile(path.join(taken, "marker.txt"), "utf-8")).toBe("mine");
        });
    });

    describe.skipIf(process.platform === "win32" || process.getuid?.() === 0)("createDirectoryExclusive failures", () => {
        it("wraps any other mkdir failure in an AppError that keeps the original error as cause", async () => {
            await fs.chmod(tmpRoot, 0o500);
            try {
                const attempt = new StackFilesystem().createDirectoryExclusive("blocked");

                await expect(attempt).rejects.toBeInstanceOf(AppError);
                await expect(attempt).rejects.not.toBeInstanceOf(ConflictError);
                await expect(attempt).rejects.toThrow(path.join(tmpRoot, "blocked"));
                await expect(attempt).rejects.toHaveProperty("cause.code", "EACCES");
            } finally {
                await fs.chmod(tmpRoot, 0o700);
            }
        });
    });

    describe("createDirectory", () => {
        it("stays tolerant of an existing directory (mkdir -p)", async () => {
            await fs.mkdir(path.join(tmpRoot, "taken"));

            await expect(new StackFilesystem().createDirectory("taken")).resolves.toBe(path.join(tmpRoot, "taken"));
        });
    });
});
