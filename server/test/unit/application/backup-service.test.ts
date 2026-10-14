import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {
    BackupService,
    getBackupBroadcaster,
    ensureBackupBroadcaster,
    disposeBackupBroadcaster,
    ensureBackupLogBuffer,
    getBackupLogBuffer,
} from "../../../src/application/backup-service.js";
import {encrypt} from "../../../src/lib/crypto.js";
import {BadRequestError, NotFoundError} from "../../../src/lib/errors.js";
import {EventEmitter} from "node:events";
import path from "node:path";

const CONFIGURED_REPO_SETTINGS = {
    "backup.repoType": "local",
    "backup.repoPath": "/backups",
    "backup.password": "encrypted:abc",
};

function createMockBus() {
    return {
        emit: vi.fn(),
    };
}

// Mock node:fs/promises
vi.mock("node:fs/promises", () => ({
    readFile: vi.fn().mockResolvedValue("services:\n  web:\n    image: nginx:latest\n"),
}));

function createMockResticExecutor() {
    return {
        run: vi.fn().mockResolvedValue({exitCode: 0, stderr: ""}),
        buildBackupArgs: vi.fn().mockReturnValue(["backup", "/path"]),
        buildForgetArgs: vi.fn().mockReturnValue(["forget", "--prune"]),
        snapshots: vi.fn().mockResolvedValue([]),
        checkVersion: vi.fn().mockResolvedValue({available: true, version: "0.16.0"}),
    };
}

function createMockBackupRepository() {
    return {
        create: vi.fn().mockResolvedValue({id: "backup-1", logLines: []}),
        update: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn(),
        findByIdOrThrow: vi.fn(),
        findByStackId: vi.fn().mockResolvedValue([]),
        toDto: vi.fn((b: {sizeBytes: bigint | null; [key: string]: unknown}) => ({
            ...b,
            sizeBytes: b.sizeBytes !== null ? String(b.sizeBytes) : null,
        })),
    };
}

function createMockStackRepository() {
    return {
        findById: vi.fn(),
        findByIdOrThrow: vi.fn(),
        update: vi.fn().mockResolvedValue(undefined),
        clearConfigChanged: vi.fn().mockResolvedValue(undefined),
        updateStackHash: vi.fn().mockResolvedValue(undefined),
        replaceServices: vi.fn().mockResolvedValue(undefined),
        updateBackupConfig: vi.fn().mockResolvedValue(undefined),
    };
}

function createMockSchedulePort() {
    return {
        upsert: vi.fn(),
        remove: vi.fn(),
    };
}

function createMockSettingsService() {
    return {
        getSetting: vi.fn(),
        getMany: vi.fn(),
        upsertSetting: vi.fn(),
    };
}

function createMockStackFilesystem() {
    return {
        getStackDirectory: vi.fn().mockReturnValue("/stacks/myapp"),
        readCompose: vi.fn().mockResolvedValue("services:\n  web:\n    image: nginx"),
    };
}

function createMockDockerExecutor() {
    return {
        up: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined),
        restart: vi.fn().mockResolvedValue(undefined),
    };
}

/**
 * Reads the env of the ResticRepositoryTarget passed to a resticExecutor.run / .snapshots call. All env
 * assertions go through this helper so the call shape lives in one place.
 */
function resticEnvOf(arg: unknown): Record<string, string> {
    if (typeof arg !== "object" || arg === null || !("env" in arg)) {
        throw new Error("expected the restic repository argument to be a ResticRepositoryTarget");
    }
    // A ResticRepositoryTarget's env is a plain string record (domain/restic-repository.ts).
    return (arg as {env: Record<string, string>}).env;
}

const REMOTE_STACK = {id: "stack-1", hostPath: "/opt/docktor/stacks/stack-1"};

const S3_REPO_CONFIG = {
    repoType: "s3" as const,
    s3Endpoint: "https://s3.example.com",
    s3Bucket: "docktor-backups",
    s3AccessKey: "AKIAEXAMPLE",
    s3SecretKey: "s3-secret-example",
    password: "restic-pass",
};

const SFTP_REPO_CONFIG = {
    repoType: "sftp" as const,
    sftpHost: "nas.example.com",
    sftpUser: "backup",
    sftpKey: "-----BEGIN OPENSSH PRIVATE KEY-----\nTEST-KEY-BODY\n-----END OPENSSH PRIVATE KEY-----\n",
    repoPath: "/srv/restic",
    password: "restic-pass",
};

const SFTP_ENV = {
    RESTIC_REPOSITORY: "sftp:backup@nas.example.com:/srv/restic/stack-1",
    RESTIC_PASSWORD: "restic-pass",
};

const S3_ENV = {
    RESTIC_REPOSITORY: "s3:https://s3.example.com/docktor-backups/stack-1",
    RESTIC_PASSWORD: "restic-pass",
    AWS_ACCESS_KEY_ID: "AKIAEXAMPLE",
    AWS_SECRET_ACCESS_KEY: "s3-secret-example",
};

