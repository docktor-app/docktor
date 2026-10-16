import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {MigrationService} from "../../../src/application/migration-service.js";
import {BadRequestError, ConflictError} from "../../../src/lib/errors.js";
import {slugify} from "../../../src/lib/slugify.js";
import type {DockerExecutorPort} from "../../../src/application/ports/docker-executor-port.js";
import type {VolumeMigratorPort} from "../../../src/application/ports/volume-migrator-port.js";
import type {ComposeRewriterPort} from "../../../src/application/ports/compose-rewriter-port.js";
import type {StackFilesystemPort} from "../../../src/application/ports/stack-filesystem-port.js";
import type {ExternalStackControlPort} from "../../../src/application/ports/external-stack-control-port.js";
import type {SelfStackPort} from "../../../src/application/ports/self-stack-port.js";
import type {StackRepository} from "../../../src/repositories/stack-repository.js";

const COMPOSE = "services:\n  web:\n    image: nginx:latest\n";
const BACKUP_DIR_NAME = "pre-migration-backup";

function createMockDocker() {
    return {up: vi.fn()};
}

function createMockMigrator() {
    return {copyVolumeToBindMount: vi.fn(), copyDirectory: vi.fn()};
}

function createMockRewriter() {
    return {rewrite: vi.fn().mockReturnValue({rewrittenCompose: COMPOSE, extractedEnv: ""})};
}

function createMockStackFs(stacksRoot: string) {
    return {
        getStackDirectory: vi.fn((id: string) => path.join(stacksRoot, id)),
        // Real exclusive create: the leaf mkdir is not recursive, so an existing directory rejects (EEXIST).
        createDirectoryExclusive: vi.fn(async (id: string) => {
            await fs.mkdir(stacksRoot, {recursive: true});
            const target = path.join(stacksRoot, id);
            await fs.mkdir(target);
            return target;
        }),
        removeDirectory: vi.fn().mockResolvedValue(undefined),
    };
}

function createMockStackRepo() {
    return {
        exists: vi.fn().mockResolvedValue(false),
        create: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
    };
}

function createMockOldStack() {
    return {stop: vi.fn().mockResolvedValue(undefined), start: vi.fn().mockResolvedValue(undefined)};
}

function createMockSelfStack() {
    return {composeFilePaths: vi.fn().mockResolvedValue([] as string[])};
}

