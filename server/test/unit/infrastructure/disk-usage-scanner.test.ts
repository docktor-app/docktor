import type {Dirent} from "node:fs";
import {describe, expect, it, vi} from "vitest";
import {DiskUsageScanner} from "../../../src/infrastructure/disk-usage-scanner.js";

function dirent(name: string, kind: "dir" | "symlink" | "file"): Dirent {
    return {
        name,
        isDirectory: () => kind === "dir",
        isSymbolicLink: () => kind === "symlink",
        isFile: () => kind === "file",
    } as Dirent;
}

describe("DiskUsageScanner (#27, D-13)", () => {
    describe("measureBytes", () => {
        it("runs one du with an argv array and `--`, and converts KiB to bytes", async () => {
            const runner = vi.fn().mockResolvedValue({stdout: "2048\t/s/a/volumes/db\n"});
            const scanner = new DiskUsageScanner(runner);

            const bytes = await scanner.measureBytes("/s/a/volumes/db");

            expect(bytes).toBe(2_097_152);
            expect(runner).toHaveBeenCalledOnce();
            expect(runner).toHaveBeenCalledWith("du", ["-sk", "--", "/s/a/volumes/db"]);
        });

        it("keeps a directory named like a flag behind the `--` separator", async () => {
            const runner = vi.fn().mockResolvedValue({stdout: "4\t/s/a/volumes/-rf\n"});
            const scanner = new DiskUsageScanner(runner);

            await scanner.measureBytes("/s/a/volumes/-rf");

            expect(runner).toHaveBeenCalledWith("du", ["-sk", "--", "/s/a/volumes/-rf"]);
        });

        it("returns null when du output cannot be parsed", async () => {
            const runner = vi.fn().mockResolvedValue({stdout: "du: weird output\n"});
            const scanner = new DiskUsageScanner(runner);

            expect(await scanner.measureBytes("/s/a/volumes/db")).toBeNull();
        });

        it("returns null for empty du output instead of reporting 0 bytes", async () => {
            const runner = vi.fn().mockResolvedValue({stdout: ""});
            const scanner = new DiskUsageScanner(runner);

            expect(await scanner.measureBytes("/s/a/volumes/db")).toBeNull();
        });

        it("uses the printed total when du exits 1 because one entry was unreadable (Pitfall 8)", async () => {
            const runner = vi.fn().mockRejectedValue(Object.assign(new Error("du failed"), {code: 1, stdout: "512\t/p\n"}));
            const scanner = new DiskUsageScanner(runner);

            expect(await scanner.measureBytes("/p")).toBe(524_288);
        });

        it("returns null and warns once when du is not installed (Pitfall 8)", async () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
            const runner = vi.fn().mockRejectedValue(Object.assign(new Error("spawn du ENOENT"), {code: "ENOENT"}));
            const scanner = new DiskUsageScanner(runner);

            expect(await scanner.measureBytes("/p/1")).toBeNull();
            expect(await scanner.measureBytes("/p/2")).toBeNull();
            expect(await scanner.measureBytes("/p/3")).toBeNull();

            expect(warn).toHaveBeenCalledOnce();
            expect(warn).toHaveBeenCalledWith(expect.stringContaining("du is not available"));
            warn.mockRestore();
        });

        it("returns null when du was killed by the timeout and printed nothing", async () => {
            const runner = vi
                .fn()
                .mockRejectedValue(Object.assign(new Error("timed out"), {killed: true, signal: "SIGTERM", stdout: ""}));
            const scanner = new DiskUsageScanner(runner);

            expect(await scanner.measureBytes("/p")).toBeNull();
        });

        it("returns null when the runner rejects with something that is not an error object", async () => {
            const scanner = new DiskUsageScanner(vi.fn().mockRejectedValue("boom"));

            expect(await scanner.measureBytes("/p")).toBeNull();
        });
    });

    describe("isRealDirectory", () => {
        const lstatFs = (lstat: ReturnType<typeof vi.fn>) => ({readdir: vi.fn(), lstat});

        it("is true when lstat reports a directory", async () => {
            const lstat = vi.fn().mockResolvedValue({isDirectory: () => true});
            const scanner = new DiskUsageScanner(vi.fn(), lstatFs(lstat));

            expect(await scanner.isRealDirectory("/s/a/backups")).toBe(true);
            expect(lstat).toHaveBeenCalledWith("/s/a/backups");
        });

        it("is false for a symlink, which lstat reports as a non-directory (T-14-54)", async () => {
            const lstat = vi.fn().mockResolvedValue({isDirectory: () => false});
            const scanner = new DiskUsageScanner(vi.fn(), lstatFs(lstat));

            expect(await scanner.isRealDirectory("/s/a/backups")).toBe(false);
        });

        it("is false when the path does not exist", async () => {
            const lstat = vi.fn().mockRejectedValue(Object.assign(new Error("missing"), {code: "ENOENT"}));
            const scanner = new DiskUsageScanner(vi.fn(), lstatFs(lstat));

            expect(await scanner.isRealDirectory("/s/a/backups")).toBe(false);
        });
    });

    describe("listVolumeDirectories", () => {
        it("keeps real directories only, dropping symlinks and files", async () => {
            const readdir = vi.fn().mockResolvedValue([
                dirent("db", "dir"),
                dirent("uploads", "dir"),
                dirent("link", "symlink"),
                dirent("notes.txt", "file"),
            ]);
            const scanner = new DiskUsageScanner(vi.fn(), {readdir, lstat: vi.fn()});

            const names = await scanner.listVolumeDirectories("/s/a/volumes");

            expect(names).toEqual(["db", "uploads"]);
            expect(readdir).toHaveBeenCalledWith("/s/a/volumes");
        });

        it("returns null when the directory does not exist", async () => {
            const readdir = vi.fn().mockRejectedValue(Object.assign(new Error("missing"), {code: "ENOENT"}));
            const scanner = new DiskUsageScanner(vi.fn(), {readdir, lstat: vi.fn()});

            expect(await scanner.listVolumeDirectories("/s/a/volumes")).toBeNull();
        });

        it("rethrows other read errors instead of reporting a missing folder", async () => {
            const readdir = vi.fn().mockRejectedValue(Object.assign(new Error("denied"), {code: "EACCES"}));
            const scanner = new DiskUsageScanner(vi.fn(), {readdir, lstat: vi.fn()});

            await expect(scanner.listVolumeDirectories("/s/a/volumes")).rejects.toThrow("denied");
        });
    });
});
