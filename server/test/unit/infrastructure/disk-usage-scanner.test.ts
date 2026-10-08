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
    });

    describe("listVolumeDirectories", () => {
        it("keeps real directories only, dropping symlinks and files", async () => {
            const readdir = vi.fn().mockResolvedValue([
                dirent("db", "dir"),
                dirent("uploads", "dir"),
                dirent("link", "symlink"),
                dirent("notes.txt", "file"),
            ]);
            const scanner = new DiskUsageScanner(vi.fn(), {readdir});

            const names = await scanner.listVolumeDirectories("/s/a/volumes");

            expect(names).toEqual(["db", "uploads"]);
            expect(readdir).toHaveBeenCalledWith("/s/a/volumes");
        });

        it("returns null when the directory does not exist", async () => {
            const readdir = vi.fn().mockRejectedValue(Object.assign(new Error("missing"), {code: "ENOENT"}));
            const scanner = new DiskUsageScanner(vi.fn(), {readdir});

            expect(await scanner.listVolumeDirectories("/s/a/volumes")).toBeNull();
        });

        it("rethrows other read errors instead of reporting a missing folder", async () => {
            const readdir = vi.fn().mockRejectedValue(Object.assign(new Error("denied"), {code: "EACCES"}));
            const scanner = new DiskUsageScanner(vi.fn(), {readdir});

            await expect(scanner.listVolumeDirectories("/s/a/volumes")).rejects.toThrow("denied");
        });
    });
});
