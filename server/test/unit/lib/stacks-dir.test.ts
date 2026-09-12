import {afterEach, describe, expect, it, vi} from "vitest";
import {
    assertStacksDirIsMounted,
    assertStacksDirMatchesHost,
    ensureStacksDir,
    findMountEntryForPath,
    getComposePath,
    getEnvPath,
    getStackPath,
    getStacksDir,
} from "../../../src/lib/stacks-dir.js";
import {mkdir, mkdtemp, rm, stat, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";

describe("stacks-dir", () => {
    const tempRoots: string[] = [];

    afterEach(async () => {
        delete process.env.DOCKTOR_STACKS_DIR;
        delete process.env.DOCKTOR_STACKS_HOST_DIR;
        vi.restoreAllMocks();
        await Promise.all(
            tempRoots.splice(0).map((root) => rm(root, {recursive: true, force: true})),
        );
    });

    describe("getStacksDir", () => {
        it("returns default ./stacks when env not set", () => {
            delete process.env.DOCKTOR_STACKS_DIR;
            const result = getStacksDir();
            expect(result).toBe(path.resolve("./stacks"));
        });

        it("uses DOCKTOR_STACKS_DIR env variable", () => {
            process.env.DOCKTOR_STACKS_DIR = "/custom/stacks";
            const result = getStacksDir();
            expect(result).toBe(path.resolve("/custom/stacks"));
        });
    });

    describe("getStackPath", () => {
        it("joins stacks dir with stack id", () => {
            process.env.DOCKTOR_STACKS_DIR = "/stacks";
            const result = getStackPath("my-app");
            expect(result).toBe(path.join(path.resolve("/stacks"), "my-app"));
        });

        it("throws when the stack id resolves outside the stacks directory", () => {
            process.env.DOCKTOR_STACKS_DIR = "/stacks";
            expect(() => getStackPath("../evil")).toThrow(
                /outside the managed stacks directory/,
            );
        });

        it("throws when the stack id is a bare parent-traversal segment", () => {
            process.env.DOCKTOR_STACKS_DIR = "/stacks";
            expect(() => getStackPath("..")).toThrow(
                /outside the managed stacks directory/,
            );
        });
    });

    describe("getComposePath", () => {
        it("appends docker-compose.yml to stack path", () => {
            process.env.DOCKTOR_STACKS_DIR = "/stacks";
            const result = getComposePath("my-app");
            expect(result).toBe(path.join(path.resolve("/stacks"), "my-app", "docker-compose.yml"));
        });
    });

    describe("getEnvPath", () => {
        it("appends .env to stack path", () => {
            process.env.DOCKTOR_STACKS_DIR = "/stacks";
            const result = getEnvPath("my-app");
            expect(result).toBe(path.join(path.resolve("/stacks"), "my-app", ".env"));
        });
    });

    describe("assertStacksDirMatchesHost", () => {
        it("passes when host and container paths match exactly", () => {
            process.env.DOCKTOR_STACKS_DIR = "/opt/docktor/stacks";
            process.env.DOCKTOR_STACKS_HOST_DIR = "/opt/docktor/stacks";
            expect(() => assertStacksDirMatchesHost()).not.toThrow();
        });

        it("passes when the host path has a trailing slash", () => {
            process.env.DOCKTOR_STACKS_DIR = "/opt/docktor/stacks";
            process.env.DOCKTOR_STACKS_HOST_DIR = "/opt/docktor/stacks/";
            expect(() => assertStacksDirMatchesHost()).not.toThrow();
        });

        it("passes when the host path is non-normalised but resolves to the same directory", () => {
            process.env.DOCKTOR_STACKS_DIR = "/opt/docktor/stacks";
            process.env.DOCKTOR_STACKS_HOST_DIR = "/opt/docktor/foo/../stacks";
            expect(() => assertStacksDirMatchesHost()).not.toThrow();
        });

        it("throws mentioning both the host and container paths when they differ", () => {
            process.env.DOCKTOR_STACKS_DIR = "/opt/docktor/stacks";
            process.env.DOCKTOR_STACKS_HOST_DIR = "/opt/docktor/stacks-old";

            let thrown: Error | undefined;
            try {
                assertStacksDirMatchesHost();
            } catch (err) {
                thrown = err as Error;
            }

            expect(thrown).toBeInstanceOf(Error);
            expect(thrown?.message).toContain(path.resolve("/opt/docktor/stacks-old"));
            expect(thrown?.message).toContain(path.resolve("/opt/docktor/stacks"));
        });

        it("warns and returns without throwing when DOCKTOR_STACKS_HOST_DIR is unset", () => {
            delete process.env.DOCKTOR_STACKS_HOST_DIR;
            process.env.DOCKTOR_STACKS_DIR = "/opt/docktor/stacks";
            const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

            expect(() => assertStacksDirMatchesHost()).not.toThrow();
            expect(warnSpy).toHaveBeenCalledTimes(1);
            expect(warnSpy.mock.calls[0]?.[0]).toContain("DOCKTOR_STACKS_HOST_DIR");
        });
    });

    describe("ensureStacksDir", () => {
        it("creates the directory when it is absent, including missing intermediate segments", async () => {
            const root = await mkdtemp(path.join(tmpdir(), "stacks-dir-test-"));
            tempRoots.push(root);
            const target = path.join(root, "nested", "two-levels", "stacks");
            process.env.DOCKTOR_STACKS_DIR = target;

            const result = await ensureStacksDir();

            expect(result).toBe(path.resolve(target));
            const stats = await stat(target);
            expect(stats.isDirectory()).toBe(true);
        });

        it("leaves an existing directory intact and is a no-op on a second consecutive call", async () => {
            const root = await mkdtemp(path.join(tmpdir(), "stacks-dir-test-"));
            tempRoots.push(root);
            const target = path.join(root, "stacks");
            await mkdir(target);
            await writeFile(path.join(target, "marker.txt"), "keep-me");
            process.env.DOCKTOR_STACKS_DIR = target;

            await expect(ensureStacksDir()).resolves.toBe(path.resolve(target));
            await expect(ensureStacksDir()).resolves.toBe(path.resolve(target));

            const stats = await stat(path.join(target, "marker.txt"));
            expect(stats.isFile()).toBe(true);
        });

        it("returns the same absolute path getStacksDir() resolves for the same env value", async () => {
            const root = await mkdtemp(path.join(tmpdir(), "stacks-dir-test-"));
            tempRoots.push(root);
            const target = path.join(root, "stacks");
            process.env.DOCKTOR_STACKS_DIR = target;

            const result = await ensureStacksDir();

            expect(result).toBe(getStacksDir());
        });

        it("rethrows an error naming the path when creation is impossible", async () => {
            const root = await mkdtemp(path.join(tmpdir(), "stacks-dir-test-"));
            tempRoots.push(root);
            const blockingFile = path.join(root, "not-a-directory");
            await writeFile(blockingFile, "i am a file, not a directory");
            const target = path.join(blockingFile, "stacks");
            process.env.DOCKTOR_STACKS_DIR = target;

            await expect(ensureStacksDir()).rejects.toThrow(
                new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
            );
        });
    });

    describe("findMountEntryForPath", () => {
        it("returns the entry for an exact match on the mount point", () => {
            const fixture = [
                "29 1 8:2 / / rw,relatime shared:1 - ext4 /dev/sda2 rw",
                "660 29 8:2 /srv/stacks /opt/docktor/stacks rw,relatime shared:1 - ext4 /dev/sda2 rw",
            ].join("\n");

            const result = findMountEntryForPath("/opt/docktor/stacks", fixture);

            expect(result).toEqual({mountPoint: "/opt/docktor/stacks", filesystemType: "ext4"});
        });

        it("returns the nearest covering ancestor entry when no exact match exists", () => {
            const fixture = [
                "29 1 8:2 / / rw,relatime shared:1 - ext4 /dev/sda2 rw",
                "24 29 0:22 / /sys rw,nosuid shared:7 - sysfs sysfs rw",
            ].join("\n");

            const result = findMountEntryForPath("/opt/docktor/stacks", fixture);

            expect(result).toEqual({mountPoint: "/", filesystemType: "ext4"});
        });

        it("prefers the deepest covering entry over a shallower ancestor", () => {
            const fixture = [
                "29 1 8:2 / / rw,relatime shared:1 - ext4 /dev/sda2 rw",
                "40 29 8:3 / /opt/docktor rw,relatime shared:2 - ext4 /dev/sdb1 rw",
            ].join("\n");

            const result = findMountEntryForPath("/opt/docktor/stacks", fixture);

            expect(result).toEqual({mountPoint: "/opt/docktor", filesystemType: "ext4"});
        });

        it("does not treat a sibling-prefix mount point as covering the target", () => {
            const fixture = [
                "29 1 8:2 / / rw,relatime shared:1 - ext4 /dev/sda2 rw",
                "41 29 8:4 / /opt/docktor-other rw,relatime shared:3 - ext4 /dev/sdc1 rw",
            ].join("\n");

            const result = findMountEntryForPath("/opt/docktor-otherwise/stacks", fixture);

            expect(result).toEqual({mountPoint: "/", filesystemType: "ext4"});
        });

        it("reads the filesystem type from the field after the '-' separator regardless of optional-fields count", () => {
            const withOptionalFields = "29 1 8:2 / / rw,relatime shared:1 - ext4 /dev/sda2 rw";
            const withoutOptionalFields = "29 1 8:2 / / rw,relatime - ext4 /dev/sda2 rw";

            expect(findMountEntryForPath("/", withOptionalFields)).toEqual({
                mountPoint: "/",
                filesystemType: "ext4",
            });
            expect(findMountEntryForPath("/", withoutOptionalFields)).toEqual({
                mountPoint: "/",
                filesystemType: "ext4",
            });
        });
    });

    describe("assertStacksDirIsMounted", () => {
        it("rejects with an Error naming the resolved stacks path when the covering entry's filesystem type is overlay", async () => {
            process.env.DOCKTOR_STACKS_DIR = "/opt/docktor/stacks";
            const fixture = "29 1 8:2 / / rw,relatime - overlay overlay rw";

            let thrown: Error | undefined;
            try {
                await assertStacksDirIsMounted(async () => fixture);
            } catch (err) {
                thrown = err as Error;
            }

            expect(thrown).toBeInstanceOf(Error);
            expect(thrown?.message).toContain(path.resolve("/opt/docktor/stacks"));
        });

        it("resolves without throwing when the covering entry's filesystem type is ext4", async () => {
            process.env.DOCKTOR_STACKS_DIR = "/opt/docktor/stacks";
            const fixture = "29 1 8:2 / / rw,relatime - ext4 /dev/sda2 rw";

            await expect(assertStacksDirIsMounted(async () => fixture)).resolves.toBeUndefined();
        });
    });
});
