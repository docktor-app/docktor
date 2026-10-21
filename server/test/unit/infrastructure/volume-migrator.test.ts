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

describe.skipIf(process.platform === "win32")("VolumeMigrator.copyDirectory (CR-01)", () => {
    let tmpRoot: string;
    let source: string;
    let destination: string;

    beforeEach(async () => {
        tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "docktor-copy-"));
        source = path.join(tmpRoot, "src");
        destination = path.join(tmpRoot, "dest");
        await fs.mkdir(path.join(source, "sub"), {recursive: true});
        await fs.writeFile(path.join(source, "data.bin"), "payload", "utf-8");
        await fs.chmod(path.join(source, "data.bin"), 0o640);
        await fs.symlink("data.bin", path.join(source, "link"));
    });

    afterEach(async () => {
        await fs.rm(tmpRoot, {recursive: true, force: true});
    });

    it("keeps a relative symlink verbatim and the file mode", async () => {
        await new VolumeMigrator().copyDirectory(source, destination);

        expect(await fs.readlink(path.join(destination, "link"))).toBe("data.bin");
        expect(await fs.readFile(path.join(destination, "link"), "utf-8")).toBe("payload");
        expect((await fs.stat(path.join(destination, "data.bin"))).mode & 0o777).toBe(0o640);
    });

    it("produces an independent copy", async () => {
        await new VolumeMigrator().copyDirectory(source, destination);
        await fs.chmod(path.join(destination, "data.bin"), 0o644);
        await fs.writeFile(path.join(destination, "data.bin"), "changed", "utf-8");

        expect(await fs.readFile(path.join(source, "data.bin"), "utf-8")).toBe("payload");
    });

    it("keeps modification times of files and directories", async () => {
        const past = new Date("2020-03-04T05:06:07Z");
        await fs.utimes(path.join(source, "data.bin"), past, past);
        await fs.utimes(path.join(source, "sub"), past, past);

        await new VolumeMigrator().copyDirectory(source, destination);

        const expected = Math.floor(past.getTime() / 1000);
        for (const entry of ["data.bin", "sub"]) {
            const copied = await fs.stat(path.join(destination, entry));
            expect(Math.floor(copied.mtimeMs / 1000)).toBe(expected);
        }
    });

    it("keeps directory modes and the executable bit", async () => {
        await fs.chmod(path.join(source, "sub"), 0o750);
        await fs.writeFile(path.join(source, "run.sh"), "#!/bin/sh\n", "utf-8");
        await fs.chmod(path.join(source, "run.sh"), 0o755);

        await new VolumeMigrator().copyDirectory(source, destination);

        expect((await fs.stat(path.join(destination, "sub"))).mode & 0o777).toBe(0o750);
        expect((await fs.stat(path.join(destination, "run.sh"))).mode & 0o777).toBe(0o755);
    });

    it("copies absolute and dangling symlinks as links without dereferencing", async () => {
        await fs.symlink("/nonexistent/target", path.join(source, "dangling"));

        await new VolumeMigrator().copyDirectory(source, destination);

        expect(await fs.readlink(path.join(destination, "dangling"))).toBe("/nonexistent/target");
    });

    it.skipIf(process.getuid?.() !== 0)("keeps uid and gid when running as root", async () => {
        await fs.chown(path.join(source, "data.bin"), 4242, 4242);
        await fs.chown(path.join(source, "sub"), 4242, 4242);

        await new VolumeMigrator().copyDirectory(source, destination);

        for (const entry of ["data.bin", "sub"]) {
            const copied = await fs.stat(path.join(destination, entry));
            expect([copied.uid, copied.gid]).toEqual([4242, 4242]);
        }
    });

    it("merges into an existing destination directory without nesting the source", async () => {
        await fs.mkdir(path.join(destination, "volumes"), {recursive: true});

        await new VolumeMigrator().copyDirectory(source, destination);

        await expect(fs.access(path.join(destination, "data.bin"))).resolves.toBeUndefined();
        await expect(fs.access(path.join(destination, path.basename(source)))).rejects.toThrow();
        await expect(fs.access(path.join(destination, "volumes"))).resolves.toBeUndefined();
    });

    it("copies a single-file source with content and mode intact", async () => {
        const file = path.join(tmpRoot, "nginx.conf");
        await fs.writeFile(file, "server {}", "utf-8");
        await fs.chmod(file, 0o600);
        const target = path.join(tmpRoot, "new", "nginx.conf");

        await new VolumeMigrator().copyDirectory(file, target);

        expect(await fs.readFile(target, "utf-8")).toBe("server {}");
        expect((await fs.stat(target)).mode & 0o777).toBe(0o600);
    });

    it("copies a symlink source as the link itself", async () => {
        const target = path.join(tmpRoot, "link-copy");

        await new VolumeMigrator().copyDirectory(path.join(source, "link"), target);

        expect(await fs.readlink(target)).toBe("data.bin");
    });

    it("rejects with ENOENT for a missing source and creates no destination", async () => {
        await expect(new VolumeMigrator().copyDirectory(path.join(tmpRoot, "missing"), destination))
            .rejects.toMatchObject({code: "ENOENT"});

        await expect(fs.access(destination)).rejects.toThrow();
    });

    it("rejects when the destination exists but is not a directory and leaves it unchanged", async () => {
        await fs.writeFile(destination, "precious", "utf-8");

        await expect(new VolumeMigrator().copyDirectory(source, destination)).rejects.toThrow();

        expect(await fs.readFile(destination, "utf-8")).toBe("precious");
    });

    it.skipIf(process.getuid?.() === 0)("rejects with the cause when an entry cannot be read", async () => {
        const secret = path.join(source, "secret.key");
        await fs.writeFile(secret, "hidden", "utf-8");
        await fs.chmod(secret, 0o000);

        await expect(new VolumeMigrator().copyDirectory(source, destination))
            .rejects.toThrow(/failed.*secret\.key/s);
    });
});

describe("VolumeMigrator.copyDirectory on every platform (CR-01)", () => {
    let tmpRoot: string;

    beforeEach(async () => {
        tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "docktor-copy-any-"));
    });

    afterEach(async () => {
        await fs.rm(tmpRoot, {recursive: true, force: true});
    });

    it("copies nested regular files with their content", async () => {
        const source = path.join(tmpRoot, "src");
        await fs.mkdir(path.join(source, "a", "b"), {recursive: true});
        await fs.writeFile(path.join(source, "a", "b", "deep.txt"), "deep", "utf-8");

        await new VolumeMigrator().copyDirectory(source, path.join(tmpRoot, "dest"));

        expect(await fs.readFile(path.join(tmpRoot, "dest", "a", "b", "deep.txt"), "utf-8")).toBe("deep");
    });
});
