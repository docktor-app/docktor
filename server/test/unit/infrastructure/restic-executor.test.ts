import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

vi.mock("node:child_process");
vi.mock("node:fs/promises", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:fs/promises")>();
    return {...actual, rm: vi.fn(actual.rm)};
});

import {spawn} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import {rm} from "node:fs/promises";
import path from "node:path";
import type {ResticRepositoryTarget} from "../../../src/domain/restic-repository.js";
import {AppError} from "../../../src/lib/errors.js";
import {ResticExecutor, isRepositoryNotFoundError} from "../../../src/infrastructure/restic-executor.js";

const mockSpawn = vi.mocked(spawn);

// Helper: create a mock child process that emits stdout data then closes
function createMockProcess(stdoutLines: string[], exitCode = 0, stderrOutput = "") {
    const stdoutEmitter = {on: vi.fn()} as any;
    const stderrEmitter = {on: vi.fn()} as any;
    const process = {
        stdout: stdoutEmitter,
        stderr: stderrEmitter,
        on: vi.fn(),
    } as any;

    process.stdout.on.mockImplementation((event: string, cb: (data: Buffer) => void) => {
        if (event === "data") {
            for (const line of stdoutLines) {
                cb(Buffer.from(line + "\n"));
            }
        }
    });

    process.stderr.on.mockImplementation((event: string, cb: (data: Buffer) => void) => {
        if (event === "data" && stderrOutput) {
            cb(Buffer.from(stderrOutput));
        }
    });

    process.on.mockImplementation((event: string, cb: (code: number) => void) => {
        if (event === "close") {
            cb(exitCode);
        }
    });

    return process;
}

const TEST_KEY = "-----BEGIN OPENSSH PRIVATE KEY-----\nTEST-KEY-BODY\n-----END OPENSSH PRIVATE KEY-----";

function localTarget(env: Record<string, string> = {}): ResticRepositoryTarget {
    return {kind: "local", repository: env.RESTIC_REPOSITORY ?? "/repo", env};
}

function sftpTarget(privateKey: string = TEST_KEY): ResticRepositoryTarget {
    const repository = "sftp:backup@nas.example.com:/srv/restic/stack-1";
    return {
        kind: "sftp",
        repository,
        env: {RESTIC_REPOSITORY: repository, RESTIC_PASSWORD: "restic-pass"},
        sftp: {host: "nas.example.com", user: "backup", privateKey},
    };
}

function s3Target(): ResticRepositoryTarget {
    const repository = "s3:https://s3.example.com/docktor-backups/stack-1";
    return {
        kind: "s3",
        repository,
        env: {
            RESTIC_REPOSITORY: repository,
            RESTIC_PASSWORD: "restic-pass",
            AWS_ACCESS_KEY_ID: "AKIAEXAMPLE",
            AWS_SECRET_ACCESS_KEY: "s3-secret-example",
        },
    };
}

interface SpawnCapture {
    argv: string[];
    command: string;
    env: Record<string, string | undefined>;
    keyPath: string;
    keyContent: string;
    keyMode: number;
    keyDir: string;
}

/**
 * Mocks spawn so that the key file is inspected while "restic is running".
 * The capture is filled synchronously inside spawn, before the key can be removed.
 */
/** restic reads -o values as CSV: the whole value is quoted, inner quotes doubled. */
function decodeCsvOption(field: string): string {
    return field.slice(1, -1).replaceAll('""', '"');
}

function captureSftpSpawn(
    result: () => ReturnType<typeof createMockProcess> = () => createMockProcess([]),
): SpawnCapture {
    const capture = {} as SpawnCapture;
    mockSpawn.mockImplementation(((_bin: string, argv: string[], options: {env: Record<string, string | undefined>}) => {
        capture.argv = argv;
        capture.env = options.env;
        const command = decodeCsvOption(argv[1] ?? "");
        capture.command = command;
        const match = /-i "([^"]+)"/.exec(command);
        if (match) {
            capture.keyPath = match[1];
            capture.keyDir = path.dirname(match[1]);
            capture.keyContent = fs.readFileSync(match[1], "utf8");
            capture.keyMode = fs.statSync(match[1]).mode & 0o777;
        }
        return result();
    }) as unknown as typeof spawn);
    return capture;
}