describe("BackupService", () => {
    let service: BackupService;
    let mockResticExecutor: ReturnType<typeof createMockResticExecutor>;
    let mockBackupRepository: ReturnType<typeof createMockBackupRepository>;
    let mockStackRepository: ReturnType<typeof createMockStackRepository>;
    let mockSettingsService: ReturnType<typeof createMockSettingsService>;
    let mockStackFilesystem: ReturnType<typeof createMockStackFilesystem>;
    let mockDockerExecutor: ReturnType<typeof createMockDockerExecutor>;
    let mockBus: ReturnType<typeof createMockBus>;
    let mockSchedulePort: ReturnType<typeof createMockSchedulePort>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockResticExecutor = createMockResticExecutor();
        mockBackupRepository = createMockBackupRepository();
        mockStackRepository = createMockStackRepository();
        mockSettingsService = createMockSettingsService();
        mockStackFilesystem = createMockStackFilesystem();
        mockDockerExecutor = createMockDockerExecutor();
        mockBus = createMockBus();
        mockSchedulePort = createMockSchedulePort();

        service = new BackupService(
            mockResticExecutor as any,
            mockBackupRepository as any,
            mockStackRepository as any,
            mockSettingsService as any,
            mockStackFilesystem as any,
            mockDockerExecutor as any,
            mockBus as any,
            mockSchedulePort as any,
        );

        // Default: stack exists and is running
        mockStackRepository.findByIdOrThrow.mockResolvedValue({
            id: "stack-1",
            slug: "myapp",
            displayName: "My App",
            status: "RUNNING",
            previousStatus: null,
            backupSchedule: null,
            backupRetention: null,
            backupPreHook: null,
            backupPostHook: null,
        });
    });

    afterEach(() => {
        // backupBroadcasters is module-level state shared across tests — a test
        // that registers an emitter (e.g. via initiateBackup or abortBackup)
        // without running a full runBackup()/runRestore() to completion must not
        // leak it into the next test.
        disposeBackupBroadcaster("backup-1");
    });

    describe("initiateBackup()", () => {
        it("creates Backup record with status IN_PROGRESS and trigger MANUAL", async () => {
            mockSettingsService.getMany.mockResolvedValue({
                "backup.repoType": "local",
                "backup.repoPath": "/backups",
                "backup.password": "encrypted:abc",
            });

            await service.initiateBackup("stack-1");

            expect(mockBackupRepository.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    stackId: "stack-1",
                    status: "IN_PROGRESS",
                    trigger: "MANUAL",
                }),
            );
        });

        it("transitions stack to BACKING_UP via assertTransition", async () => {
            mockSettingsService.getMany.mockResolvedValue({
                "backup.repoType": "local",
                "backup.repoPath": "/backups",
                "backup.password": "encrypted:abc",
            });

            await service.initiateBackup("stack-1");

            expect(mockStackRepository.update).toHaveBeenCalledWith(
                "stack-1",
                expect.objectContaining({status: "BACKING_UP"}),
            );
        });

        it("stores previousStatus before transition", async () => {
            mockStackRepository.findByIdOrThrow.mockResolvedValue({
                id: "stack-1",
                status: "RUNNING",
                previousStatus: null,
            });
            mockSettingsService.getMany.mockResolvedValue({
                "backup.repoType": "local",
                "backup.repoPath": "/backups",
                "backup.password": "encrypted:abc",
            });

            await service.initiateBackup("stack-1");

            expect(mockStackRepository.update).toHaveBeenCalledWith(
                "stack-1",
                expect.objectContaining({previousStatus: "RUNNING"}),
            );
        });

        it("registers a broadcaster for the new backup before initiateBackup returns", async () => {
            mockSettingsService.getMany.mockResolvedValue({
                "backup.repoType": "local",
                "backup.repoPath": "/backups",
                "backup.password": "encrypted:abc",
            });

            await service.initiateBackup("stack-1");

            expect(getBackupBroadcaster("backup-1")).toBeInstanceOf(EventEmitter);
        });

        it("a listener attached between initiateBackup and runBackup still receives runBackup's done event (CR-02 regression)", async () => {
            mockSettingsService.getMany.mockResolvedValue({
                "backup.repoType": "local",
                "backup.repoPath": "/backups",
                "backup.password": "encrypted:abc",
            });

            await service.initiateBackup("stack-1");
            const emitter = getBackupBroadcaster("backup-1");
            const onDone = vi.fn();
            emitter?.on("done", onDone);

            const backupRecord = {id: "backup-1", stackId: "stack-1", trigger: "MANUAL" as const, logLines: []};
            const stack = {id: "stack-1", status: "BACKING_UP" as const, previousStatus: "RUNNING" as const, backupRetention: null};
            const repoConfig = {repoType: "local" as const, repoPath: "/backups", password: "plaintext-password"};

            await service.runBackup(backupRecord as any, stack as any, repoConfig);

            expect(onDone).toHaveBeenCalledWith("COMPLETED");
        });

        it("rejects with BadRequestError and creates no row / transitions no status when no backup repository is configured", async () => {
            mockSettingsService.getMany.mockResolvedValue({});

            await expect(service.initiateBackup("stack-1")).rejects.toBeInstanceOf(BadRequestError);

            expect(mockBackupRepository.create).not.toHaveBeenCalled();
            expect(mockStackRepository.update).not.toHaveBeenCalled();
        });

        it("still produces the NotFoundError from findByIdOrThrow for an unknown stack id, not the new BadRequestError", async () => {
            mockStackRepository.findByIdOrThrow.mockRejectedValue(new NotFoundError("Stack not found"));
            mockSettingsService.getMany.mockResolvedValue({});

            await expect(service.initiateBackup("unknown-stack")).rejects.toBeInstanceOf(NotFoundError);

            expect(mockBackupRepository.create).not.toHaveBeenCalled();
            expect(mockStackRepository.update).not.toHaveBeenCalled();
        });

        it("publishes stack_status with BACKING_UP when a repository is configured", async () => {
            mockSettingsService.getMany.mockResolvedValue(CONFIGURED_REPO_SETTINGS);

            await service.initiateBackup("stack-1");

            expect(mockBus.emit).toHaveBeenCalledWith("stack.status_changed", {
                stackId: "stack-1",
                status: "BACKING_UP",
            });
        });
    });

    describe("runBackup()", () => {
        const backupRecord = {
            id: "backup-1",
            stackId: "stack-1",
            trigger: "MANUAL",
            logLines: [],
        };

        const stack = {
            id: "stack-1",
            status: "BACKING_UP",
            previousStatus: "RUNNING",
            backupRetention: null,
        };

        const repoConfig = {
            repoType: "local" as const,
            repoPath: "/backups",
            password: "plaintext-password",
        };

        it("calls resticExecutor.run with correct backup args", async () => {
            await service.runBackup(backupRecord as any, stack as any, repoConfig);

            expect(mockResticExecutor.run).toHaveBeenCalled();
        });

        it("runs restic forget after successful backup for scheduled backups", async () => {
            const scheduledRecord = {
                id: "backup-1",
                stackId: "stack-1",
                trigger: "SCHEDULED",
                logLines: [],
            };

            await service.runBackup(scheduledRecord as any, stack as any, repoConfig);

            // Should call run twice: once for backup, once for forget
            expect(mockResticExecutor.run).toHaveBeenCalledTimes(2);
        });

        it("skips forget/prune for manual backups", async () => {
            const manualBackupRecord = {
                id: "backup-manual",
                stackId: "stack-1",
                trigger: "MANUAL",
                logLines: [],
            };

            await service.runBackup(manualBackupRecord as any, stack as any, repoConfig);

            // Should call run only once: backup only, no forget
            expect(mockResticExecutor.run).toHaveBeenCalledTimes(1);
            expect(mockResticExecutor.buildForgetArgs).not.toHaveBeenCalled();
        });

        it("runs forget/prune for scheduled backups", async () => {
            const scheduledBackupRecord = {
                id: "backup-scheduled",
                stackId: "stack-1",
                trigger: "SCHEDULED",
                logLines: [],
            };

            await service.runBackup(scheduledBackupRecord as any, stack as any, repoConfig);

            // Should call run twice: backup + forget
            expect(mockResticExecutor.run).toHaveBeenCalledTimes(2);
            expect(mockResticExecutor.buildForgetArgs).toHaveBeenCalled();
        });

        it("updates Backup status to COMPLETED on success", async () => {
            await service.runBackup(backupRecord as any, stack as any, repoConfig);

            expect(mockBackupRepository.update).toHaveBeenCalledWith(
                "backup-1",
                expect.objectContaining({status: "COMPLETED"}),
            );
        });

        it("restores stack to previousStatus on success", async () => {
            await service.runBackup(backupRecord as any, stack as any, repoConfig);

            expect(mockStackRepository.update).toHaveBeenCalledWith(
                "stack-1",
                expect.objectContaining({status: "RUNNING"}),
            );
        });

        it("updates Backup status to FAILED on restic error", async () => {
            mockResticExecutor.run.mockRejectedValue(new Error("restic: connection refused"));

            await service.runBackup(backupRecord as any, stack as any, repoConfig);

            expect(mockBackupRepository.update).toHaveBeenCalledWith(
                "backup-1",
                expect.objectContaining({status: "FAILED"}),
            );
        });

        it("transitions stack to ERROR on failure", async () => {
            mockResticExecutor.run.mockRejectedValue(new Error("restic: connection refused"));

            await service.runBackup(backupRecord as any, stack as any, repoConfig);

            expect(mockStackRepository.update).toHaveBeenCalledWith(
                "stack-1",
                expect.objectContaining({status: "ERROR"}),
            );
        });

        it("emits backup.failed on failure, with the repo type from the resolved repo config", async () => {
            mockResticExecutor.run.mockRejectedValue(new Error("restic failed"));

            await service.runBackup(backupRecord as any, stack as any, repoConfig);

            // This describe block's `stack` fixture carries no displayName
            // field — the payload's displayName is `undefined` here, which
            // the notification subscriber (Task 1) falls back to the stack
            // id for.
            expect(mockBus.emit).toHaveBeenCalledWith("backup.failed", {
                stackId: "stack-1",
                displayName: undefined,
                repoType: repoConfig.repoType,
                errorMessage: "restic failed",
            });
        });

        it("completes normally when the bus emit throws — a failing notification subscriber can't strand a backup run", async () => {
            mockResticExecutor.run.mockRejectedValue(new Error("restic failed"));
            mockBus.emit.mockImplementation((event: string) => {
                if (event === "backup.failed") throw new Error("subscriber exploded");
            });

            await expect(
                service.runBackup(backupRecord as any, stack as any, repoConfig),
            ).resolves.toBeUndefined();

            expect(mockStackRepository.update).toHaveBeenCalledWith(
                "stack-1",
                expect.objectContaining({status: "ERROR"}),
            );
        });

        it("stores accumulated log lines in Backup record", async () => {
            // Simulate run producing log output via onLine callback
            mockResticExecutor.run.mockImplementation(async (_args: string[], _env: object, onLine?: (line: string) => void) => {
                onLine?.("snapshot abc123 saved");
                return {exitCode: 0, stderr: ""};
            });

            await service.runBackup(backupRecord as any, stack as any, repoConfig);

            expect(mockBackupRepository.update).toHaveBeenCalledWith(
                "backup-1",
                expect.objectContaining({
                    logLines: expect.arrayContaining(["snapshot abc123 saved"]),
                }),
            );
        });

        it("auto-initializes repo if restic init needed (exit 10 on backup)", async () => {
            // First run call (backup) exits with code 10 — repo not found
            // Service should run `restic init`, then retry backup
            const noRepoError = Object.assign(new Error("exit code 10"), {exitCode: 10});
            mockResticExecutor.run
                .mockRejectedValueOnce(noRepoError)
                .mockResolvedValue({exitCode: 0, stderr: ""});

            await service.runBackup(backupRecord as any, stack as any, repoConfig);

            // run should be called at least 3 times: backup (fail) → init → backup (ok) → forget
            expect(mockResticExecutor.run.mock.calls.length).toBeGreaterThanOrEqual(3);
        });

        it("auto-initializes repo on restic's real repo-not-found shape (exit 10, 'repository does not exist')", async () => {
            // Reproduced directly against restic 0.18: `restic backup` on a non-existent repo
            // exits 10 with this message.
            const realRepoNotFoundError = Object.assign(
                new Error(
                    "restic exited with code 10: Fatal: repository does not exist: unable to open config file: stat /stacks/memos/backups/config: no such file or directory\nIs there a repository at the following location?\n/stacks/memos/backups",
                ),
                {exitCode: 10},
            );
            mockResticExecutor.run
                .mockRejectedValueOnce(realRepoNotFoundError)
                .mockResolvedValue({exitCode: 0, stderr: ""});

            await service.runBackup(backupRecord as any, stack as any, repoConfig);

            expect(mockResticExecutor.run.mock.calls.length).toBeGreaterThanOrEqual(3);
            const backupResult = mockBackupRepository.update.mock.calls.find(
                (call: any[]) => call[1]?.status === "COMPLETED",
            );
            expect(backupResult).toBeDefined();
        });

        it("does not auto-init on a wrong-password error, even though it also exits 1", async () => {
            const wrongPasswordError = Object.assign(
                new Error("restic exited with code 1: Fatal: wrong password or no key found"),
                {exitCode: 1},
            );
            mockResticExecutor.run.mockRejectedValue(wrongPasswordError);

            await service.runBackup(backupRecord as any, stack as any, repoConfig);

            // Only the original failing call — no init, no retry
            expect(mockResticExecutor.run).toHaveBeenCalledTimes(1);
            expect(mockBackupRepository.update).toHaveBeenCalledWith(
                backupRecord.id,
                expect.objectContaining({status: "FAILED"}),
            );
        });

        it("emits done with COMPLETED status on success", async () => {
            const promise = service.runBackup(backupRecord as any, stack as any, repoConfig);
            const emitter = getBackupBroadcaster(backupRecord.id);
            const onDone = vi.fn();
            emitter?.on("done", onDone);

            await promise;

            expect(onDone).toHaveBeenCalledWith("COMPLETED");
        });

        it("emits done with FAILED status on restic error", async () => {
            mockResticExecutor.run.mockRejectedValue(new Error("restic: connection refused"));

            const promise = service.runBackup(backupRecord as any, stack as any, repoConfig);
            const emitter = getBackupBroadcaster(backupRecord.id);
            const onDone = vi.fn();
            emitter?.on("done", onDone);

            await promise;

            expect(onDone).toHaveBeenCalledWith("FAILED");
        });

        it("persists a [error] logLines entry containing the rejection message on failure", async () => {
            mockResticExecutor.run.mockRejectedValue(new Error("restic: connection refused"));

            await service.runBackup(backupRecord as any, stack as any, repoConfig);

            const failedUpdate = mockBackupRepository.update.mock.calls.find(
                (call: any[]) => call[1]?.status === "FAILED",
            );
            expect(failedUpdate).toBeDefined();
            const persistedLines = failedUpdate?.[1]?.logLines as string[];
            expect(persistedLines[persistedLines.length - 1]).toMatch(/^\[error\] /);
            expect(persistedLines[persistedLines.length - 1]).toContain("restic: connection refused");
        });

        it("persists a non-empty logLines array when restic rejects before any onLine call", async () => {
            mockResticExecutor.run.mockRejectedValue(new Error("restic binary not found"));

            await service.runBackup(backupRecord as any, stack as any, repoConfig);

            const failedUpdate = mockBackupRepository.update.mock.calls.find(
                (call: any[]) => call[1]?.status === "FAILED",
            );
            expect(failedUpdate?.[1]?.logLines.length).toBeGreaterThan(0);
        });

        it("emits the [error] line on the line event before the stream closes", async () => {
            mockResticExecutor.run.mockRejectedValue(new Error("restic: connection refused"));

            const promise = service.runBackup(backupRecord as any, stack as any, repoConfig);
            const emitter = getBackupBroadcaster(backupRecord.id);
            const onLine = vi.fn();
            emitter?.on("line", onLine);

            await promise;

            expect(onLine).toHaveBeenCalledWith(expect.stringContaining("[error] restic: connection refused"));
        });

        it("persists logLines with no [error] entry on success", async () => {
            await service.runBackup(backupRecord as any, stack as any, repoConfig);

            const completedUpdate = mockBackupRepository.update.mock.calls.find(
                (call: any[]) => call[1]?.status === "COMPLETED",
            );
            const persistedLines = completedUpdate?.[1]?.logLines as string[];
            expect(persistedLines.some((line) => line.startsWith("[error] "))).toBe(false);
        });

        it("removes the broadcaster once runBackup resolves", async () => {
            await service.runBackup(backupRecord as any, stack as any, repoConfig);

            expect(getBackupBroadcaster(backupRecord.id)).toBeUndefined();
        });

        it("publishes stack_status with the stack's restored previous status on success", async () => {
            await service.runBackup(backupRecord as any, stack as any, repoConfig);

            expect(mockBus.emit).toHaveBeenCalledWith("stack.status_changed", {
                stackId: "stack-1",
                status: "RUNNING",
            });
        });

        it("publishes stack_status with ERROR on failure", async () => {
            mockResticExecutor.run.mockRejectedValue(new Error("restic: connection refused"));

            await service.runBackup(backupRecord as any, stack as any, repoConfig);

            expect(mockBus.emit).toHaveBeenCalledWith("stack.status_changed", {
                stackId: "stack-1",
                status: "ERROR",
            });
        });

        it("resolves the stack repository write before emitting stack.status_changed", async () => {
            const order: string[] = [];
            mockStackRepository.update.mockImplementation(async () => {
                order.push("stackRepo.update");
            });
            mockBus.emit.mockImplementation(() => {
                order.push("bus.emit");
            });

            await service.runBackup(backupRecord as any, stack as any, repoConfig);

            expect(order).toEqual(["stackRepo.update", "bus.emit"]);
        });
    });

    describe("log buffer (WR-01 — live SSE replay)", () => {
        it("getBackupLogBuffer returns undefined for a backup id no run has started", () => {
            expect(getBackupLogBuffer("no-run-started-for-this-id")).toBeUndefined();
        });

        it("ensureBackupLogBuffer returns the same array instance on repeated calls for one id", () => {
            const first = ensureBackupLogBuffer("backup-1");
            const second = ensureBackupLogBuffer("backup-1");

            expect(first).toBe(second);
        });

        it("while runBackup is mid-run, getBackupLogBuffer(backupRecord.id) contains every line already handed to the executor's line callback, in arrival order", async () => {
            const backupRecord = {id: "backup-1", stackId: "stack-1", trigger: "MANUAL", logLines: []};
            const stack = {id: "stack-1", status: "BACKING_UP", previousStatus: "RUNNING", backupRetention: null};
            const repoConfig = {repoType: "local" as const, repoPath: "/backups", password: "plaintext-password"};

            let assertedInsideCallback = false;
            mockResticExecutor.run.mockImplementation(
                async (_args: string[], _env: object, onLine?: (line: string) => void) => {
                    onLine?.("line one");
                    onLine?.("line two");
                    // Assert from inside the mocked executor's callback — the point
                    // at which lines have been emitted but the run has not finished —
                    // so mid-run visibility is real, not inferred from the terminal state.
                    expect(getBackupLogBuffer(backupRecord.id)).toEqual(["line one", "line two"]);
                    assertedInsideCallback = true;
                    return {exitCode: 0, stderr: ""};
                },
            );

            await service.runBackup(backupRecord as any, stack as any, repoConfig);

            expect(assertedInsideCallback).toBe(true);
        });

        it("getBackupLogBuffer(backupRecord.id) is undefined after runBackup reaches a terminal state", async () => {
            const backupRecord = {id: "backup-1", stackId: "stack-1", trigger: "MANUAL", logLines: []};
            const stack = {id: "stack-1", status: "BACKING_UP", previousStatus: "RUNNING", backupRetention: null};
            const repoConfig = {repoType: "local" as const, repoPath: "/backups", password: "plaintext-password"};

            await service.runBackup(backupRecord as any, stack as any, repoConfig);

            expect(getBackupLogBuffer(backupRecord.id)).toBeUndefined();
        });

        it("while runRestoreProcess is mid-run, getBackupLogBuffer(backup.id) contains every line already handed to the executor's line callback, in arrival order (restore parity)", async () => {
            // runRestoreProcess() re-checks the backup repository is configured
            // before touching restic (WR-05) — configure one so this test still
            // reaches resticExecutor.run.
            mockSettingsService.getMany.mockResolvedValue(CONFIGURED_REPO_SETTINGS);

            const snapshotId = "abc123def456";
            const backupRecord = {id: "backup-1", stackId: "stack-1", trigger: "RESTORE", logLines: []};
            const stack = {id: "stack-1", displayName: "My App", status: "RESTORING", previousStatus: "RUNNING", hostPath: null};

            let assertedInsideCallback = false;
            mockResticExecutor.run.mockImplementation(
                async (_args: string[], _env: object, onLine?: (line: string) => void) => {
                    onLine?.("restore line one");
                    onLine?.("restore line two");
                    expect(getBackupLogBuffer("backup-1")).toEqual(["restore line one", "restore line two"]);
                    assertedInsideCallback = true;
                    return {exitCode: 0, stderr: ""};
                },
            );

            await service.runRestoreProcess(backupRecord as any, stack as any, snapshotId);

            expect(assertedInsideCallback).toBe(true);
        });
    });

    describe("getBackupRepoConfig()", () => {
        it("reads backup.* settings from SettingsService", async () => {
            mockSettingsService.getMany.mockResolvedValue({
                "backup.repoType": "local",
                "backup.repoPath": "/backups",
                "backup.password": "encrypted:xyz",
            });

            await (service as any).getBackupRepoConfig();

            expect(mockSettingsService.getMany).toHaveBeenCalledWith(
                expect.arrayContaining(["backup.repoType", "backup.password"]),
            );
        });

        it("decrypts password field using decrypt()", async () => {
            mockSettingsService.getMany.mockResolvedValue({
                "backup.repoType": "local",
                "backup.repoPath": "/backups",
                "backup.password": "encrypted:abc123",
            });

            const config = await (service as any).getBackupRepoConfig();

            // Password should be decrypted, not raw
            expect(config?.password).not.toBe("encrypted:abc123");
        });

        it("returns null if repoType not configured", async () => {
            mockSettingsService.getMany.mockResolvedValue({});

            const config = await (service as any).getBackupRepoConfig();

            expect(config).toBeNull();
        });
    });

    describe("detectAbsolutePathVolumes()", () => {
        it("returns empty array when all volumes are relative or under stack path", () => {
            const composeContent = `
services:
  web:
    image: nginx
    volumes:
      - ./data:/var/www/html
      - /stacks/myapp/volumes/db:/var/lib/postgresql/data
`;
            const warnings = (service as any).detectAbsolutePathVolumes(composeContent, "/stacks/myapp");

            expect(warnings).toEqual([]);
        });

        it("returns warning strings for absolute paths outside stack directory", () => {
            const composeContent = `
services:
  web:
    image: nginx
    volumes:
      - /etc/nginx/conf.d:/etc/nginx/conf.d
`;
            const warnings = (service as any).detectAbsolutePathVolumes(composeContent, "/stacks/myapp");

            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings[0]).toContain("/etc/nginx/conf.d");
        });

        it("handles both short syntax and long syntax volume definitions", () => {
            const composeContent = `
services:
  db:
    image: postgres
    volumes:
      - type: bind
        source: /external/data
        target: /var/lib/postgresql/data
`;
            const warnings = (service as any).detectAbsolutePathVolumes(composeContent, "/stacks/myapp");

            expect(warnings.length).toBeGreaterThan(0);
        });
    });

    describe("initiateRestore()", () => {
        const snapshotId = "abc123def456";

        beforeEach(() => {
            // initiateRestore now guards on a configured repository (Task 1) —
            // configure one by default so the pre-existing happy-path tests in
            // this describe block are unaffected by the new guard.
            mockSettingsService.getMany.mockResolvedValue(CONFIGURED_REPO_SETTINGS);
        });

        it("creates Backup record with trigger RESTORE and status IN_PROGRESS", async () => {
            await service.initiateRestore("stack-1", snapshotId);

            expect(mockBackupRepository.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    stackId: "stack-1",
                    trigger: "RESTORE",
                    status: "IN_PROGRESS",
                    resticSnapshotId: snapshotId,
                }),
            );
        });

        it("transitions stack to RESTORING", async () => {
            await service.initiateRestore("stack-1", snapshotId);

            expect(mockStackRepository.update).toHaveBeenCalledWith(
                "stack-1",
                expect.objectContaining({status: "RESTORING"}),
            );
        });

        it("registers a broadcaster for the new backup before initiateRestore returns (mirrors initiateBackup, BCK-09)", async () => {
            await service.initiateRestore("stack-1", snapshotId);

            expect(getBackupBroadcaster("backup-1")).toBeInstanceOf(EventEmitter);
        });

        it("rejects with BadRequestError and creates no row / transitions no status when no backup repository is configured", async () => {
            mockSettingsService.getMany.mockResolvedValue({});

            await expect(service.initiateRestore("stack-1", snapshotId)).rejects.toBeInstanceOf(BadRequestError);

            expect(mockBackupRepository.create).not.toHaveBeenCalled();
            expect(mockStackRepository.update).not.toHaveBeenCalled();
        });

        it("publishes stack_status with RESTORING when a repository is configured", async () => {
            await service.initiateRestore("stack-1", snapshotId);

            expect(mockBus.emit).toHaveBeenCalledWith("stack.status_changed", {
                stackId: "stack-1",
                status: "RESTORING",
            });
        });
    });

    describe("runRestoreProcess()", () => {
        const snapshotId = "abc123def456";
        const backupRecord = {
            id: "backup-1",
            stackId: "stack-1",
            trigger: "RESTORE",
            resticSnapshotId: snapshotId,
            logLines: [],
        };
        const stack = {
            id: "stack-1",
            displayName: "My App",
            status: "RESTORING",
            previousStatus: "RUNNING",
            hostPath: null,
        };

        beforeEach(() => {
            // runRestoreProcess() now re-checks the backup repository is
            // configured before touching restic (WR-05) — configure one by
            // default so the pre-existing tests below (which exercise restic
            // success/failure, not repo configuration) are unaffected.
            mockSettingsService.getMany.mockResolvedValue(CONFIGURED_REPO_SETTINGS);
        });

        it("fails with the same clear message as initiateRestore instead of running restic with an empty env when the backup repository is unconfigured (WR-05 regression)", async () => {
            mockSettingsService.getMany.mockResolvedValue({});

            await service.runRestoreProcess(backupRecord as any, stack as any, snapshotId);

            // Must not have attempted the restore with an empty/missing env.
            expect(mockResticExecutor.run).not.toHaveBeenCalled();

            expect(mockBackupRepository.update).toHaveBeenCalledWith(
                backupRecord.id,
                expect.objectContaining({
                    status: "FAILED",
                    errorMessage: expect.stringContaining("No backup repository is configured"),
                }),
            );
            expect(mockStackRepository.update).toHaveBeenCalledWith(
                "stack-1",
                expect.objectContaining({status: "ERROR"}),
            );
        });

        it("stops the stack before restoring", async () => {
            await service.runRestoreProcess(backupRecord as any, stack as any, snapshotId);

            // Should call docker.stop before restore
            expect(mockDockerExecutor.stop).toHaveBeenCalledWith("stack-1");
        });

        it("calls resticExecutor.run with restore args and --target .", async () => {
            await service.runRestoreProcess(backupRecord as any, stack as any, snapshotId);

            expect(mockResticExecutor.run).toHaveBeenCalledWith(
                expect.arrayContaining(["restore", snapshotId, "--target", "."]),
                expect.any(Object),
                expect.any(Function),
                ".", // cwd parameter
            );
        });

        it("redeploys stack after successful restore", async () => {
            await service.runRestoreProcess(backupRecord as any, stack as any, snapshotId);

            // Should call docker.up after restore
            expect(mockDockerExecutor.up).toHaveBeenCalledWith("stack-1");
            expect(mockStackRepository.update).toHaveBeenCalledWith(
                "stack-1",
                expect.objectContaining({status: "RUNNING"}),
            );
        });

        it("clears configChanged flag after successful restore", async () => {
            await service.runRestoreProcess(backupRecord as any, stack as any, snapshotId);

            // Should call clearConfigChanged to remove "Configuration has changed" warning
            expect(mockStackRepository.clearConfigChanged).toHaveBeenCalledWith("stack-1");
        });

        it("syncs database with restored compose file", async () => {
            await service.runRestoreProcess(backupRecord as any, stack as any, snapshotId);

            // Should update hash and services to match restored compose
            expect(mockStackRepository.updateStackHash).toHaveBeenCalledWith(
                expect.objectContaining({stackId: "stack-1", hash: expect.any(String)}),
            );
            expect(mockStackRepository.replaceServices).toHaveBeenCalledWith(
                "stack-1",
                expect.objectContaining({hash: expect.any(String), services: expect.any(Array)}),
            );
        });

        it("transitions stack to ERROR on restore failure", async () => {
            mockResticExecutor.run.mockRejectedValue(new Error("restore failed"));

            await service.runRestoreProcess(backupRecord as any, stack as any, snapshotId);

            expect(mockStackRepository.update).toHaveBeenCalledWith(
                "stack-1",
                expect.objectContaining({status: "ERROR"}),
            );
        });

        it("stores log lines and error message on failure", async () => {
            mockResticExecutor.run.mockRejectedValue(new Error("restore: corrupted data"));

            await service.runRestoreProcess(backupRecord as any, stack as any, snapshotId);

            expect(mockBackupRepository.update).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    status: "FAILED",
                    errorMessage: expect.stringContaining("restore"),
                }),
            );
        });

        it("emits done with COMPLETED status on success", async () => {
            // ensureBackupBroadcaster runs synchronously before the first await
            // inside runRestoreProcess, so the emitter is already registered by
            // the time this call returns control to the caller.
            const promise = service.runRestoreProcess(backupRecord as any, stack as any, snapshotId);
            const emitter = getBackupBroadcaster("backup-1");
            const onDone = vi.fn();
            emitter?.on("done", onDone);

            await promise;

            expect(onDone).toHaveBeenCalledWith("COMPLETED");
        });

        it("emits done with FAILED status on restore failure", async () => {
            mockResticExecutor.run.mockRejectedValue(new Error("restore failed"));

            const promise = service.runRestoreProcess(backupRecord as any, stack as any, snapshotId);
            const emitter = getBackupBroadcaster("backup-1");
            const onDone = vi.fn();
            emitter?.on("done", onDone);

            await promise;

            expect(onDone).toHaveBeenCalledWith("FAILED");
        });

        it("persists a [error] logLines entry containing the rejection message on failure", async () => {
            mockResticExecutor.run.mockRejectedValue(new Error("restore: corrupted data"));

            await service.runRestoreProcess(backupRecord as any, stack as any, snapshotId);

            const failedUpdate = mockBackupRepository.update.mock.calls.find(
                (call: any[]) => call[1]?.status === "FAILED",
            );
            const persistedLines = failedUpdate?.[1]?.logLines as string[];
            expect(persistedLines[persistedLines.length - 1]).toMatch(/^\[error\] /);
            expect(persistedLines[persistedLines.length - 1]).toContain("restore: corrupted data");
        });

        it("persists a non-empty logLines array when restore rejects before any onLine call", async () => {
            mockResticExecutor.run.mockRejectedValue(new Error("restore binary not found"));

            await service.runRestoreProcess(backupRecord as any, stack as any, snapshotId);

            const failedUpdate = mockBackupRepository.update.mock.calls.find(
                (call: any[]) => call[1]?.status === "FAILED",
            );
            expect(failedUpdate?.[1]?.logLines.length).toBeGreaterThan(0);
        });

        it("registers its emitter through ensureBackupBroadcaster and removes it through disposeBackupBroadcaster, same as runBackup (BCK-09)", async () => {
            await service.runRestoreProcess(backupRecord as any, stack as any, snapshotId);

            // By the time runRestoreProcess resolves, its broadcaster has already
            // gone through the same register/dispose pair runBackup uses — verified
            // by the absence of a leftover entry (disposeBackupBroadcaster ran) and
            // by the "emits done" cases above (ensureBackupBroadcaster ran, since
            // those attach a listener to the emitter it returns).
            expect(getBackupBroadcaster("backup-1")).toBeUndefined();
        });

        it("publishes stack_status with RUNNING on successful restore", async () => {
            await service.runRestoreProcess(backupRecord as any, stack as any, snapshotId);

            expect(mockBus.emit).toHaveBeenCalledWith("stack.status_changed", {
                stackId: "stack-1",
                status: "RUNNING",
            });
        });

        it("publishes stack_status with ERROR on restore failure", async () => {
            mockResticExecutor.run.mockRejectedValue(new Error("restore failed"));

            await service.runRestoreProcess(backupRecord as any, stack as any, snapshotId);

            expect(mockBus.emit).toHaveBeenCalledWith("stack.status_changed", {
                stackId: "stack-1",
                status: "ERROR",
            });
        });

        it("emits restore.started before any restic work begins", async () => {
            await service.runRestoreProcess(backupRecord as any, stack as any, snapshotId);

            expect(mockBus.emit).toHaveBeenCalledWith("restore.started", {
                stackId: "stack-1",
                displayName: "My App",
                snapshotId,
            });
        });

        it("emits restore.completed on successful restore", async () => {
            await service.runRestoreProcess(backupRecord as any, stack as any, snapshotId);

            expect(mockBus.emit).toHaveBeenCalledWith("restore.completed", {
                stackId: "stack-1",
                displayName: "My App",
                snapshotId,
            });
        });

        it("emits restore.failed on restore failure, with the error message", async () => {
            mockResticExecutor.run.mockRejectedValue(new Error("restore: corrupted data"));

            await service.runRestoreProcess(backupRecord as any, stack as any, snapshotId);

            expect(mockBus.emit).toHaveBeenCalledWith("restore.failed", {
                stackId: "stack-1",
                displayName: "My App",
                snapshotId,
                errorMessage: "restore: corrupted data",
            });
        });

        it("completes normally when the bus emit throws for every restore-lifecycle event", async () => {
            mockBus.emit.mockImplementation((event: string) => {
                if (event.startsWith("restore.")) throw new Error("subscriber exploded");
            });

            await expect(
                service.runRestoreProcess(backupRecord as any, stack as any, snapshotId),
            ).resolves.toBeUndefined();

            expect(mockStackRepository.update).toHaveBeenCalledWith(
                "stack-1",
                expect.objectContaining({status: "RUNNING"}),
            );
        });
    });

    describe("abortBackup()", () => {
        it("sets an IN_PROGRESS row to FAILED with completedAt, errorMessage, and a single [error] logLines entry", async () => {
            mockBackupRepository.findById.mockResolvedValue({id: "backup-1", status: "IN_PROGRESS"});

            await service.abortBackup("backup-1", "stack-1", "No backup repository is configured.");

            expect(mockBackupRepository.update).toHaveBeenCalledWith(
                "backup-1",
                expect.objectContaining({
                    status: "FAILED",
                    completedAt: expect.any(Date),
                    errorMessage: "No backup repository is configured.",
                    logLines: ["[error] No backup repository is configured."],
                }),
            );
        });

        it("transitions the stack to ERROR", async () => {
            mockBackupRepository.findById.mockResolvedValue({id: "backup-1", status: "IN_PROGRESS"});

            await service.abortBackup("backup-1", "stack-1", "boom");

            expect(mockStackRepository.update).toHaveBeenCalledWith(
                "stack-1",
                expect.objectContaining({status: "ERROR"}),
            );
        });

        it("emits backup.failed with the stack id, the resolved stack's display name, and no repo type", async () => {
            mockBackupRepository.findById.mockResolvedValue({id: "backup-1", status: "IN_PROGRESS"});

            await service.abortBackup("backup-1", "stack-1", "boom");

            // mockStackRepository.findByIdOrThrow resolves to displayName
            // "My App" per the outer beforeEach's default stub.
            expect(mockBus.emit).toHaveBeenCalledWith("backup.failed", {
                stackId: "stack-1",
                displayName: "My App",
                errorMessage: "boom",
            });
        });

        it("falls back to the stack id as the display name when the stack row can't be read", async () => {
            mockBackupRepository.findById.mockResolvedValue({id: "backup-1", status: "IN_PROGRESS"});
            mockStackRepository.findByIdOrThrow.mockRejectedValueOnce(new Error("stack not found"));

            await service.abortBackup("backup-1", "stack-1", "boom");

            expect(mockBus.emit).toHaveBeenCalledWith("backup.failed", {
                stackId: "stack-1",
                displayName: "stack-1",
                errorMessage: "boom",
            });
        });

        it("is a no-op on a row that is already COMPLETED", async () => {
            mockBackupRepository.findById.mockResolvedValue({id: "backup-1", status: "COMPLETED"});

            await service.abortBackup("backup-1", "stack-1", "boom");

            expect(mockBackupRepository.update).not.toHaveBeenCalled();
            expect(mockStackRepository.update).not.toHaveBeenCalled();
            expect(mockBus.emit).not.toHaveBeenCalled();
        });

        it("is a no-op on a row that is already FAILED", async () => {
            mockBackupRepository.findById.mockResolvedValue({id: "backup-1", status: "FAILED"});

            await service.abortBackup("backup-1", "stack-1", "boom");

            expect(mockBackupRepository.update).not.toHaveBeenCalled();
            expect(mockStackRepository.update).not.toHaveBeenCalled();
            expect(mockBus.emit).not.toHaveBeenCalled();
        });

        it("is a no-op and does not throw on an unknown backup id", async () => {
            mockBackupRepository.findById.mockResolvedValue(null);

            await expect(service.abortBackup("unknown-id", "stack-1", "boom")).resolves.toBeUndefined();

            expect(mockBackupRepository.update).not.toHaveBeenCalled();
            expect(mockStackRepository.update).not.toHaveBeenCalled();
            expect(mockBus.emit).not.toHaveBeenCalled();
        });

        it("on a still-IN_PROGRESS row, emits done with FAILED on the registered emitter, then removes it", async () => {
            mockBackupRepository.findById.mockResolvedValue({id: "backup-1", status: "IN_PROGRESS"});
            const emitter = ensureBackupBroadcaster("backup-1");
            const onDone = vi.fn();
            emitter.on("done", onDone);

            await service.abortBackup("backup-1", "stack-1", "boom");

            expect(onDone).toHaveBeenCalledWith("FAILED");
            expect(getBackupBroadcaster("backup-1")).toBeUndefined();
        });

        // Behavioural change (D-17, plan 10-12): abortBackup() used to
        // `await this.notificationService.notify(...)` directly inside its
        // try block with no catch — a rejecting notify() propagated past
        // this method's own return, even though the `finally` below still
        // ran the terminal `done` emit and broadcaster disposal first. Now
        // that the notification path is a `bus.emit()` wrapped in its own
        // try/catch (never awaited, never able to throw), that propagation
        // path is gone entirely — proven below by a throwing bus.emit no
        // longer causing abortBackup() itself to reject, only logging.
        it("resolves normally even when the bus emit throws — a rejecting notification path can no longer propagate past abortBackup's finally", async () => {
            mockBackupRepository.findById.mockResolvedValue({id: "backup-1", status: "IN_PROGRESS"});
            mockBus.emit.mockImplementation(() => {
                throw new Error("subscriber exploded");
            });
            const emitter = ensureBackupBroadcaster("backup-1");
            const onDone = vi.fn();
            emitter.on("done", onDone);

            await expect(service.abortBackup("backup-1", "stack-1", "boom")).resolves.toBeUndefined();

            expect(onDone).toHaveBeenCalledWith("FAILED");
            expect(getBackupBroadcaster("backup-1")).toBeUndefined();
        });

        it("on a row that is already COMPLETED or FAILED, emits nothing and leaves the registered emitter in place", async () => {
            mockBackupRepository.findById.mockResolvedValue({id: "backup-1", status: "COMPLETED"});
            const emitter = ensureBackupBroadcaster("backup-1");
            const onDone = vi.fn();
            emitter.on("done", onDone);

            await service.abortBackup("backup-1", "stack-1", "boom");

            expect(onDone).not.toHaveBeenCalled();
            expect(getBackupBroadcaster("backup-1")).toBe(emitter);
        });

        it("publishes stack_status with ERROR", async () => {
            mockBackupRepository.findById.mockResolvedValue({id: "backup-1", status: "IN_PROGRESS"});

            await service.abortBackup("backup-1", "stack-1", "boom");

            expect(mockBus.emit).toHaveBeenCalledWith("stack.status_changed", {
                stackId: "stack-1",
                status: "ERROR",
            });
        });

        it("swallows a throwing bus emit — the status write and the terminal done frame still complete", async () => {
            mockBackupRepository.findById.mockResolvedValue({id: "backup-1", status: "IN_PROGRESS"});
            mockBus.emit.mockImplementation(() => {
                throw new Error("subscriber exploded");
            });
            const emitter = ensureBackupBroadcaster("backup-1");
            const onDone = vi.fn();
            emitter.on("done", onDone);

            await service.abortBackup("backup-1", "stack-1", "boom");

            expect(mockStackRepository.update).toHaveBeenCalledWith(
                "stack-1",
                expect.objectContaining({status: "ERROR"}),
            );
            expect(onDone).toHaveBeenCalledWith("FAILED");
            expect(getBackupBroadcaster("backup-1")).toBeUndefined();
        });
    });

    describe("runPreHook() / runPostHook()", () => {
        it("executes shell command via spawn and collects output", async () => {
            const output = await (service as any).runHook("echo hello", "/stacks/myapp");

            expect(output).toBeDefined();
        });

        it("skips if hook is null or empty", async () => {
            const resultNull = await (service as any).runHook(null, "/stacks/myapp");
            const resultEmpty = await (service as any).runHook("", "/stacks/myapp");

            expect(resultNull).toBeUndefined();
            expect(resultEmpty).toBeUndefined();
        });
    });

    describe("remote repository routing (BKP-01, #68)", () => {
        const snapshotId = "abc123def456";
        const backupRecord = {id: "backup-1", stackId: "stack-1", trigger: "MANUAL", logLines: []};
        const backupStack = {
            ...REMOTE_STACK,
            status: "BACKING_UP",
            previousStatus: "RUNNING",
            backupRetention: null,
            backupPreHook: null,
            backupPostHook: null,
        };
        const restoreRecord = {...backupRecord, trigger: "RESTORE", resticSnapshotId: snapshotId};
        const restoreStack = {...REMOTE_STACK, displayName: "My App", status: "RESTORING", previousStatus: "RUNNING"};

        const originalEncryptionKey = process.env.ENCRYPTION_KEY;
        afterEach(() => {
            if (originalEncryptionKey === undefined) delete process.env.ENCRYPTION_KEY;
            else process.env.ENCRYPTION_KEY = originalEncryptionKey;
        });

        function useRepoConfig(config: unknown): void {
            vi.spyOn(service, "getBackupRepoConfig").mockResolvedValue(config as any);
        }

        function expectNoLocalFallback(env: Record<string, string>): void {
            expect(env.RESTIC_REPOSITORY).not.toBe(path.resolve(REMOTE_STACK.hostPath, "backups"));
            expect(Object.values(env).join("\n")).not.toContain("TEST-KEY-BODY");
        }

        it("runBackup with an S3 repository runs restic against the per-stack bucket prefix", async () => {
            await service.runBackup(backupRecord as any, backupStack as any, S3_REPO_CONFIG);

            expect(mockResticExecutor.run).toHaveBeenCalled();
            for (const call of mockResticExecutor.run.mock.calls) {
                expect(resticEnvOf(call[1])).toEqual(S3_ENV);
                expectNoLocalFallback(resticEnvOf(call[1]));
            }
            expect(mockBackupRepository.update).toHaveBeenCalledWith(
                "backup-1",
                expect.objectContaining({status: "COMPLETED"}),
            );
        });

        it("runBackup with an SFTP repository runs restic against the per-stack remote path", async () => {
            await service.runBackup(backupRecord as any, backupStack as any, SFTP_REPO_CONFIG);

            expect(mockResticExecutor.run).toHaveBeenCalled();
            for (const call of mockResticExecutor.run.mock.calls) {
                expect(resticEnvOf(call[1])).toEqual(SFTP_ENV);
                expectNoLocalFallback(resticEnvOf(call[1]));
            }
        });

        it("runRestoreProcess restores from the per-stack S3 repository", async () => {
            useRepoConfig(S3_REPO_CONFIG);

            await service.runRestoreProcess(restoreRecord as any, restoreStack as any, snapshotId);

            expect(mockResticExecutor.run).toHaveBeenCalledWith(
                ["restore", snapshotId, "--target", "."],
                expect.any(Object),
                expect.any(Function),
                REMOTE_STACK.hostPath,
            );
            expect(resticEnvOf(mockResticExecutor.run.mock.calls[0][1])).toEqual(S3_ENV);
        });

        it("runRestoreProcess restores from the per-stack SFTP repository", async () => {
            useRepoConfig(SFTP_REPO_CONFIG);

            await service.runRestoreProcess(restoreRecord as any, restoreStack as any, snapshotId);

            expect(resticEnvOf(mockResticExecutor.run.mock.calls[0][1])).toEqual(SFTP_ENV);
        });

        it("getSnapshotsIfIdle lists snapshots of the per-stack S3 repository", async () => {
            useRepoConfig(S3_REPO_CONFIG);
            mockStackRepository.findByIdOrThrow.mockResolvedValue({...REMOTE_STACK, status: "RUNNING"});

            await service.getSnapshotsIfIdle("stack-1");

            expect(mockResticExecutor.snapshots).toHaveBeenCalledTimes(1);
            expect(resticEnvOf(mockResticExecutor.snapshots.mock.calls[0][0])).toEqual(S3_ENV);
            expect(mockResticExecutor.snapshots.mock.calls[0][1]).toBe("stack-1");
        });

        it("runBackup hands the resolved SFTP target, including the configured key, to every restic run", async () => {
            await service.runBackup(backupRecord as any, backupStack as any, SFTP_REPO_CONFIG);

            expect(mockResticExecutor.run).toHaveBeenCalled();
            for (const call of mockResticExecutor.run.mock.calls) {
                expect(call[1]).toMatchObject({
                    kind: "sftp",
                    repository: "sftp:backup@nas.example.com:/srv/restic/stack-1",
                    sftp: {host: "nas.example.com", user: "backup", privateKey: SFTP_REPO_CONFIG.sftpKey},
                });
            }
        });

        it("getSnapshots hands the resolved SFTP target to the executor", async () => {
            useRepoConfig(SFTP_REPO_CONFIG);
            mockStackRepository.findByIdOrThrow.mockResolvedValue({...REMOTE_STACK, status: "RUNNING"});

            await service.getSnapshots("stack-1");

            expect(mockResticExecutor.snapshots).toHaveBeenCalledWith(
                expect.objectContaining({
                    kind: "sftp",
                    sftp: expect.objectContaining({privateKey: SFTP_REPO_CONFIG.sftpKey}),
                }),
                "stack-1",
            );
        });

        it("getSnapshots lists snapshots of the per-stack SFTP repository", async () => {
            useRepoConfig(SFTP_REPO_CONFIG);
            mockStackRepository.findByIdOrThrow.mockResolvedValue({...REMOTE_STACK, status: "RUNNING"});

            await service.getSnapshots("stack-1");

            expect(resticEnvOf(mockResticExecutor.snapshots.mock.calls[0][0])).toEqual(SFTP_ENV);
        });

        it("scheduled S3 backups run forget against the same repository", async () => {
            const scheduled = {...backupRecord, trigger: "SCHEDULED"};

            await service.runBackup(scheduled as any, backupStack as any, S3_REPO_CONFIG);

            expect(mockResticExecutor.buildForgetArgs).toHaveBeenCalled();
            expect(mockResticExecutor.run).toHaveBeenCalledTimes(2);
            expect(resticEnvOf(mockResticExecutor.run.mock.calls[1][1])).toEqual(S3_ENV);
        });

        it("auto-initialises a not-yet-created remote repository with the same S3 env", async () => {
            mockResticExecutor.run
                .mockRejectedValueOnce(
                    Object.assign(new Error("Fatal: unable to open config file: Stat: The specified key does not exist."), {
                        exitCode: 10,
                    }),
                )
                .mockResolvedValue({exitCode: 0, stderr: ""});
            (mockResticExecutor as any).buildInitArgs = vi.fn().mockReturnValue(["init"]);

            await service.runBackup(backupRecord as any, backupStack as any, S3_REPO_CONFIG);

            const calls = mockResticExecutor.run.mock.calls;
            expect(calls).toHaveLength(3);
            expect(calls[1][0]).toEqual(["init"]);
            expect(calls[2][0]).toEqual(calls[0][0]);
            for (const call of calls) expect(resticEnvOf(call[1])).toEqual(S3_ENV);
            expect(mockBackupRepository.update).toHaveBeenCalledWith(
                "backup-1",
                expect.objectContaining({status: "COMPLETED"}),
            );
        });

        it("runBackup fails an incomplete S3 configuration without running restic (D-05)", async () => {
            await service.runBackup(
                backupRecord as any,
                backupStack as any,
                {...S3_REPO_CONFIG, s3Bucket: undefined},
            );

            expect(mockResticExecutor.run).not.toHaveBeenCalled();
            expect(mockBackupRepository.update).toHaveBeenCalledWith(
                "backup-1",
                expect.objectContaining({status: "FAILED", errorMessage: expect.stringContaining("missing S3 bucket")}),
            );
            expect(mockStackRepository.update).toHaveBeenCalledWith("stack-1", expect.objectContaining({status: "ERROR"}));
            expect(mockBus.emit).toHaveBeenCalledWith(
                "backup.failed",
                expect.objectContaining({errorMessage: expect.stringContaining("missing S3 bucket")}),
            );
        });

        it("runRestoreProcess fails an incomplete SFTP configuration before stopping the stack (D-05)", async () => {
            useRepoConfig({...SFTP_REPO_CONFIG, sftpKey: undefined});

            await service.runRestoreProcess(restoreRecord as any, restoreStack as any, snapshotId);

            expect(mockResticExecutor.run).not.toHaveBeenCalled();
            expect(mockDockerExecutor.stop).not.toHaveBeenCalled();
            expect(mockBackupRepository.update).toHaveBeenCalledWith(
                "backup-1",
                expect.objectContaining({
                    status: "FAILED",
                    errorMessage: expect.stringContaining("missing SFTP private key"),
                }),
            );
        });

        it("getSnapshots rejects an incomplete S3 configuration instead of listing local snapshots (D-05)", async () => {
            useRepoConfig({...S3_REPO_CONFIG, s3Bucket: ""});
            mockStackRepository.findByIdOrThrow.mockResolvedValue({...REMOTE_STACK, status: "RUNNING"});

            await expect(service.getSnapshots("stack-1")).rejects.toBeInstanceOf(BadRequestError);
            expect(mockResticExecutor.snapshots).not.toHaveBeenCalled();
        });

        it("getSnapshots treats a secret that fails to decrypt as missing (D-05)", async () => {
            process.env.ENCRYPTION_KEY = "ab".repeat(32);
            mockSettingsService.getMany.mockResolvedValue({
                "backup.repoType": "sftp",
                "backup.sftpHost": "nas.example.com",
                "backup.sftpUser": "backup",
                "backup.password": encrypt("restic-pass"),
                "backup.sftpKey": "not-valid-ciphertext",
            });
            mockStackRepository.findByIdOrThrow.mockResolvedValue({...REMOTE_STACK, status: "RUNNING"});

            await expect(service.getSnapshots("stack-1")).rejects.toThrow(/SFTP private key/);
            await expect(service.getSnapshots("stack-1")).rejects.toBeInstanceOf(BadRequestError);
            expect(mockResticExecutor.snapshots).not.toHaveBeenCalled();
        });

        it("keeps local backup, restore and listing on <hostPath>/backups (BKP-02)", async () => {
            const localConfig = {repoType: "local" as const, repoPath: "/ignored", password: "pw"};
            const hostPath = "/opt/docktor/stacks/myapp";
            const localStack = {id: "stack-1", hostPath, status: "BACKING_UP", previousStatus: "RUNNING", backupRetention: null};
            const expectedRepo = path.resolve(hostPath, "backups");
            useRepoConfig(localConfig);
            mockStackRepository.findByIdOrThrow.mockResolvedValue({id: "stack-1", hostPath, status: "RUNNING"});

            await service.runBackup(backupRecord as any, localStack as any, localConfig);
            await service.runRestoreProcess(restoreRecord as any, {...localStack, status: "RESTORING"} as any, snapshotId);
            await service.getSnapshots("stack-1");

            const envs = [
                ...mockResticExecutor.run.mock.calls.map((call) => resticEnvOf(call[1])),
                resticEnvOf(mockResticExecutor.snapshots.mock.calls[0][0]),
            ];
            expect(envs.length).toBeGreaterThanOrEqual(3);
            for (const env of envs) expect(env.RESTIC_REPOSITORY).toBe(expectedRepo);
        });
    });

    describe("saveBackupConfig() (Task 1, 10-10)", () => {
        const baseInput = {
            useGlobalSchedule: false,
            schedule: "0 3 * * *",
            useGlobalRetention: true,
            retention: null,
            preHook: null,
            postHook: null,
        };

        it("persists via stackRepo.updateBackupConfig before calling the schedule port's upsert", async () => {
            const callOrder: string[] = [];
            mockStackRepository.updateBackupConfig.mockImplementation(async () => {
                callOrder.push("persist");
            });
            mockSchedulePort.upsert.mockImplementation(() => {
                callOrder.push("upsert");
            });

            await service.saveBackupConfig("stack-1", baseInput as any);

            expect(callOrder).toEqual(["persist", "upsert"]);
            expect(mockStackRepository.updateBackupConfig).toHaveBeenCalledWith("stack-1", {
                backupSchedule: "0 3 * * *",
                backupRetention: null,
                backupPreHook: null,
                backupPostHook: null,
            });
            expect(mockSchedulePort.upsert).toHaveBeenCalledWith("stack-1", "0 3 * * *");
            expect(mockSchedulePort.remove).not.toHaveBeenCalled();
        });

        it("calls the schedule port's remove (not upsert) when no effective schedule is set", async () => {
            await service.saveBackupConfig("stack-1", {
                ...baseInput,
                useGlobalSchedule: true,
                schedule: null,
            } as any);

            expect(mockSchedulePort.remove).toHaveBeenCalledWith("stack-1");
            expect(mockSchedulePort.upsert).not.toHaveBeenCalled();
        });

        it("rejects an invalid cron expression with BadRequestError and never persists or notifies the scheduler", async () => {
            await expect(
                service.saveBackupConfig("stack-1", {
                    ...baseInput,
                    schedule: "not a cron expression",
                } as any),
            ).rejects.toBeInstanceOf(BadRequestError);

            expect(mockStackRepository.updateBackupConfig).not.toHaveBeenCalled();
            expect(mockSchedulePort.upsert).not.toHaveBeenCalled();
            expect(mockSchedulePort.remove).not.toHaveBeenCalled();
        });

        it("resolves retention through the global-defaults branch (useGlobalRetention -> null, no JSON.stringify)", async () => {
            await service.saveBackupConfig("stack-1", {
                ...baseInput,
                useGlobalRetention: true,
                retention: {keepDaily: 1, keepWeekly: 1, keepMonthly: 1},
            } as any);

            expect(mockStackRepository.updateBackupConfig).toHaveBeenCalledWith(
                "stack-1",
                expect.objectContaining({backupRetention: null}),
            );
        });

        it("JSON-stringifies a per-stack retention override", async () => {
            await service.saveBackupConfig("stack-1", {
                ...baseInput,
                useGlobalRetention: false,
                retention: {keepDaily: 3, keepWeekly: 2, keepMonthly: 1},
            } as any);

            expect(mockStackRepository.updateBackupConfig).toHaveBeenCalledWith(
                "stack-1",
                expect.objectContaining({
                    backupRetention: JSON.stringify({keepDaily: 3, keepWeekly: 2, keepMonthly: 1}),
                }),
            );
        });
    });

    describe("getSnapshotsIfIdle() (Task 2, 10-10)", () => {
        it("throws ConflictError when the stack is BACKING_UP", async () => {
            mockStackRepository.findByIdOrThrow.mockResolvedValue({id: "stack-1", status: "BACKING_UP"});

            await expect(service.getSnapshotsIfIdle("stack-1")).rejects.toMatchObject({
                statusCode: 409,
                message: "Backup in progress, try again shortly",
            });
        });

        it("throws ConflictError when the stack is RESTORING", async () => {
            mockStackRepository.findByIdOrThrow.mockResolvedValue({id: "stack-1", status: "RESTORING"});

            await expect(service.getSnapshotsIfIdle("stack-1")).rejects.toMatchObject({statusCode: 409});
        });

        it("returns snapshots when the stack is idle", async () => {
            mockStackRepository.findByIdOrThrow.mockResolvedValue({id: "stack-1", status: "RUNNING", hostPath: "/stacks/s1"});
            mockSettingsService.getMany.mockResolvedValue(CONFIGURED_REPO_SETTINGS);
            mockResticExecutor.snapshots.mockResolvedValue([{id: "snap-1"}]);

            const result = await service.getSnapshotsIfIdle("stack-1");

            expect(result).toEqual([{id: "snap-1"}]);
        });
    });

    describe("listBackups() (Task 2, 10-10)", () => {
        it("returns backupRepo.findByStackId() results mapped through toDto()", async () => {
            mockBackupRepository.findByStackId.mockResolvedValue([
                {id: "b1", sizeBytes: 123n},
                {id: "b2", sizeBytes: null},
            ]);

            const result = await service.listBackups("stack-1");

            expect(mockBackupRepository.findByStackId).toHaveBeenCalledWith("stack-1");
            expect(result).toEqual([
                {id: "b1", sizeBytes: "123"},
                {id: "b2", sizeBytes: null},
            ]);
        });
    });

    describe("getBackupDto() (Task 2, 10-10)", () => {
        it("returns a single backup mapped through toDto()", async () => {
            mockBackupRepository.findByIdOrThrow.mockResolvedValue({id: "b1", sizeBytes: 456n});

            const result = await service.getBackupDto("b1");

            expect(result).toEqual({id: "b1", sizeBytes: "456"});
        });

        it("propagates the repository's NotFoundError for an unknown id, unchanged", async () => {
            mockBackupRepository.findByIdOrThrow.mockRejectedValue(new NotFoundError('Backup "missing" not found'));

            await expect(service.getBackupDto("missing")).rejects.toBeInstanceOf(NotFoundError);
        });
    });

    describe("getBackupRecordOrThrow() (Task 2, 10-10)", () => {
        it("returns the raw (non-DTO) backup row", async () => {
            mockBackupRepository.findByIdOrThrow.mockResolvedValue({id: "b1", status: "IN_PROGRESS", logLines: ["a"]});

            const result = await service.getBackupRecordOrThrow("b1");

            expect(result).toEqual({id: "b1", status: "IN_PROGRESS", logLines: ["a"]});
        });

        it("propagates the repository's NotFoundError for an unknown id, unchanged", async () => {
            mockBackupRepository.findByIdOrThrow.mockRejectedValue(new NotFoundError('Backup "missing" not found'));

            await expect(service.getBackupRecordOrThrow("missing")).rejects.toBeInstanceOf(NotFoundError);
        });
    });

    describe("getBackupAndStack() / getBackupRunContext() (Task 2, 10-10)", () => {
        it("getBackupAndStack fetches the backup and stack concurrently", async () => {
            mockBackupRepository.findByIdOrThrow.mockResolvedValue({id: "b1", stackId: "stack-1", logLines: []});
            mockStackRepository.findByIdOrThrow.mockResolvedValue({id: "stack-1", status: "RUNNING"});

            const result = await service.getBackupAndStack("b1", "stack-1");

            expect(result.backupRecord).toEqual({id: "b1", stackId: "stack-1", logLines: []});
            expect(result.stack).toEqual({id: "stack-1", status: "RUNNING"});
        });

        it("getBackupRunContext fetches the backup, stack, and repo config concurrently", async () => {
            mockBackupRepository.findByIdOrThrow.mockResolvedValue({id: "b1", stackId: "stack-1", logLines: []});
            mockStackRepository.findByIdOrThrow.mockResolvedValue({id: "stack-1", status: "RUNNING"});
            mockSettingsService.getMany.mockResolvedValue(CONFIGURED_REPO_SETTINGS);

            const result = await service.getBackupRunContext("b1", "stack-1");

            expect(result.backupRecord).toEqual({id: "b1", stackId: "stack-1", logLines: []});
            expect(result.stack).toEqual({id: "stack-1", status: "RUNNING"});
            expect(result.repoConfig).not.toBeNull();
        });

        it("getBackupRunContext resolves repoConfig to null when no backup repository is configured", async () => {
            mockBackupRepository.findByIdOrThrow.mockResolvedValue({id: "b1", stackId: "stack-1", logLines: []});
            mockStackRepository.findByIdOrThrow.mockResolvedValue({id: "stack-1", status: "RUNNING"});
            mockSettingsService.getMany.mockResolvedValue({});

            const result = await service.getBackupRunContext("b1", "stack-1");

            expect(result.repoConfig).toBeNull();
        });
    });

    describe("getBackupConfig() (Task 2, 10-10)", () => {
        it("returns useGlobalSchedule: true and the global defaults when the stack has no override", async () => {
            mockStackRepository.findByIdOrThrow.mockResolvedValue({
                id: "stack-1",
                backupSchedule: null,
                backupRetention: null,
                backupPreHook: null,
                backupPostHook: null,
            });
            mockSettingsService.getSetting.mockImplementation(async (key: string) => {
                if (key === "backup.defaultSchedule") return "0 1 * * *";
                if (key === "backup.defaultRetention") return JSON.stringify({keepDaily: 7, keepWeekly: 4, keepMonthly: 12});
                return null;
            });

            const result = await service.getBackupConfig("stack-1");

            expect(result).toEqual({
                useGlobalSchedule: true,
                schedule: null,
                useGlobalRetention: true,
                retention: null,
                preHook: null,
                postHook: null,
                globalSchedule: "0 1 * * *",
                globalRetention: {keepDaily: 7, keepWeekly: 4, keepMonthly: 12},
            });
        });

        it("returns useGlobalSchedule: false and the parsed per-stack override when present", async () => {
            mockStackRepository.findByIdOrThrow.mockResolvedValue({
                id: "stack-1",
                backupSchedule: "0 5 * * *",
                backupRetention: JSON.stringify({keepDaily: 1, keepWeekly: 1, keepMonthly: 1}),
                backupPreHook: "echo pre",
                backupPostHook: "echo post",
            });
            mockSettingsService.getSetting.mockResolvedValue(null);

            const result = await service.getBackupConfig("stack-1");

            expect(result).toEqual({
                useGlobalSchedule: false,
                schedule: "0 5 * * *",
                useGlobalRetention: false,
                retention: {keepDaily: 1, keepWeekly: 1, keepMonthly: 1},
                preHook: "echo pre",
                postHook: "echo post",
                globalSchedule: null,
                globalRetention: null,
            });
        });
    });

    describe("checkResticStatus() (Task 2, 10-10)", () => {
        it("delegates to the injected restic port's checkVersion()", async () => {
            mockResticExecutor.checkVersion.mockResolvedValue({available: true, version: "0.16.0"});

            const result = await service.checkResticStatus();

            expect(result).toEqual({available: true, version: "0.16.0"});
        });
    });

    describe("testRepositoryConnection()", () => {
        function useRepoConfig(config: unknown): void {
            vi.spyOn(service, "getBackupRepoConfig").mockResolvedValue(config as any);
        }

        it("reports a missing configuration without running restic", async () => {
            useRepoConfig(null);

            const result = await service.testRepositoryConnection();

            expect(result.ok).toBe(false);
            expect(result.message).toMatch(/no backup repository is configured/i);
            expect(mockResticExecutor.run).not.toHaveBeenCalled();
        });

        it("has nothing to connect to for a local repository", async () => {
            useRepoConfig({repoType: "local", password: "restic-pass"});

            const result = await service.testRepositoryConnection();

            expect(result.ok).toBe(true);
            expect(mockResticExecutor.run).not.toHaveBeenCalled();
        });

        it("probes an SFTP repository with a read-only restic command", async () => {
            useRepoConfig(SFTP_REPO_CONFIG);

            const result = await service.testRepositoryConnection();

            expect(result.ok).toBe(true);
            expect(mockResticExecutor.run).toHaveBeenCalledWith(
                ["cat", "config"],
                expect.objectContaining({kind: "sftp"}),
                undefined,
                undefined,
                {timeoutMs: 30_000},
            );
            expect(resticEnvOf(mockResticExecutor.run.mock.calls[0][1]).RESTIC_REPOSITORY)
                .toMatch(/^sftp:backup@nas\.example\.com:\/srv\/restic\//);
        });

        it("probes an S3 repository", async () => {
            useRepoConfig(S3_REPO_CONFIG);

            const result = await service.testRepositoryConnection();

            expect(result.ok).toBe(true);
            expect(mockResticExecutor.run).toHaveBeenCalledWith(
                ["cat", "config"],
                expect.objectContaining({kind: "s3"}),
                undefined,
                undefined,
                {timeoutMs: 30_000},
            );
        });

        it("treats a missing repository as a working connection", async () => {
            useRepoConfig(S3_REPO_CONFIG);
            mockResticExecutor.run.mockRejectedValue(
                Object.assign(new Error("Fatal: repository does not exist: unable to open config file: Stat: key does not exist"), {exitCode: 10}),
            );

            const result = await service.testRepositoryConnection();

            expect(result.ok).toBe(true);
        });

        it("redacts configured secrets from the error it returns (IN-06)", async () => {
            useRepoConfig(S3_REPO_CONFIG);
            mockResticExecutor.run.mockRejectedValue(
                new Error("Fatal: Stat: request failed for key AKIAEXAMPLE signed with s3-secret-example using restic-pass"),
            );

            const result = await service.testRepositoryConnection();

            expect(result.ok).toBe(false);
            for (const secret of ["AKIAEXAMPLE", "s3-secret-example", "restic-pass"]) {
                expect(result.message).not.toContain(secret);
            }
            expect(result.message).toContain("***");
        });

        it("probes a repository no real stack can be called (IN-05)", async () => {
            useRepoConfig(SFTP_REPO_CONFIG);

            await service.testRepositoryConnection();

            expect(resticEnvOf(mockResticExecutor.run.mock.calls[0][1]).RESTIC_REPOSITORY).toMatch(/\/docktor-connection-probe$/);
        });

        it("reports a probe that had to be stopped as a failed connection", async () => {
            useRepoConfig(S3_REPO_CONFIG);
            mockResticExecutor.run.mockRejectedValue(new Error("restic did not finish within 30 seconds and was stopped"));

            const result = await service.testRepositoryConnection();

            expect(result.ok).toBe(false);
            expect(result.message).toContain("did not finish within 30 seconds");
        });

        it("does not mistake an S3 Stat failure for a missing repository", async () => {
            useRepoConfig(S3_REPO_CONFIG);
            mockResticExecutor.run.mockRejectedValue(
                Object.assign(new Error("Fatal: unable to open config file: Stat: The AWS Access Key Id you provided does not exist in our records."), {exitCode: 1}),
            );

            const result = await service.testRepositoryConnection();

            expect(result.ok).toBe(false);
            expect(result.message).toContain("Access Key Id");
        });

        it("reports the restic error when the connection fails", async () => {
            useRepoConfig(SFTP_REPO_CONFIG);
            mockResticExecutor.run.mockRejectedValue(new Error("ssh: connect to host nas.example.com port 22: Connection refused"));

            const result = await service.testRepositoryConnection();

            expect(result.ok).toBe(false);
            expect(result.message).toContain("Connection refused");
        });

        it("reports an incomplete remote configuration instead of throwing", async () => {
            useRepoConfig({...SFTP_REPO_CONFIG, sftpKey: undefined});

            const result = await service.testRepositoryConnection();

            expect(result.ok).toBe(false);
            expect(result.message).toContain("SFTP private key");
            expect(mockResticExecutor.run).not.toHaveBeenCalled();
        });
    });
});