describe("MigrationService.migrate (MIG-03, MIG-04, BF-05)", () => {
    const displayName = "Rollback Fixture";
    const stackId = slugify(displayName);

    let tmpRoot: string;
    let originalDir: string;
    let composePath: string;
    let newStackPath: string;
    let mockDocker: ReturnType<typeof createMockDocker>;
    let mockMigrator: ReturnType<typeof createMockMigrator>;
    let mockRewriter: ReturnType<typeof createMockRewriter>;
    let mockStackFs: ReturnType<typeof createMockStackFs>;
    let mockStackRepo: ReturnType<typeof createMockStackRepo>;
    let mockOldStack: ReturnType<typeof createMockOldStack>;
    let mockSelfStack: ReturnType<typeof createMockSelfStack>;

    beforeEach(async () => {
        tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "docktor-migrate-"));
        originalDir = path.join(tmpRoot, "original");
        composePath = path.join(originalDir, "docker-compose.yml");
        await fs.mkdir(path.join(originalDir, "data"), {recursive: true});
        await fs.writeFile(composePath, COMPOSE, "utf-8");
        await fs.writeFile(path.join(originalDir, "data", "keep.txt"), "keep me", "utf-8");
        // Not created up front: the service must create it (and only then may it remove it).
        newStackPath = path.join(tmpRoot, "stacks", stackId);

        mockDocker = createMockDocker();
        mockMigrator = createMockMigrator();
        mockRewriter = createMockRewriter();
        mockStackFs = createMockStackFs(path.join(tmpRoot, "stacks"));
        mockStackRepo = createMockStackRepo();
        mockOldStack = createMockOldStack();
        mockSelfStack = createMockSelfStack();
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await fs.rm(tmpRoot, {recursive: true, force: true});
    });

    async function assertNoOsTempBackup(): Promise<void> {
        const leftovers = (await fs.readdir(os.tmpdir())).filter((name) =>
            name.startsWith("docktor-migration-backup-"),
        );
        expect(leftovers).toEqual([]);
    }

    async function assertOriginalUntouched(): Promise<void> {
        expect(await fs.readFile(composePath, "utf-8")).toBe(COMPOSE);
        expect(await fs.readFile(path.join(originalDir, "data", "keep.txt"), "utf-8")).toBe("keep me");
    }

    function expectNoSideEffects(): void {
        expect(mockOldStack.stop).not.toHaveBeenCalled();
        expect(mockStackFs.createDirectoryExclusive).not.toHaveBeenCalled();
        expect(mockMigrator.copyDirectory).not.toHaveBeenCalled();
        expect(mockStackRepo.create).not.toHaveBeenCalled();
    }

    function buildService(): MigrationService {
        // Test double: these six collaborators are exactly the constructor
        // parameters migrate() invokes; the casts expose only the members it
        // calls, proving each seam accepts a plain-object port double.
        return new MigrationService(
            mockDocker as unknown as DockerExecutorPort,
            mockMigrator as unknown as VolumeMigratorPort,
            mockRewriter as unknown as ComposeRewriterPort,
            mockStackFs as unknown as StackFilesystemPort,
            mockStackRepo as unknown as StackRepository,
            mockOldStack as unknown as ExternalStackControlPort,
            mockSelfStack as unknown as SelfStackPort,
        );
    }

    function input(overrides: Partial<{backup: boolean; stopOldStack: boolean}> = {}) {
        return {
            composePath,
            displayName,
            volumeSelections: [],
            namedVolumeSelections: new Map<string, boolean>(),
            backup: true,
            stopOldStack: true,
            ...overrides,
        };
    }

    it("stops the old stack before creating anything and keeps the backup copy (D-07, D-10)", async () => {
        mockDocker.up.mockResolvedValue(undefined);

        const result = await buildService().migrate(input());

        expect(result).toEqual({success: true, stackId, originalPath: originalDir});
        expect(mockOldStack.stop).toHaveBeenCalledTimes(1);
        expect(mockOldStack.stop).toHaveBeenCalledWith(composePath);
        expect(mockOldStack.stop.mock.invocationCallOrder[0]).toBeLessThan(
            mockStackFs.createDirectoryExclusive.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
        );
        expect(mockMigrator.copyDirectory).toHaveBeenCalledWith(
            originalDir,
            path.join(newStackPath, BACKUP_DIR_NAME),
        );
        expect(mockStackFs.removeDirectory).not.toHaveBeenCalled();
        expect(mockStackRepo.delete).not.toHaveBeenCalled();
        expect(mockOldStack.start).not.toHaveBeenCalled();
        await assertNoOsTempBackup();
    });

    it("keeps a real copy of the old directory in pre-migration-backup/ after success (D-08)", async () => {
        mockDocker.up.mockResolvedValue(undefined);
        mockMigrator.copyDirectory.mockImplementation((src: string, dest: string) =>
            fs.cp(src, dest, {recursive: true}),
        );

        const result = await buildService().migrate(input());

        expect(result.success).toBe(true);
        const backupDir = path.join(newStackPath, BACKUP_DIR_NAME);
        expect(await fs.readFile(path.join(backupDir, "docker-compose.yml"), "utf-8")).toBe(COMPOSE);
        expect(await fs.readFile(path.join(backupDir, "data", "keep.txt"), "utf-8")).toBe("keep me");
    });

    it("rolls back without touching the original directory and restarts the stack it stopped (D-09, D-11)", async () => {
        mockDocker.up.mockRejectedValue(new Error("docker compose up failed"));

        const result = await buildService().migrate(input());

        expect(result.success).toBe(false);
        expect(result.error).toContain("docker compose up failed");
        expect(result.error).toContain("Your original stack directory was not modified.");
        expect(result.error).toContain("The old stack was restarted.");
        expect(result.originalPath).toBe(originalDir);
        expect(mockStackFs.removeDirectory).toHaveBeenCalledWith(stackId);
        expect(mockStackRepo.delete).toHaveBeenCalledWith(stackId);
        expect(mockOldStack.start).toHaveBeenCalledTimes(1);
        expect(mockOldStack.start).toHaveBeenCalledWith(composePath);
        await assertOriginalUntouched();
        await assertNoOsTempBackup();
    });

    it("aborts fail-closed when the stop fails and undoes a partial stop (orchestrator decision 2)", async () => {
        mockOldStack.stop.mockRejectedValue(new Error("cannot connect to docker"));

        const result = await buildService().migrate(input());

        expect(result.success).toBe(false);
        expect(result.error).toContain("cannot connect to docker");
        expect(mockStackFs.createDirectoryExclusive).not.toHaveBeenCalled();
        expect(mockMigrator.copyDirectory).not.toHaveBeenCalled();
        expect(mockMigrator.copyVolumeToBindMount).not.toHaveBeenCalled();
        expect(mockRewriter.rewrite).not.toHaveBeenCalled();
        expect(mockStackRepo.create).not.toHaveBeenCalled();
        expect(mockDocker.up).not.toHaveBeenCalled();
        expect(mockStackFs.removeDirectory).not.toHaveBeenCalled();
        expect(mockOldStack.start).toHaveBeenCalledTimes(1);
        await assertOriginalUntouched();
    });

    it("never stops or starts the old stack when stopOldStack is false (D-10)", async () => {
        mockDocker.up.mockRejectedValue(new Error("port is already allocated"));

        const result = await buildService().migrate(input({stopOldStack: false}));

        expect(result.success).toBe(false);
        expect(mockOldStack.stop).not.toHaveBeenCalled();
        expect(mockOldStack.start).not.toHaveBeenCalled();
        expect(result.error).toContain("Your original stack directory was not modified.");
        expect(result.error).not.toContain("old stack");
    });

    it("tells the user how to restart manually when the automatic restart fails", async () => {
        mockDocker.up.mockRejectedValue(new Error("docker compose up failed"));
        mockOldStack.start.mockRejectedValue(new Error("daemon unreachable"));

        const result = await buildService().migrate(input());

        expect(result.success).toBe(false);
        expect(result.error).toContain("could not be restarted automatically");
        expect(result.error).toContain(originalDir);
    });

    it("creates no backup when backup is false (MIG-03, D-07)", async () => {
        mockDocker.up.mockResolvedValue(undefined);

        const result = await buildService().migrate(input({backup: false}));

        expect(result.success).toBe(true);
        const destinations = mockMigrator.copyDirectory.mock.calls.map((call) => String(call[1]));
        expect(destinations.some((dest) => dest.endsWith(BACKUP_DIR_NAME))).toBe(false);
        await expect(fs.access(path.join(newStackPath, BACKUP_DIR_NAME))).rejects.toThrow();
        await assertNoOsTempBackup();
    });

    it("still backs up when the stack is not renamed and the compose file is unchanged (D-07)", async () => {
        mockDocker.up.mockResolvedValue(undefined);

        const sameNameStackPath = path.join(tmpRoot, "stacks", path.basename(originalDir));

        const result = await buildService().migrate(input({displayName: path.basename(originalDir)}));

        expect(result.success).toBe(true);
        expect(mockMigrator.copyDirectory).toHaveBeenCalledWith(
            originalDir,
            path.join(sameNameStackPath, BACKUP_DIR_NAME),
        );
    });

    it("refuses a target directory that already exists before anything is stopped or created (D-09)", async () => {
        await fs.mkdir(newStackPath, {recursive: true});
        await fs.writeFile(path.join(newStackPath, "marker.txt"), "mine", "utf-8");

        const refusal = buildService().migrate(input());

        await expect(refusal).rejects.toBeInstanceOf(ConflictError);
        await expect(refusal).rejects.toThrow(newStackPath);
        await expect(refusal).rejects.toThrow("already exists");
        expectNoSideEffects();
        expect(await fs.readFile(path.join(newStackPath, "marker.txt"), "utf-8")).toBe("mine");
    });

    it("refuses a target directory that overlaps the old directory (Pitfall 4)", async () => {
        mockStackFs.getStackDirectory.mockReturnValue(path.join(originalDir, "nested"));

        const refusal = buildService().migrate(input());

        await expect(refusal).rejects.toBeInstanceOf(ConflictError);
        await expect(refusal).rejects.toThrow("overlap");
        expectNoSideEffects();
    });

    it("refuses a target directory that contains the old directory (Pitfall 4)", async () => {
        mockStackFs.getStackDirectory.mockReturnValue(tmpRoot);

        const refusal = buildService().migrate(input());

        await expect(refusal).rejects.toBeInstanceOf(ConflictError);
        await expect(refusal).rejects.toThrow("overlap");
        expectNoSideEffects();
    });

    it("refuses an existing stack record with a ConflictError before any side effect", async () => {
        mockStackRepo.exists.mockResolvedValue(true);

        const refusal = buildService().migrate(input());

        await expect(refusal).rejects.toBeInstanceOf(ConflictError);
        await expect(refusal).rejects.toThrow(`Stack "${stackId}" already exists`);
        expectNoSideEffects();
    });

    it("refuses a display name that produces an empty slug with a BadRequestError", async () => {
        const refusal = buildService().migrate(input({displayName: "!!!"}));

        await expect(refusal).rejects.toBeInstanceOf(BadRequestError);
        expectNoSideEffects();
    });

    it("preflight is side-effect free and execute runs the preflighted plan", async () => {
        mockDocker.up.mockResolvedValue(undefined);
        const service = buildService();

        const plan = await service.preflight(input());

        expect(plan.stackId).toBe(stackId);
        expect(plan.originalDir).toBe(originalDir);
        expect(plan.targetDir).toBe(newStackPath);
        expectNoSideEffects();

        const result = await service.execute(plan);

        expect(result).toEqual({success: true, stackId, originalPath: originalDir});
        expect(mockStackFs.createDirectoryExclusive).toHaveBeenCalledTimes(1);
    });

    it("leaves a directory that appeared during the stop window untouched and restarts the old stack (CR-02)", async () => {
        mockOldStack.stop.mockImplementation(async () => {
            await fs.mkdir(newStackPath, {recursive: true});
            await fs.writeFile(path.join(newStackPath, "marker.txt"), "theirs", "utf-8");
        });

        const result = await buildService().migrate(input());

        expect(result.success).toBe(false);
        expect(mockStackFs.removeDirectory).not.toHaveBeenCalled();
        expect(mockStackRepo.delete).not.toHaveBeenCalled();
        expect(await fs.readFile(path.join(newStackPath, "marker.txt"), "utf-8")).toBe("theirs");
        expect(mockOldStack.start).toHaveBeenCalledTimes(1);
    });

    it("never deletes a stack record this run did not create (CR-02)", async () => {
        mockStackRepo.create.mockRejectedValue(new Error("Unique constraint failed on the fields: (`id`)"));

        const result = await buildService().migrate(input());

        expect(result.success).toBe(false);
        expect(mockStackFs.removeDirectory).toHaveBeenCalledWith(stackId);
        expect(mockStackRepo.delete).not.toHaveBeenCalled();
        expect(mockOldStack.start).toHaveBeenCalledTimes(1);
    });

    it("fails the migration, removes its directory and restarts the old stack when a bind-mount copy fails (CR-01)", async () => {
        mockMigrator.copyDirectory.mockRejectedValue(new Error("ENOSPC: no space left on device, write"));

        const result = await buildService().migrate({
            ...input({backup: false}),
            volumeSelections: [{originalPath: "data", newPath: "./volumes/data", convert: true}],
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("ENOSPC");
        expect(result.error).toContain("Your original stack directory was not modified.");
        expect(result.error).toContain("The old stack was restarted.");
        expect(mockStackFs.removeDirectory).toHaveBeenCalledWith(stackId);
        expect(mockOldStack.start).toHaveBeenCalledTimes(1);
        expect(mockOldStack.start).toHaveBeenCalledWith(composePath);
        expect(mockStackRepo.create).not.toHaveBeenCalled();
        expect(mockStackRepo.delete).not.toHaveBeenCalled();
        expect(mockDocker.up).not.toHaveBeenCalled();
        await expect(fs.access(path.join(newStackPath, "volumes", "data"))).rejects.toThrow();
        await assertOriginalUntouched();
    });

    it("fails the migration on a non-ENOENT access error instead of creating an empty volume (CR-01)", async () => {
        const realAccess = fs.access.bind(fs);
        const blockedSource = path.join(originalDir, "data");
        vi.spyOn(fs, "access").mockImplementation(async (target, mode) => {
            if (String(target) === blockedSource) {
                throw Object.assign(new Error("EACCES: permission denied, access"), {code: "EACCES"});
            }
            return realAccess(target, mode);
        });

        const result = await buildService().migrate({
            ...input({backup: false}),
            volumeSelections: [{originalPath: "data", newPath: "./volumes/data", convert: true}],
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("EACCES");
        expect(mockMigrator.copyDirectory).not.toHaveBeenCalled();
        expect(mockStackFs.removeDirectory).toHaveBeenCalledWith(stackId);
        expect(mockOldStack.start).toHaveBeenCalledTimes(1);
    });

    it("keeps a missing bind-mount source as an empty destination directory (CR-01)", async () => {
        mockDocker.up.mockResolvedValue(undefined);

        const result = await buildService().migrate({
            ...input({backup: false}),
            volumeSelections: [{originalPath: "missing", newPath: "./volumes/missing", convert: true}],
        });

        expect(result.success).toBe(true);
        expect(mockMigrator.copyDirectory).not.toHaveBeenCalled();
        expect((await fs.stat(path.join(newStackPath, "volumes", "missing"))).isDirectory()).toBe(true);
    });

    it("copies an existing bind-mount source into the new stack directory (CR-01)", async () => {
        mockDocker.up.mockResolvedValue(undefined);

        const result = await buildService().migrate({
            ...input({backup: false}),
            volumeSelections: [{originalPath: "data", newPath: "./volumes/data", convert: true}],
        });

        expect(result.success).toBe(true);
        expect(mockMigrator.copyDirectory).toHaveBeenCalledWith(
            path.join(originalDir, "data"),
            path.join(newStackPath, "volumes", "data"),
        );
    });

    it("keeps rejecting a traversing named volume name and restarts the stopped stack (CR-02)", async () => {
        const result = await buildService().migrate({
            ...input(),
            namedVolumeSelections: new Map([["../escape", true]]),
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("Invalid volume name");
        expect(mockMigrator.copyVolumeToBindMount).not.toHaveBeenCalled();
        expect(mockOldStack.start).toHaveBeenCalledTimes(1);
    });

    it("keeps confining a bind-mount newPath to the managed directory (CR-02)", async () => {
        const result = await buildService().migrate({
            ...input(),
            volumeSelections: [{originalPath: "data", newPath: "../../outside", convert: true}],
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("managed directory");
        expect(mockOldStack.start).toHaveBeenCalledTimes(1);
        await assertOriginalUntouched();
    });

    describe("own-stack refusal (WR-09, STK-03)", () => {
        function expectNothingTouched(): void {
            expectNoSideEffects();
            expect(mockMigrator.copyVolumeToBindMount).not.toHaveBeenCalled();
            expect(mockRewriter.rewrite).not.toHaveBeenCalled();
            expect(mockStackRepo.exists).not.toHaveBeenCalled();
            expect(mockDocker.up).not.toHaveBeenCalled();
        }

        it("refuses Docktor's own compose file with a BadRequestError before anything is stopped", async () => {
            mockSelfStack.composeFilePaths.mockResolvedValue([composePath]);

            await expect(buildService().migrate(input())).rejects.toBeInstanceOf(BadRequestError);
            await expect(buildService().preflight(input())).rejects.toBeInstanceOf(BadRequestError);
            expectNothingTouched();
        });

        it("recognises the own compose file when the lookup reports it with backslashes", async () => {
            mockSelfStack.composeFilePaths.mockResolvedValue([composePath.replaceAll("/", "\\")]);

            await expect(buildService().migrate(input())).rejects.toBeInstanceOf(BadRequestError);
            expectNothingTouched();
        });

        it("migrates a different compose file in the same directory as Docktor's own (D-01)", async () => {
            mockSelfStack.composeFilePaths.mockResolvedValue([path.join(originalDir, "compose.yml")]);
            mockDocker.up.mockResolvedValue(undefined);

            const result = await buildService().migrate(input());

            expect(result.success).toBe(true);
        });

        it("migrates as before and warns when the self-stack lookup rejects (fail-open, D-02)", async () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
            mockSelfStack.composeFilePaths.mockRejectedValue(new Error("inspect failed"));
            mockDocker.up.mockResolvedValue(undefined);

            const result = await buildService().migrate(input());

            expect(result.success).toBe(true);
            expect(warn).toHaveBeenCalled();
        });
    });
});

describe("previewMigration (MIG-02, D-04)", () => {
    let tmpDir: string;
    let composePath: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "docktor-preview-"));
        composePath = path.join(tmpDir, "docker-compose.yml");
        await fs.writeFile(composePath, COMPOSE, "utf-8");
    });

    afterEach(async () => {
        await fs.rm(tmpDir, {recursive: true, force: true});
    });

    function buildPreviewService(rewriter: Pick<ComposeRewriterPort, "rewrite">): MigrationService {
        return new MigrationService(
            createMockDocker() as unknown as DockerExecutorPort,
            createMockMigrator() as unknown as VolumeMigratorPort,
            rewriter as ComposeRewriterPort,
            createMockStackFs(tmpDir) as unknown as StackFilesystemPort,
            createMockStackRepo() as unknown as StackRepository,
        );
    }

    it("returns a UnifiedDiff with individually marked added and removed lines", async () => {
        const rewriter = {
            rewrite: vi.fn().mockReturnValue({
                rewrittenCompose: "services:\n  web:\n    image: nginx:1.27\n",
                extractedEnv: "FOO=bar",
                envVars: {},
            }),
        };

        const result = await buildPreviewService(rewriter).previewMigration(composePath, [], new Map());

        expect(result.diff.added).toBe(1);
        expect(result.diff.removed).toBe(1);
        const lines = result.diff.hunks.flatMap((hunk) => hunk.lines);
        expect(lines).toContainEqual(expect.objectContaining({kind: "removed", text: "    image: nginx:latest"}));
        expect(lines).toContainEqual(expect.objectContaining({kind: "added", text: "    image: nginx:1.27"}));
        expect(result.extractedEnv).toBe("FOO=bar");
    });

    it("returns the empty diff when the rewrite leaves the content unchanged", async () => {
        const rewriter = {
            rewrite: vi.fn().mockReturnValue({rewrittenCompose: COMPOSE, extractedEnv: "", envVars: {}}),
        };

        const result = await buildPreviewService(rewriter).previewMigration(composePath, [], new Map());

        expect(result.diff).toEqual({hunks: [], added: 0, removed: 0});
    });
});
