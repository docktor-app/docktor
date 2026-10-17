import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import {BrownfieldScanner} from "../../../src/infrastructure/brownfield-scanner.js";
import {ComposeAnalyzer} from "../../../src/infrastructure/compose-analyzer.js";
import type {ComposeAnalyzer as ComposeAnalyzerType} from "../../../src/infrastructure/compose-analyzer.js";

vi.mock("fast-glob", () => ({
    default: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
    default: {
        access: vi.fn(),
        readFile: vi.fn(),
        constants: {R_OK: 4},
    },
}));

// This suite's fixtures are all deliberately POSIX-style scan roots and
// fast-glob outputs (representing Docktor's typical Linux/container
// deployment target), asserted with real, unmocked `node:path` — unlike
// brownfield-scanner-windows-paths.test.ts, which pins the "returns native
// separators on a native Windows host" contract via an explicit node:path
// mock, this file relies on whichever host actually runs it. On a
// windows-latest CI runner, real `node:path` resolves to its win32
// implementation, so BrownfieldScanner's (intentionally host-native, see
// that other file) `path.normalize()`/`path.dirname()` calls turn these
// POSIX literals into backslash-separated strings. Normalizing back to a
// POSIX-comparable form before comparing keeps these assertions verifying
// the scanner's platform-independent *structure* rather than accidentally
// pinning one host's separator spelling.
function toPosixComparable(p: string): string {
    return p.replace(/\\/g, "/");
}

function createMockAnalyzer() {
    return {
        analyzeCompatibility: vi.fn().mockReturnValue({
            compatibility: "green",
            namedVolumes: [],
            bindMounts: [],
            inlineEnvVars: [],
            unsupportedFeatures: [],
            serviceCount: 1,
        }),
    } as unknown as ComposeAnalyzerType;
}

