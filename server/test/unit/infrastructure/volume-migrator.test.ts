import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {runCommand, VolumeMigrator, type VolumeDockerRunner} from "../../../src/infrastructure/volume-migrator.js";
import {AppError} from "../../../src/lib/errors.js";

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

    // The linux-root-migration CI job sets DOCKTOR_REQUIRE_ROOT_TESTS so the ownership test below
    // can never be skipped silently: if the job is not root, this assertion fails it (#109).
    it.runIf(process.env.DOCKTOR_REQUIRE_ROOT_TESTS === "1")("runs as root when the ownership test is required", () => {
        expect(process.getuid?.()).toBe(0);
    });

    it.skipIf(process.getuid?.() !== 0)("keeps uid, gid, mode, mtime and symlinks when running as root", async () => {
        const past = new Date("2021-05-06T07:08:09Z");
        await fs.mkdir(path.join(source, "sub", "nested"), {recursive: true});
        await fs.writeFile(path.join(source, "sub", "nested", "deep.txt"), "deep", "utf-8");
        await fs.chmod(path.join(source, "sub", "nested", "deep.txt"), 0o600);
        await fs.chmod(path.join(source, "sub", "nested"), 0o710);
        await fs.utimes(path.join(source, "sub", "nested", "deep.txt"), past, past);
        await fs.chown(path.join(source, "data.bin"), 4242, 4242);
        await fs.chown(path.join(source, "sub"), 4242, 4242);
        await fs.chown(path.join(source, "sub", "nested"), 4343, 4344);
        await fs.chown(path.join(source, "sub", "nested", "deep.txt"), 4343, 4344);
        await fs.lchown(path.join(source, "link"), 4545, 4546);

        await new VolumeMigrator().copyDirectory(source, destination);

        for (const entry of ["data.bin", "sub"]) {
            const copied = await fs.stat(path.join(destination, entry));
            expect([copied.uid, copied.gid]).toEqual([4242, 4242]);
        }
        const nestedDirectory = await fs.stat(path.join(destination, "sub", "nested"));
        expect([nestedDirectory.uid, nestedDirectory.gid]).toEqual([4343, 4344]);
        expect(nestedDirectory.mode & 0o777).toBe(0o710);
        const nestedFile = await fs.stat(path.join(destination, "sub", "nested", "deep.txt"));
        expect([nestedFile.uid, nestedFile.gid]).toEqual([4343, 4344]);
        expect(nestedFile.mode & 0o777).toBe(0o600);
        expect(Math.floor(nestedFile.mtimeMs / 1000)).toBe(Math.floor(past.getTime() / 1000));
        const copiedLink = await fs.lstat(path.join(destination, "link"));
        expect([copiedLink.uid, copiedLink.gid]).toEqual([4545, 4546]);
        expect(await fs.readlink(path.join(destination, "link"))).toBe("data.bin");
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

describe("VolumeMigrator docker paths (#101)", () => {
    let tmpRoot: string;

    beforeEach(async () => {
        tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "docktor-volume-"));
    });

    afterEach(async () => {
        await fs.rm(tmpRoot, {recursive: true, force: true});
    });

    const NO_SUCH_VOLUME = new AppError("Volume inspect failed (exit 1): Error response from daemon: get gone: no such volume");

    function runnerAnswering(answers: {inspect: "exists" | "missing" | Error}): ReturnType<typeof vi.fn<VolumeDockerRunner>> {
        return vi.fn<VolumeDockerRunner>(async (args) => {
            if (args[0] === "volume") {
                if (answers.inspect === "exists") {
                    return {stdout: "[]", stderr: ""};
                }
                throw answers.inspect === "missing" ? NO_SUCH_VOLUME : answers.inspect;
            }
            return {stdout: "", stderr: ""};
        });
    }

    describe("volumeExists", () => {
        it("is true when docker volume inspect succeeds", async () => {
            const docker = runnerAnswering({inspect: "exists"});

            await expect(new VolumeMigrator(docker).volumeExists("myproj_data")).resolves.toBe(true);

            expect(docker).toHaveBeenCalledWith(["volume", "inspect", "myproj_data"], expect.any(String));
        });

        it("is false when docker says there is no such volume", async () => {
            await expect(new VolumeMigrator(runnerAnswering({inspect: "missing"})).volumeExists("gone")).resolves.toBe(false);
        });

        it("rejects with the cause for any other docker failure", async () => {
            const failure = new AppError("Volume inspect failed (exit 1): Cannot connect to the Docker daemon");

            const rejection = await new VolumeMigrator(runnerAnswering({inspect: failure})).volumeExists("data").catch((error: unknown) => error);

            expect(rejection).toBeInstanceOf(AppError);
            expect(rejection).toMatchObject({cause: failure, message: expect.stringContaining("Cannot connect to the Docker daemon")});
        });

        it("rejects a name that is not a Docker volume name before any docker call", async () => {
            const docker = runnerAnswering({inspect: "exists"});

            await expect(new VolumeMigrator(docker).volumeExists("-rf,src=/etc")).rejects.toThrow("not a valid Docker volume name");

            expect(docker).not.toHaveBeenCalled();
        });
    });

    describe("copyVolumeToBindMount", () => {
        it("inspects the volume first, then runs a read-only --mount copy", async () => {
            const docker = runnerAnswering({inspect: "exists"});
            const dest = path.join(tmpRoot, "volumes", "data");

            await new VolumeMigrator(docker).copyVolumeToBindMount("myproj_data", dest);

            expect(docker.mock.calls.map((call) => call[0])).toEqual([
                ["volume", "inspect", "myproj_data"],
                [
                    "run", "--rm",
                    "--mount", "type=volume,src=myproj_data,dst=/source,readonly",
                    "-v", `${dest}:/dest`,
                    "alpine", "sh", "-c", "cp -a /source/. /dest/",
                ],
            ]);
            await expect(fs.stat(dest)).resolves.toBeTruthy();
        });

        it("never runs docker run for a volume that does not exist, and creates nothing", async () => {
            const docker = runnerAnswering({inspect: "missing"});
            const dest = path.join(tmpRoot, "volumes", "gone");

            await expect(new VolumeMigrator(docker).copyVolumeToBindMount("gone", dest)).rejects.toThrow("does not exist");

            expect(docker.mock.calls.some((call) => call[0][0] === "run")).toBe(false);
            await expect(fs.access(dest)).rejects.toThrow();
        });

        it.each(["a,b", "-v", "name with space", "../x", ""])("rejects the name %j before any docker call", async (name) => {
            const docker = runnerAnswering({inspect: "exists"});

            await expect(new VolumeMigrator(docker).copyVolumeToBindMount(name, path.join(tmpRoot, "d"))).rejects.toThrow(
                "not a valid Docker volume name",
            );

            expect(docker).not.toHaveBeenCalled();
        });

        it("passes the failure of the copy on with its message", async () => {
            const docker = vi.fn<VolumeDockerRunner>(async (args) => {
                if (args[0] === "run") {
                    throw new AppError("Volume copy failed (exit 1): disk full");
                }
                return {stdout: "[]", stderr: ""};
            });

            await expect(new VolumeMigrator(docker).copyVolumeToBindMount("data", path.join(tmpRoot, "d"))).rejects.toThrow("disk full");
        });
    });
});

describe.skipIf(process.platform === "win32")("runCommand (WR-07)", () => {
    it("resolves when the command exits 0", async () => {
        await expect(runCommand("true", [], "Test command")).resolves.toBeUndefined();
    });

    it("rejects with the exit code and stderr on a non-zero exit", async () => {
        await expect(runCommand("sh", ["-c", "echo boom >&2; exit 3"], "Test command")).rejects.toThrow(
            "Test command failed (exit 3): boom",
        );
    });

    it("kills a command that outlives its timeout and rejects with a timeout error", async () => {
        const attempt = runCommand("sleep", ["30"], "Test copy", 100);

        await expect(attempt).rejects.toBeInstanceOf(AppError);
        await expect(attempt).rejects.toThrow("Test copy was stopped after");
    });
});
