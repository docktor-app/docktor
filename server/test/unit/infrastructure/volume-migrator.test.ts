import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {VolumeMigrator} from "../../../src/infrastructure/volume-migrator.js";

describe("VolumeMigrator.moveDirectory (G-18-7)", () => {
    let tmpRoot: string;
    let source: string;
    let destination: string;

    beforeEach(async () => {
        tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "docktor-move-"));
        source = path.join(tmpRoot, "memos");
        destination = path.join(tmpRoot, "memos-pre-migration");
        await fs.mkdir(path.join(source, "data"), {recursive: true});
        await fs.writeFile(path.join(source, "docker-compose.yml"), "services: {}\n", "utf-8");
        await fs.writeFile(path.join(source, "data", "keep.txt"), "keep me", "utf-8");
    });

    afterEach(async () => {
        await fs.rm(tmpRoot, {recursive: true, force: true});
    });

    it("renames a directory together with its contents", async () => {
        await new VolumeMigrator().moveDirectory(source, destination);

        await expect(fs.access(source)).rejects.toThrow();
        expect(await fs.readFile(path.join(destination, "data", "keep.txt"), "utf-8")).toBe("keep me");
        expect(await fs.readFile(path.join(destination, "docker-compose.yml"), "utf-8")).toBe("services: {}\n");
    });

    it("rejects when the destination holds files and leaves both directories as they were", async () => {
        await fs.mkdir(destination);
        await fs.writeFile(path.join(destination, "theirs.txt"), "theirs", "utf-8");

        await expect(new VolumeMigrator().moveDirectory(source, destination)).rejects.toThrow(destination);

        expect(await fs.readFile(path.join(source, "data", "keep.txt"), "utf-8")).toBe("keep me");
        expect(await fs.readFile(path.join(destination, "theirs.txt"), "utf-8")).toBe("theirs");
    });

    it("rejects when the destination is an empty directory instead of replacing it", async () => {
        await fs.mkdir(destination);

        await expect(new VolumeMigrator().moveDirectory(source, destination)).rejects.toThrow("already exists");

        expect(await fs.readFile(path.join(source, "data", "keep.txt"), "utf-8")).toBe("keep me");
        expect(await fs.readdir(destination)).toEqual([]);
    });

    it("rejects when the source does not exist", async () => {
        await expect(new VolumeMigrator().moveDirectory(path.join(tmpRoot, "missing"), destination)).rejects.toThrow();

        await expect(fs.access(destination)).rejects.toThrow();
    });
});