describe("ResticExecutor", () => {
    let executor: ResticExecutor;
    let sshDir: string;

    beforeEach(() => {
        vi.clearAllMocks();
        sshDir = fs.mkdtempSync(path.join(os.tmpdir(), "docktor-restic-ssh-"));
        executor = new ResticExecutor({sshDir});
    });

    afterEach(() => {
        fs.rmSync(sshDir, {recursive: true, force: true});
    });

    describe("run()", () => {
        it("spawns restic binary with provided args and env", async () => {
            const mockProc = createMockProcess(["output line"]);
            mockSpawn.mockReturnValue(mockProc);

            await executor.run(["backup", "/path/to/stack"], localTarget({RESTIC_REPOSITORY: "/repo"}));

            expect(mockSpawn).toHaveBeenCalledWith(
                expect.stringContaining("restic"),
                ["backup", "/path/to/stack"],
                expect.objectContaining({env: expect.objectContaining({RESTIC_REPOSITORY: "/repo"})}),
            );
        });

        it("emits lines from stdout via onLine callback", async () => {
            const mockProc = createMockProcess(["line one", "line two"]);
            mockSpawn.mockReturnValue(mockProc);

            const lines: string[] = [];
            await executor.run(["backup"], localTarget(), (line) => lines.push(line));

            expect(lines).toContain("line one");
            expect(lines).toContain("line two");
        });

        it("resolves with exit code and stderr on close", async () => {
            const mockProc = createMockProcess([], 0, "some stderr");
            mockSpawn.mockReturnValue(mockProc);

            const result = await executor.run(["backup"], localTarget());

            expect(result).toMatchObject({
                exitCode: 0,
                stderr: "some stderr",
            });
        });

        it("rejects on spawn error event", async () => {
            const mockProc = {
                stdout: {on: vi.fn()},
                stderr: {on: vi.fn()},
                on: vi.fn(),
            } as any;

            mockProc.on.mockImplementation((event: string, cb: (err: Error) => void) => {
                if (event === "error") {
                    cb(new Error("spawn ENOENT"));
                }
            });

            mockSpawn.mockReturnValue(mockProc);

            await expect(executor.run(["backup"], localTarget())).rejects.toThrow("spawn ENOENT");
        });

        it("flushes partial line buffer on close", async () => {
            // If last chunk has no trailing newline, it should still be emitted
            const mockProc = {
                stdout: {on: vi.fn()},
                stderr: {on: vi.fn()},
                on: vi.fn(),
            } as any;

            mockProc.stdout.on.mockImplementation((event: string, cb: (data: Buffer) => void) => {
                if (event === "data") {
                    cb(Buffer.from("partial line without newline"));
                }
            });

            mockProc.stderr.on.mockImplementation(vi.fn());

            mockProc.on.mockImplementation((event: string, cb: (code: number) => void) => {
                if (event === "close") {
                    cb(0);
                }
            });

            mockSpawn.mockReturnValue(mockProc);

            const lines: string[] = [];
            await executor.run(["backup"], localTarget(), (line) => lines.push(line));

            expect(lines).toContain("partial line without newline");
        });

        it("emits stderr lines to onLine callback with [stderr] prefix", async () => {
            const mockProc = createMockProcess([], 0, "error line one\nerror line two\n");
            mockSpawn.mockReturnValue(mockProc);

            const lines: string[] = [];
            await executor.run(["backup"], localTarget(), (line) => lines.push(line));

            expect(lines).toContain("[stderr] error line one");
            expect(lines).toContain("[stderr] error line two");
        });

        it("captures both stdout and stderr lines via onLine", async () => {
            const mockProc = createMockProcess(["stdout line"], 0, "stderr line\n");
            mockSpawn.mockReturnValue(mockProc);

            const lines: string[] = [];
            await executor.run(["backup"], localTarget(), (line) => lines.push(line));

            expect(lines).toContain("stdout line");
            expect(lines).toContain("[stderr] stderr line");
        });

        it("buffers partial stderr lines until newline", async () => {
            const mockProc = {
                stdout: {on: vi.fn()},
                stderr: {on: vi.fn()},
                on: vi.fn(),
            } as any;

            mockProc.stdout.on.mockImplementation(vi.fn());

            // Emit stderr in chunks without complete newlines
            mockProc.stderr.on.mockImplementation((event: string, cb: (data: Buffer) => void) => {
                if (event === "data") {
                    cb(Buffer.from("partial "));
                    cb(Buffer.from("stderr line\nnext "));
                }
            });

            mockProc.on.mockImplementation((event: string, cb: (code: number) => void) => {
                if (event === "close") {
                    cb(0);
                }
            });

            mockSpawn.mockReturnValue(mockProc);

            const lines: string[] = [];
            await executor.run(["backup"], localTarget(), (line) => lines.push(line));

            expect(lines).toContain("[stderr] partial stderr line");
            expect(lines).toContain("[stderr] next"); // Flushed on close
        });

        it("flushes remaining stderr buffer on close", async () => {
            const mockProc = {
                stdout: {on: vi.fn()},
                stderr: {on: vi.fn()},
                on: vi.fn(),
            } as any;

            mockProc.stdout.on.mockImplementation(vi.fn());

            mockProc.stderr.on.mockImplementation((event: string, cb: (data: Buffer) => void) => {
                if (event === "data") {
                    cb(Buffer.from("partial stderr without newline"));
                }
            });

            mockProc.on.mockImplementation((event: string, cb: (code: number) => void) => {
                if (event === "close") {
                    cb(0);
                }
            });

            mockSpawn.mockReturnValue(mockProc);

            const lines: string[] = [];
            await executor.run(["backup"], localTarget(), (line) => lines.push(line));

            expect(lines).toContain("[stderr] partial stderr without newline");
        });
    });

    describe("run() with an SFTP target (BKP-01, D-03, D-04)", () => {
        it("prefixes restic with an ssh sftp.command carrying the key file, host pinning and user/host", async () => {
            const capture = captureSftpSpawn();

            await executor.run(["backup", "."], sftpTarget());

            expect(capture.argv.slice(0, 1)).toEqual(["-o"]);
            expect(capture.argv.slice(2)).toEqual(["backup", "."]);
            // restic reads -o values as CSV: the whole value is quoted, inner quotes doubled.
            expect(capture.argv[1].startsWith('"sftp.command=ssh ')).toBe(true);
            expect(capture.argv[1].endsWith('"')).toBe(true);
            const command = capture.command;
            const knownHosts = path.join(sshDir, "known_hosts");
            const expectedOrder = [
                `-i "${capture.keyPath}"`,
                "-o IdentitiesOnly=yes",
                "-o BatchMode=yes",
                "-o StrictHostKeyChecking=accept-new",
                `-o "UserKnownHostsFile=${knownHosts}"`,
                "-o ServerAliveInterval=60",
                "-o ServerAliveCountMax=240",
            ];
            let from = 0;
            for (const token of expectedOrder) {
                const at = command.indexOf(token, from);
                expect(at, `missing or out of order: ${token}`).toBeGreaterThanOrEqual(from);
                from = at + token.length;
            }
            expect(command.endsWith("-l backup nas.example.com -s sftp")).toBe(true);
        });

        it("writes the key as a 0600 file in a per-run directory directly under the ssh dir while restic runs", async () => {
            const capture = captureSftpSpawn();

            await executor.run(["backup", "."], sftpTarget());

            expect(path.dirname(capture.keyDir)).toBe(sshDir);
            expect(path.basename(capture.keyDir).startsWith("key-")).toBe(true);
            expect(capture.keyContent).toBe(`${TEST_KEY}\n`);
            if (process.platform !== "win32") {
                expect(capture.keyMode).toBe(0o600);
            }
        });

        it("passes repository and password in env, and the key neither in env nor in argv", async () => {
            const capture = captureSftpSpawn();

            await executor.run(["backup", "."], sftpTarget());

            expect(capture.env.RESTIC_REPOSITORY).toBe("sftp:backup@nas.example.com:/srv/restic/stack-1");
            expect(capture.env.RESTIC_PASSWORD).toBe("restic-pass");
            expect(Object.values(capture.env).join("\n")).not.toContain("TEST-KEY-BODY");
            expect(capture.argv.join("\n")).not.toContain("TEST-KEY-BODY");
        });

        it("removes the key file and its directory after the run", async () => {
            const capture = captureSftpSpawn();

            await executor.run(["backup", "."], sftpTarget());

            expect(fs.existsSync(capture.keyPath)).toBe(false);
            expect(fs.existsSync(capture.keyDir)).toBe(false);
        });

        it("applies the same identity handling to snapshots()", async () => {
            const snapshots = [{id: "abc123", time: "2024-01-01T00:00:00Z", hostname: "host", tags: ["stack-1"]}];
            const capture = captureSftpSpawn(() => createMockProcess([JSON.stringify(snapshots)]));

            const result = await executor.snapshots(sftpTarget(), "stack-1");

            expect(result).toEqual(snapshots);
            expect(capture.argv[0]).toBe("-o");
            expect(capture.argv[1].startsWith('"sftp.command=ssh ')).toBe(true);
            expect(capture.argv.slice(2)).toEqual(["snapshots", "--tag", "stack-1", "--json"]);
            expect(fs.existsSync(capture.keyDir)).toBe(false);
        });
    });

    describe("SFTP identity lifecycle and host pin (D-03, D-04)", () => {
        it("removes the key after a failed run and surfaces ssh's error", async () => {
            const capture = captureSftpSpawn(() => createMockProcess([], 255, "Host key verification failed.\n"));

            await expect(executor.run(["backup", "."], sftpTarget())).rejects.toThrow("Host key verification failed");

            expect(fs.existsSync(capture.keyPath)).toBe(false);
            expect(fs.existsSync(capture.keyDir)).toBe(false);
        });

        it("removes the key when the process cannot be spawned", async () => {
            const capture = captureSftpSpawn(() => {
                const proc = {stdout: {on: vi.fn()}, stderr: {on: vi.fn()}, on: vi.fn()} as any;
                proc.on.mockImplementation((event: string, cb: (err: Error) => void) => {
                    if (event === "error") cb(new Error("spawn ssh ENOENT"));
                });
                return proc;
            });

            await expect(executor.run(["backup", "."], sftpTarget())).rejects.toThrow("spawn ssh ENOENT");

            expect(fs.existsSync(capture.keyDir)).toBe(false);
        });

        it("does not let a failed key cleanup mask a successful restic run", async () => {
            captureSftpSpawn();
            vi.mocked(rm).mockRejectedValueOnce(new Error("EBUSY: resource busy"));

            await expect(executor.run(["backup", "."], sftpTarget())).resolves.toMatchObject({exitCode: 0});
        });

        it("does not let a failed key cleanup replace restic's own error", async () => {
            captureSftpSpawn(() => createMockProcess([], 255, "Host key verification failed.\n"));
            vi.mocked(rm).mockRejectedValueOnce(new Error("EBUSY: resource busy"));

            await expect(executor.run(["backup", "."], sftpTarget())).rejects.toThrow("Host key verification failed");
        });

        it("sweeps key directories orphaned by a hard kill, but not recent ones", async () => {
            const stale = path.join(sshDir, "key-stale");
            const recent = path.join(sshDir, "key-recent");
            fs.mkdirSync(stale);
            fs.writeFileSync(path.join(stale, "id"), "leaked-key");
            fs.mkdirSync(recent);
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
            fs.utimesSync(stale, twoHoursAgo, twoHoursAgo);
            captureSftpSpawn();

            await executor.run(["backup", "."], sftpTarget());

            expect(fs.existsSync(stale)).toBe(false);
            expect(fs.existsSync(recent)).toBe(true);
        });

        it("passes a configured SFTP port to ssh", async () => {
            const capture = captureSftpSpawn();
            const target = sftpTarget();
            if (target.kind !== "sftp") throw new Error("expected sftp target");

            await executor.run(["backup", "."], {...target, sftp: {...target.sftp, port: 2222}});

            expect(capture.command).toContain("-p 2222 ");
            expect(capture.command.endsWith("-l backup nas.example.com -s sftp")).toBe(true);
        });

        it("does not pass a port to ssh when none is configured", async () => {
            const capture = captureSftpSpawn();

            await executor.run(["backup", "."], sftpTarget());

            expect(capture.command).not.toContain(" -p ");
        });

        it("gives ssh a connect timeout so an unreachable host cannot hang for the kernel TCP timeout", async () => {
            const capture = captureSftpSpawn();

            await executor.run(["backup", "."], sftpTarget());

            expect(capture.command).toContain("-o ConnectTimeout=15");
        });

        it("keeps known_hosts untouched across runs so the first pin persists", async () => {
            const knownHosts = path.join(sshDir, "known_hosts");
            const pinned = "nas.example.com ssh-ed25519 AAAATESTKEY\n";
            fs.writeFileSync(knownHosts, pinned);
            const commands: string[] = [];
            for (let run = 0; run < 2; run++) {
                const capture = captureSftpSpawn();
                await executor.run(["backup", "."], sftpTarget());
                commands.push(capture.command);
            }

            expect(fs.readFileSync(knownHosts, "utf8")).toBe(pinned);
            for (const command of commands) {
                expect(command).toContain(`-o "UserKnownHostsFile=${knownHosts}"`);
            }
            expect(fs.readdirSync(sshDir)).toEqual(["known_hosts"]);
        });

        it("creates a missing ssh directory", async () => {
            const nested = path.join(sshDir, "nested", "ssh");
            const nestedExecutor = new ResticExecutor({sshDir: nested});
            captureSftpSpawn();

            await nestedExecutor.run(["backup", "."], sftpTarget());

            expect(fs.existsSync(nested)).toBe(true);
        });

        describe("default location", () => {
            const originalStacksDir = process.env.DOCKTOR_STACKS_DIR;
            afterEach(() => {
                if (originalStacksDir === undefined) delete process.env.DOCKTOR_STACKS_DIR;
                else process.env.DOCKTOR_STACKS_DIR = originalStacksDir;
            });

            it("keeps SSH state under <stacksDir>/.docktor/ssh", async () => {
                process.env.DOCKTOR_STACKS_DIR = sshDir;
                const defaultExecutor = new ResticExecutor();
                const capture = captureSftpSpawn();

                await defaultExecutor.run(["backup", "."], sftpTarget());

                const expectedDir = path.join(path.resolve(sshDir), ".docktor", "ssh");
                expect(capture.command).toContain(`UserKnownHostsFile=${path.join(expectedDir, "known_hosts")}`);
                expect(path.dirname(capture.keyDir)).toBe(expectedDir);
            });
        });

        it("normalises CRLF line endings in the key", async () => {
            const capture = captureSftpSpawn();

            await executor.run(["backup", "."], sftpTarget("line-1\r\nline-2"));

            expect(capture.keyContent).toBe("line-1\nline-2\n");
        });

        it("refuses an ssh directory containing a double quote before touching the filesystem", async () => {
            const badDir = path.join(sshDir, 'bad"dir');
            const badExecutor = new ResticExecutor({sshDir: badDir});

            await expect(badExecutor.run(["backup", "."], sftpTarget())).rejects.toBeInstanceOf(AppError);

            expect(mockSpawn).not.toHaveBeenCalled();
            expect(fs.existsSync(badDir)).toBe(false);
        });
    });

    describe("run() with a timeout", () => {
        function hangingProcess() {
            const proc = {stdout: {on: vi.fn()}, stderr: {on: vi.fn()}, on: vi.fn()} as any;
            proc.on.mockImplementation((event: string, cb: (code: number | null, signal: string | null) => void) => {
                if (event === "close") cb(null, "SIGTERM");
            });
            return proc;
        }

        it("passes the timeout to the spawned process", async () => {
            mockSpawn.mockReturnValue(createMockProcess([]));

            await executor.run(["cat", "config"], s3Target(), undefined, undefined, {timeoutMs: 30_000});

            expect(mockSpawn.mock.calls[0][2]).toMatchObject({timeout: 30_000});
        });

        it("rejects with a readable timeout error when restic had to be stopped", async () => {
            mockSpawn.mockReturnValue(hangingProcess());

            await expect(executor.run(["cat", "config"], s3Target(), undefined, undefined, {timeoutMs: 30_000}))
                .rejects.toThrow(/did not finish within 30 seconds/);
        });
    });

    describe("run() with an S3 target", () => {
        it("spawns restic without extra arguments and writes no files", async () => {
            mockSpawn.mockReturnValue(createMockProcess([]));

            await executor.run(["backup", "."], s3Target());

            expect(mockSpawn).toHaveBeenCalledWith(
                expect.any(String),
                ["backup", "."],
                expect.objectContaining({env: expect.objectContaining({AWS_ACCESS_KEY_ID: "AKIAEXAMPLE"})}),
            );
            expect(fs.readdirSync(sshDir)).toEqual([]);
        });
    });

    describe("backup args", () => {
        it("uses relative path '.' as first positional arg", () => {
            const args = executor.buildBackupArgs("/stacks/myapp", "stack-abc");

            expect(args[0]).toBe(".");
        });

        it("includes --exclude ./logs", () => {
            const args = executor.buildBackupArgs("/stacks/myapp", "stack-abc");

            expect(args).toContain("--exclude");
            expect(args).toContain("./logs");
        });

        it("includes --tag <stackId>", () => {
            const args = executor.buildBackupArgs("/stacks/myapp", "stack-abc");

            expect(args).toContain("--tag");
            expect(args).toContain("stack-abc");
        });

        it("includes --json flag", () => {
            const args = executor.buildBackupArgs("/stacks/myapp", "stack-abc");

            expect(args).toContain("--json");
        });

        it("includes --exclude ./backups to prevent circular backup", () => {
            const args = executor.buildBackupArgs("/stacks/myapp", "stack-abc");

            expect(args).toContain("--exclude");
            expect(args).toContain("./backups");
        });
    });

    describe("forget args", () => {
        it("builds --keep-daily N --keep-weekly N --keep-monthly N --prune flags", () => {
            const args = executor.buildForgetArgs("stack-abc", {keepDaily: 7, keepWeekly: 4, keepMonthly: 12});

            expect(args).toContain("--keep-daily");
            expect(args).toContain("7");
            expect(args).toContain("--keep-weekly");
            expect(args).toContain("4");
            expect(args).toContain("--keep-monthly");
            expect(args).toContain("12");
            expect(args).toContain("--prune");
        });

        it("includes --tag <stackId>", () => {
            const args = executor.buildForgetArgs("stack-abc", {keepDaily: 7, keepWeekly: 4, keepMonthly: 12});

            expect(args).toContain("--tag");
            expect(args).toContain("stack-abc");
        });
    });

    describe("snapshots()", () => {
        it("parses JSON output into ResticSnapshot array", async () => {
            const snapshots = [
                {id: "abc123", time: "2024-01-01T00:00:00Z", hostname: "host", tags: ["stack-1"]},
            ];
            const mockProc = createMockProcess([JSON.stringify(snapshots)]);
            mockSpawn.mockReturnValue(mockProc);

            const result = await executor.snapshots(localTarget({RESTIC_REPOSITORY: "/repo"}), "stack-1");

            expect(result).toEqual(snapshots);
        });

        it("returns empty array when exit code is 10 (repo not found)", async () => {
            const mockProc = createMockProcess([], 10, "Fatal: unable to open repo");
            mockSpawn.mockReturnValue(mockProc);

            const result = await executor.snapshots(localTarget({RESTIC_REPOSITORY: "/repo"}), "stack-1");

            expect(result).toEqual([]);
        });

        it("returns empty array for restic's real repo-not-found shape (exit 10, 'repository does not exist')", async () => {
            const mockProc = createMockProcess(
                [],
                10,
                "Fatal: repository does not exist: unable to open config file: stat /stacks/memos/backups/config: no such file or directory\nIs there a repository at the following location?\n/stacks/memos/backups",
            );
            mockSpawn.mockReturnValue(mockProc);

            const result = await executor.snapshots(localTarget({RESTIC_REPOSITORY: "/repo"}), "stack-1");

            expect(result).toEqual([]);
        });

        it("parses only stdout, so ssh's first-connection notice on stderr cannot corrupt the JSON (WR-01)", async () => {
            const snapshot = {id: "abc", time: "2026-01-01T00:00:00Z", hostname: "h", tags: ["stack-1"], paths: ["/x"], short_id: "abc"};
            const mockProc = createMockProcess(
                [JSON.stringify([snapshot])],
                0,
                "subprocess ssh: Warning: Permanently added 'nas.example.com' (ED25519) to the list of known hosts.\n",
            );
            mockSpawn.mockReturnValue(mockProc);

            const result = await executor.snapshots(localTarget({RESTIC_REPOSITORY: "/repo"}), "stack-1");

            expect(result).toEqual([snapshot]);
        });

        it("throws for an S3 Stat failure that shares the 'unable to open config file' prefix (bad credentials, not a missing repo)", async () => {
            const mockProc = createMockProcess(
                [],
                1,
                "Fatal: unable to open config file: Stat: The AWS Access Key Id you provided does not exist in our records.",
            );
            mockSpawn.mockReturnValue(mockProc);

            await expect(executor.snapshots(localTarget({RESTIC_REPOSITORY: "/repo"}), "stack-1")).rejects.toThrow();
        });

        it("throws when exit code is non-zero and not 10", async () => {
            const mockProc = createMockProcess([], 1, "Fatal: something went wrong");
            mockSpawn.mockReturnValue(mockProc);

            await expect(executor.snapshots(localTarget({RESTIC_REPOSITORY: "/repo"}), "stack-1")).rejects.toThrow();
        });
    });

    describe("isRepositoryNotFoundError()", () => {
        it("returns true for exit code 10", () => {
            const err = Object.assign(new Error("Fatal: unable to open repo"), {exitCode: 10});
            expect(isRepositoryNotFoundError(err)).toBe(true);
        });

        it("returns true for the 'repository does not exist' message", () => {
            const err = Object.assign(
                new Error(
                    "restic exited with code 10: Fatal: repository does not exist: unable to open config file: stat /stacks/memos/backups/config: no such file or directory",
                ),
                {exitCode: 10},
            );
            expect(isRepositoryNotFoundError(err)).toBe(true);
        });

        it("returns false for a backend Stat failure that only shares the 'unable to open config file' prefix", () => {
            const err = Object.assign(
                new Error("restic exited with code 1: Fatal: unable to open config file: Stat: dial tcp 10.0.0.1:9000: connect: connection refused"),
                {exitCode: 1},
            );
            expect(isRepositoryNotFoundError(err)).toBe(false);
        });

        it("returns false for a wrong-password error, even though it also exits 1", () => {
            const err = Object.assign(
                new Error("restic exited with code 1: Fatal: wrong password or no key found"),
                {exitCode: 1},
            );
            expect(isRepositoryNotFoundError(err)).toBe(false);
        });

        it("returns false for a non-Error value", () => {
            expect(isRepositoryNotFoundError("not an error")).toBe(false);
        });
    });
});