// WR-04: consolidated from the former server/test/unit/brownfield-scanner.test.ts
// (deleted) and server/test/unit/infrastructure/brownfield-scanner.test.ts —
// merges the unique cases from both into this single canonical suite. Scan
// mechanics (glob patterns, permission handling, skip counts) use the mocked
// filesystem/fast-glob per project convention; compatibility-classification
// integration tests use the real ComposeAnalyzer against mocked file contents.
describe("BrownfieldScanner", () => {
    describe("scan (WIZ-06, BF-01)", () => {
        let mockFg: ReturnType<typeof vi.fn>;
        let mockAccess: ReturnType<typeof vi.fn>;
        let mockReadFile: ReturnType<typeof vi.fn>;
        let mockAnalyzer: ReturnType<typeof createMockAnalyzer>;

        beforeEach(async () => {
            vi.clearAllMocks();
            const fg = await import("fast-glob");
            mockFg = fg.default as unknown as ReturnType<typeof vi.fn>;
            const fs = await import("node:fs/promises");
            mockAccess = fs.default.access as ReturnType<typeof vi.fn>;
            mockReadFile = fs.default.readFile as ReturnType<typeof vi.fn>;
            mockAnalyzer = createMockAnalyzer();

            mockAccess.mockResolvedValue(undefined);
            mockReadFile.mockResolvedValue("services:\n  app:\n    image: nginx\n");
        });

        it("should find docker-compose.yml files in specified directories", async () => {
            mockFg.mockResolvedValue(["/home/user/projects/myapp/docker-compose.yml"]);

            const scanner = new BrownfieldScanner(mockAnalyzer);
            const result = await scanner.scan(["/home/user/projects"]);

            expect(result.stacks.length).toBeGreaterThan(0);
            expect(result.stacks[0].path).toContain("docker-compose.yml");
        });

        it("should find bare compose.yml files (no docker- prefix, WR-10)", async () => {
            mockFg.mockResolvedValue(["/home/user/projects/myapp/compose.yml"]);

            const scanner = new BrownfieldScanner(mockAnalyzer);
            const result = await scanner.scan(["/home/user/projects"]);

            expect(result.stacks.length).toBeGreaterThan(0);
            expect(result.stacks[0].path).toContain("compose.yml");
            const callPatterns = mockFg.mock.calls[0][0];
            expect(callPatterns).toContain("**/compose.yml");
        });

        it("should find docker-compose.yaml and compose.yaml files", async () => {
            mockFg.mockResolvedValue(["/opt/stacks/a/docker-compose.yaml", "/opt/stacks/b/compose.yaml"]);

            const scanner = new BrownfieldScanner(mockAnalyzer);
            const result = await scanner.scan(["/opt/stacks"]);

            const foundYamlVariants = result.stacks.some((s) => s.path.endsWith(".yaml"));
            expect(foundYamlVariants).toBe(true);
        });

        it("should skip /proc, /sys, /dev directories even if user specifies them", async () => {
            const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

            const scanner = new BrownfieldScanner(mockAnalyzer);
            const result = await scanner.scan(["/proc", "/sys", "/dev"]);

            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Skipping system directory"));
            expect(mockFg).not.toHaveBeenCalled();
            expect(result.skippedDirectories).toBe(3);

            warnSpy.mockRestore();
        });

        it("should gracefully handle permission errors and count skipped directories", async () => {
            const eacces = Object.assign(new Error("permission denied"), {code: "EACCES"});
            mockAccess.mockRejectedValue(eacces);

            const scanner = new BrownfieldScanner(mockAnalyzer);
            const result = await scanner.scan(["/root/protected"]);

            expect(result.skippedDirectories).toBeGreaterThan(0);
        });

        it("should return skippedDirectories count in results", async () => {
            mockFg.mockResolvedValue([]);

            const scanner = new BrownfieldScanner(mockAnalyzer);
            const result = await scanner.scan(["/home/user"]);

            expect(result).toHaveProperty("skippedDirectories");
            expect(typeof result.skippedDirectories).toBe("number");
        });

        it("should exclude node_modules and .git directories from scan", async () => {
            mockFg.mockResolvedValue(["/home/user/code/myapp/docker-compose.yml"]);

            const scanner = new BrownfieldScanner(mockAnalyzer);
            await scanner.scan(["/home/user/code"]);

            const callOptions = mockFg.mock.calls[0][1];
            expect(callOptions.ignore).toEqual(
                expect.arrayContaining([expect.stringContaining("node_modules"), expect.stringContaining(".git")]),
            );
        });

        // #72/D-08, RESEARCH Pitfall 3: the opted-in pre-migration backup holds a
        // copy of the old compose file that must never be offered as a stack.
        it("should exclude pre-migration-backup directories from scan", async () => {
            mockFg.mockResolvedValue(["/opt/stacks/app/docker-compose.yml"]);

            const scanner = new BrownfieldScanner(mockAnalyzer);
            await scanner.scan(["/opt/stacks"]);

            const callOptions = mockFg.mock.calls[0][1];
            expect(callOptions.ignore).toContain("**/pre-migration-backup/**");
            expect(callOptions.ignore).toEqual(
                expect.arrayContaining([expect.stringContaining("node_modules"), expect.stringContaining(".git")]),
            );
        });

        it("should return absolute paths for discovered compose files", async () => {
            mockFg.mockResolvedValue(["/opt/myapp/docker-compose.yml"]);

            const scanner = new BrownfieldScanner(mockAnalyzer);
            const result = await scanner.scan(["/opt"]);

            result.stacks.forEach((stack) => {
                expect(toPosixComparable(stack.path).startsWith("/")).toBe(true);
            });
            const callOptions = mockFg.mock.calls[0][1];
            expect(callOptions.absolute).toBe(true);
        });

        it("should return the containing directory for each discovered stack", async () => {
            mockFg.mockResolvedValue(["/opt/myapp/docker-compose.yml"]);

            const scanner = new BrownfieldScanner(mockAnalyzer);
            const result = await scanner.scan(["/opt"]);

            expect(toPosixComparable(result.stacks[0].directory)).toBe("/opt/myapp");
        });

        // G-05.1-4: pins the no-op-on-POSIX guarantee explicitly. The
        // boundary normalization added for the Windows fix must not alter
        // already-clean POSIX output on an actually-POSIX host; the
        // toPosixComparable() wrapper is a no-op there and only kicks in
        // when this suite runs for real on a win32 host (windows-latest CI).
        it("should leave an already-POSIX directory unchanged (G-05.1-4 no-op guarantee)", async () => {
            mockFg.mockResolvedValue(["/opt/myapp/docker-compose.yml"]);

            const scanner = new BrownfieldScanner(mockAnalyzer);
            const result = await scanner.scan(["/opt"]);

            expect(toPosixComparable(result.stacks[0].directory)).toBe("/opt/myapp");
        });

        it("should skip files that fail to read/parse and continue scanning others", async () => {
            mockFg.mockResolvedValue(["/opt/broken/docker-compose.yml", "/opt/ok/docker-compose.yml"]);
            mockReadFile.mockImplementation((filePath: string) => {
                if (toPosixComparable(filePath) === "/opt/broken/docker-compose.yml") {
                    return Promise.reject(new Error("EACCES: permission denied"));
                }
                return Promise.resolve("services:\n  app:\n    image: nginx\n");
            });
            const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

            const scanner = new BrownfieldScanner(mockAnalyzer);
            const result = await scanner.scan(["/opt"]);

            expect(result.stacks).toHaveLength(1);
            expect(toPosixComparable(result.stacks[0].path)).toBe("/opt/ok/docker-compose.yml");
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Could not analyze"));

            warnSpy.mockRestore();
        });
    });

    describe("scan — skipped roots with reasons (G-18-3-scan)", () => {
        let mockFg: ReturnType<typeof vi.fn>;
        let mockAccess: ReturnType<typeof vi.fn>;

        beforeEach(async () => {
            vi.clearAllMocks();
            const fg = await import("fast-glob");
            mockFg = fg.default as unknown as ReturnType<typeof vi.fn>;
            const fs = await import("node:fs/promises");
            mockAccess = fs.default.access as ReturnType<typeof vi.fn>;
            mockAccess.mockResolvedValue(undefined);
            mockFg.mockResolvedValue([]);
            vi.spyOn(console, "warn").mockImplementation(() => undefined);
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        function failAccessFor(dir: string, code: string): void {
            const error = Object.assign(new Error(code), {code});
            mockAccess.mockImplementation((target: string) =>
                target === dir ? Promise.reject(error) : Promise.resolve(undefined),
            );
        }

        it("reports a root that does not exist in the container as not_found", async () => {
            failAccessFor("/run/desktop/mnt/host/c/stacks", "ENOENT");

            const result = await new BrownfieldScanner(createMockAnalyzer()).scan(["/run/desktop/mnt/host/c/stacks"]);

            expect(result.skipped).toEqual([{directory: "/run/desktop/mnt/host/c/stacks", reason: "not_found"}]);
            expect(result.skippedDirectories).toBe(1);
        });

        it("reports ENOTDIR as not_found", async () => {
            failAccessFor("/opt/file.txt", "ENOTDIR");

            const result = await new BrownfieldScanner(createMockAnalyzer()).scan(["/opt/file.txt"]);

            expect(result.skipped).toEqual([{directory: "/opt/file.txt", reason: "not_found"}]);
        });

        it.each(["EACCES", "EPERM"])("reports %s as permission_denied", async (code) => {
            failAccessFor("/root/protected", code);

            const result = await new BrownfieldScanner(createMockAnalyzer()).scan(["/root/protected"]);

            expect(result.skipped).toEqual([{directory: "/root/protected", reason: "permission_denied"}]);
            expect(result.skippedDirectories).toBe(1);
        });

        it("reports a system directory root as system_directory and still scans the others", async () => {
            const result = await new BrownfieldScanner(createMockAnalyzer()).scan(["/proc", "/opt"]);

            expect(result.skipped).toEqual([{directory: "/proc", reason: "system_directory"}]);
            expect(result.skippedDirectories).toBe(1);
            expect(mockFg).toHaveBeenCalledTimes(1);
        });

        it("keeps request order across mixed reasons and keeps the count equal to the list length", async () => {
            mockAccess.mockImplementation((target: string) => {
                if (target === "/missing") return Promise.reject(Object.assign(new Error("x"), {code: "ENOENT"}));
                if (target === "/locked") return Promise.reject(Object.assign(new Error("x"), {code: "EACCES"}));
                return Promise.resolve(undefined);
            });

            const result = await new BrownfieldScanner(createMockAnalyzer()).scan(["/missing", "/sys", "/ok", "/locked"]);

            expect(result.skipped.map((s) => s.reason)).toEqual(["not_found", "system_directory", "permission_denied"]);
            expect(result.skipped.map((s) => s.directory)).toEqual(["/missing", "/sys", "/locked"]);
            expect(result.skippedDirectories).toBe(result.skipped.length);
        });

        it("reports the root exactly as the caller sent it", async () => {
            failAccessFor("/srv//stacks/", "ENOENT");

            const result = await new BrownfieldScanner(createMockAnalyzer()).scan(["/srv//stacks/"]);

            expect(result.skipped[0].directory).toBe("/srv//stacks/");
        });

        it("rethrows an unexpected filesystem error", async () => {
            failAccessFor("/boom", "EIO");

            await expect(new BrownfieldScanner(createMockAnalyzer()).scan(["/boom"])).rejects.toThrow("EIO");
        });

        it("returns an empty skipped list when every root is readable", async () => {
            const result = await new BrownfieldScanner(createMockAnalyzer()).scan(["/opt"]);

            expect(result.skipped).toEqual([]);
            expect(result.skippedDirectories).toBe(0);
        });
    });

    describe("scan — compatibility classification integration", () => {
        let mockFg: ReturnType<typeof vi.fn>;
        let mockAccess: ReturnType<typeof vi.fn>;
        let mockReadFile: ReturnType<typeof vi.fn>;

        beforeEach(async () => {
            vi.clearAllMocks();
            const fg = await import("fast-glob");
            mockFg = fg.default as unknown as ReturnType<typeof vi.fn>;
            const fs = await import("node:fs/promises");
            mockAccess = fs.default.access as ReturnType<typeof vi.fn>;
            mockReadFile = fs.default.readFile as ReturnType<typeof vi.fn>;
            mockAccess.mockResolvedValue(undefined);
        });

        it("discovers stacks with named volumes (yellow compatibility)", async () => {
            mockFg.mockResolvedValue(["/stacks/db/docker-compose.yml"]);
            mockReadFile.mockResolvedValue(`
services:
  db:
    image: postgres:15
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
`);
            const scanner = new BrownfieldScanner(new ComposeAnalyzer());
            const result = await scanner.scan(["/stacks"]);

            expect(result.stacks).toHaveLength(1);
            expect(result.stacks[0].compatibility).toBe("yellow");
            expect(result.stacks[0].namedVolumes).toEqual(["pgdata"]);
        });

        it("discovers stacks with absolute paths (yellow compatibility)", async () => {
            mockFg.mockResolvedValue(["/stacks/app/docker-compose.yml"]);
            mockReadFile.mockResolvedValue(`
services:
  app:
    image: nginx:latest
    volumes:
      - /mnt/nas/data:/app/data
`);
            const scanner = new BrownfieldScanner(new ComposeAnalyzer());
            const result = await scanner.scan(["/stacks"]);

            expect(result.stacks).toHaveLength(1);
            expect(result.stacks[0].compatibility).toBe("yellow");
            expect(result.stacks[0].absolutePaths).toEqual(["/mnt/nas/data"]);
        });

        it("discovers stacks with inline env vars (yellow compatibility)", async () => {
            mockFg.mockResolvedValue(["/stacks/app/docker-compose.yml"]);
            mockReadFile.mockResolvedValue(`
services:
  app:
    image: node:20
    environment:
      NODE_ENV: production
      PORT: 3000
`);
            const scanner = new BrownfieldScanner(new ComposeAnalyzer());
            const result = await scanner.scan(["/stacks"]);

            expect(result.stacks).toHaveLength(1);
            expect(result.stacks[0].compatibility).toBe("yellow");
            expect(result.stacks[0].inlineEnvVars).toBe(true);
        });

        it("discovers stacks with unsupported features (red compatibility)", async () => {
            mockFg.mockResolvedValue(["/stacks/app/docker-compose.yml"]);
            mockReadFile.mockResolvedValue(`
services:
  app:
    image: nginx:latest
    secrets:
      - db_password

secrets:
  db_password:
    file: ./password.txt
`);
            const scanner = new BrownfieldScanner(new ComposeAnalyzer());
            const result = await scanner.scan(["/stacks"]);

            expect(result.stacks).toHaveLength(1);
            expect(result.stacks[0].compatibility).toBe("red");
            expect(result.stacks[0].unsupportedFeatures).toContain("secrets");
        });

        it("handles multiple scan directories, deduplicating overlapping results", async () => {
            mockFg
                .mockResolvedValueOnce(["/stacks/a/docker-compose.yml"])
                .mockResolvedValueOnce(["/stacks/b/docker-compose.yml"]);
            mockReadFile.mockResolvedValue("services:\n  app:\n    image: nginx:latest\n");

            const scanner = new BrownfieldScanner(new ComposeAnalyzer());
            const result = await scanner.scan(["/stacks/a", "/stacks/b"]);

            expect(result.stacks).toHaveLength(2);
        });

        // G-18-4: the UAT memos stack mounts only ./data, which the scan never reported.
        it("reports a relative bind mount in relativePaths and not in absolutePaths", async () => {
            mockFg.mockResolvedValue(["/stacks/memos/docker-compose.yml"]);
            mockReadFile.mockResolvedValue(`
services:
  memos:
    image: neosmemo/memos:stable
    volumes:
      - ./data:/var/opt/memos
`);
            const result = await new BrownfieldScanner(new ComposeAnalyzer()).scan(["/stacks"]);

            expect(result.stacks[0].relativePaths).toEqual(["./data"]);
            expect(result.stacks[0].absolutePaths).toEqual([]);
            expect(result.stacks[0].namedVolumes).toEqual([]);
        });

        it("lists distinct relative sources in first-seen order across short and long form and services", async () => {
            mockFg.mockResolvedValue(["/stacks/mixed/docker-compose.yml"]);
            mockReadFile.mockResolvedValue(`
services:
  web:
    image: nginx
    volumes:
      - ./data:/a
      - /srv/media:/b
      - type: bind
        source: ./config
        target: /etc/app
  worker:
    image: nginx
    volumes:
      - ./data:/c
`);
            const result = await new BrownfieldScanner(new ComposeAnalyzer()).scan(["/stacks"]);

            expect(result.stacks[0].relativePaths).toEqual(["./data", "./config"]);
            expect(result.stacks[0].absolutePaths).toEqual(["/srv/media"]);
        });

        // WR-04: a duplicate absolute path used to surface twice and collide as a React key.
        it("lists an absolute mount used by two services once", async () => {
            mockFg.mockResolvedValue(["/stacks/shared/docker-compose.yml"]);
            mockReadFile.mockResolvedValue(`
services:
  a:
    image: nginx
    volumes:
      - /srv/media:/media
  b:
    image: nginx
    volumes:
      - /srv/media:/other
`);
            const result = await new BrownfieldScanner(new ComposeAnalyzer()).scan(["/stacks"]);

            expect(result.stacks[0].absolutePaths).toEqual(["/srv/media"]);
        });
    });
});
