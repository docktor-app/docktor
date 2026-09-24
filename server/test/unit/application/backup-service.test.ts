import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {
    BackupService,
    getBackupBroadcaster,
    ensureBackupBroadcaster,
    disposeBackupBroadcaster,
    ensureBackupLogBuffer,
    getBackupLogBuffer,
} from "../../../src/application/backup-service.js";
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

        it("auto-initializes repo on the real restic 0.16.x error shape (exit 1, 'unable to open config file')", async () => {
            // This is what restic actually returns for a missing local repo — exit code 10
            // is documented but not what this restic version produces. Reproduced directly:
            // `restic backup` against a non-existent repo exits 1 with this exact message.
            const realRepoNotFoundError = Object.assign(
                new Error(
                    "restic exited with code 1: Fatal: unable to open config file: stat /stacks/memos/backups/config: no such file or directory\nIs there a repository at the following location?\n/stacks/memos/backups",
                ),
                {exitCode: 1},
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

    describe("buildEnv path construction", () => {
        it("handles Windows absolute paths correctly", () => {
            const repoConfig = {repoType: "local" as const, password: "test"};
            const windowsPath = "C:\\Users\\D070307\\workspace\\docktor\\server\\dev-data\\stacks\\memos";

            const env = (service as any).buildEnv(repoConfig, windowsPath);

            // Should resolve to stack-local backups directory without doubling drive letter
            const expected = path.resolve(windowsPath, "backups");
            expect(env.RESTIC_REPOSITORY).toBe(expected);
            expect(env.RESTIC_REPOSITORY).not.toContain("C:\\C\\");
        });

        it("handles Unix absolute paths correctly", () => {
            const repoConfig = {repoType: "local" as const, password: "test"};
            const unixPath = "/opt/docktor/stacks/myapp";

            const env = (service as any).buildEnv(repoConfig, unixPath);

            // path.resolve on Windows converts Unix paths to Windows format
            const expected = path.resolve(unixPath, "backups");
            expect(env.RESTIC_REPOSITORY).toBe(expected);
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
});
