import {describe, it, expect, vi, beforeEach, afterEach} from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {ComposeRewriter} from "../../../src/infrastructure/compose-rewriter.js";
import {parseEnvAssignments} from "../../../src/domain/host-ports.js";
import {MigrationService} from "../../../src/application/migration-service.js";
import {InMemoryMigrationLedger, type MigrationLedger} from "../../../src/domain/migration-rollback.js";
import type {MigrationLedgerEntry} from "@docktor/shared";
import {BadRequestError, ConflictError} from "../../../src/lib/errors.js";
import {slugify} from "../../../src/lib/slugify.js";
import type {DockerExecutorPort} from "../../../src/application/ports/docker-executor-port.js";
import type {VolumeMigratorPort} from "../../../src/application/ports/volume-migrator-port.js";
import type {ComposeRewriterPort} from "../../../src/application/ports/compose-rewriter-port.js";
import type {StackFilesystemPort} from "../../../src/application/ports/stack-filesystem-port.js";
import type {ExternalStackControlPort} from "../../../src/application/ports/external-stack-control-port.js";
import type {SelfStackPort} from "../../../src/application/ports/self-stack-port.js";
import type {OwnMountsPort} from "../../../src/application/ports/own-mounts-port.js";
import type {DirectoryIdentityPort} from "../../../src/application/ports/directory-identity-port.js";
import type {DiskSpaceProbePort} from "../../../src/application/ports/disk-space-probe-port.js";
import type {ComposeProjectResolverPort} from "../../../src/application/ports/compose-project-resolver-port.js";
import {ComposeProjectResolver} from "../../../src/infrastructure/compose-project-resolver.js";
import type {ProjectContainer} from "../../../src/domain/compose-project.js";
import {DirectoryIdentityResolver} from "../../../src/infrastructure/directory-identity-resolver.js";
import {hostViewDirectories} from "../../helpers/host-directory-identity.js";
import type {OwnMountsView} from "../../../src/domain/bind-mount-sources.js";
import {toComparablePath} from "../../../src/domain/self-stack-paths.js";
import type {StackRepository} from "../../../src/repositories/stack-repository.js";

/** A compose file whose `web` service declares each given bind source (short syntax). */
function composeDeclaring(sources: readonly string[]): string {
    const volumes = sources.map((source, index) => `      - ${source}:/mnt/${index}\n`).join("");
    return `services:\n  web:\n    image: nginx:latest\n    volumes:\n${volumes}`;
}

// The bind sources the tests below convert; a converted source must be declared (WR-01).
const COMPOSE = `${composeDeclaring(["./data", "./missing", "./present"])}volumes:\n  pgdata:\n`;
const BACKUP_DIR_NAME = "pre-migration-backup";

function createMockDocker() {
    return {up: vi.fn()};
}

function createMockMigrator() {
    return {
        copyVolumeToBindMount: vi.fn(),
        copyDirectory: vi.fn(),
        moveDirectory: vi.fn(),
        // #101: every Docker volume exists unless a test says otherwise.
        volumeExists: vi.fn().mockResolvedValue(true),
    };
}

/** The path the fake reports as the filesystem every write of a migration lands on. */
const STACKS_FILESYSTEM = "/opt/docktor/stacks";

/** #107: plenty of free space and small sizes by default; a test sets the figures it cares about. */
function createMockDiskSpace(availableBytes = 1024 ** 4) {
    return {
        filesystemOf: vi.fn(async (_target: string) => ({filesystemId: "fs-stacks", label: STACKS_FILESYSTEM, availableBytes})),
        measureDirectoryBytes: vi.fn(async (_target: string): Promise<number | null> => 1_024),
        measureVolumeBytes: vi.fn(async (_name: string): Promise<number | null> => 1_024),
    };
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
        listLocations: vi.fn().mockResolvedValue([] as Array<{id: string; displayName: string; hostPath: string}>),
        create: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
    };
}

function createMockOldStack() {
    return {stop: vi.fn().mockResolvedValue(undefined), start: vi.fn().mockResolvedValue(undefined)};
}

// Bound before any test spies on fs.readFile: the resolver double reads the files like production would.
const readFileDirect = fs.readFile.bind(fs);

async function readTextDirect(file: string): Promise<string | null> {
    try {
        return await readFileDirect(file, "utf-8");
    } catch (error: unknown) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
            return null;
        }
        throw error;
    }
}

/** One running container of the old project, as the resolver lists it. */
function runningContainer(project: string, service = "web", index = 1): ProjectContainer {
    return {id: `${project}-${service}-${index}`, name: `${project}-${service}-${index}`, service, running: true, mounts: []};
}

/**
 * The old project as Docker runs it: resolved from the files (no container is
 * reported at resolve time), `web` running until the old stack's stop was called.
 */
function createMockProjects(oldStack: ReturnType<typeof createMockOldStack> = createMockOldStack()) {
    const resolver = new ComposeProjectResolver({listContainers: () => Promise.resolve([])}, hostViewDirectories(), readTextDirect);
    return {
        resolve: vi.fn((composePath: string) => resolver.resolve(composePath)),
        listContainers: vi.fn((project: string, _composePath: string): Promise<readonly ProjectContainer[]> =>
            // Down once stopped, running again once the rollback started it.
            Promise.resolve(oldStack.stop.mock.calls.length > 0 && oldStack.start.mock.calls.length === 0 ? [] : [runningContainer(project)]),
        ),
    };
}

function createMockSelfStack() {
    return {composeFilePaths: vi.fn().mockResolvedValue([] as string[])};
}

function createMockLogger() {
    return {info: vi.fn(), warn: vi.fn(), error: vi.fn()};
}

/** Docktor not containerized by default: a host path is a local path. */
function createMockOwnMounts(view: OwnMountsView = {kind: "host"}) {
    return {ownMounts: vi.fn().mockResolvedValue(view)};
}

/**
 * G-18-22-inplace: a real resolver over the given own-mounts fake. The realpath
 * stub returns its input, so only the mount translation can prove an identity.
 */
function directoriesOver(ownMounts: OwnMountsPort): DirectoryIdentityPort {
    return new DirectoryIdentityResolver(ownMounts, async (p) => p);
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
    let mockProjects: ReturnType<typeof createMockProjects>;
    let mockSelfStack: ReturnType<typeof createMockSelfStack>;
    let mockOwnMounts: ReturnType<typeof createMockOwnMounts>;
    let mockDiskSpace: ReturnType<typeof createMockDiskSpace>;
    let mockLogger: ReturnType<typeof createMockLogger>;
    // A fake clock: the rollback's wait for the restarted services advances it instead of sleeping.
    let clock: number;

    beforeEach(async () => {
        clock = 0;
        mockLogger = createMockLogger();
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
        mockProjects = createMockProjects(mockOldStack);
        mockSelfStack = createMockSelfStack();
        mockOwnMounts = createMockOwnMounts();
        mockDiskSpace = createMockDiskSpace();
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
        return new MigrationService({
            docker: mockDocker as unknown as DockerExecutorPort,
            migrator: mockMigrator as unknown as VolumeMigratorPort,
            rewriter: mockRewriter as unknown as ComposeRewriterPort,
            stackFs: mockStackFs as unknown as StackFilesystemPort,
            stackRepo: mockStackRepo as unknown as StackRepository,
            oldStack: mockOldStack as unknown as ExternalStackControlPort,
            projects: mockProjects as unknown as ComposeProjectResolverPort,
            selfStack: mockSelfStack as unknown as SelfStackPort,
            ownMounts: mockOwnMounts as unknown as OwnMountsPort,
            directories: hostViewDirectories(),
            diskSpace: mockDiskSpace as unknown as DiskSpaceProbePort,
            logger: mockLogger,
            sleep: async (ms: number) => {
                clock += ms;
            },
            now: () => clock,
        });
    }

    function input(overrides: Partial<{backup: boolean; stopOldStack: boolean}> = {}) {
        return {
            composePath,
            displayName,
            volumeSelections: [],
            namedVolumeSelections: new Map<string, boolean>(),
            backup: true,
            stopOldStack: true,
            acknowledgeAnonymousVolumes: false,
            ...overrides,
        };
    }

    it("stops the old stack before creating anything and keeps the backup copy (D-07, D-10)", async () => {
        mockDocker.up.mockResolvedValue(undefined);

        const result = await buildService().migrate(input());

        expect(result).toEqual({success: true, stackId, originalPath: originalDir});
        expect(mockOldStack.stop).toHaveBeenCalledTimes(1);
        expect(mockOldStack.stop).toHaveBeenCalledWith({composePath, project: "original"}, {timeoutMs: 120_000});
        expect(mockOldStack.stop.mock.invocationCallOrder[0]).toBeLessThan(
            mockStackFs.createDirectoryExclusive.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
        );
        expect(mockMigrator.copyDirectory).toHaveBeenCalledWith(
            originalDir,
            path.join(newStackPath, BACKUP_DIR_NAME, "stack"),
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
        const backupDir = path.join(newStackPath, BACKUP_DIR_NAME, "stack");
        expect(await fs.readFile(path.join(backupDir, "docker-compose.yml"), "utf-8")).toBe(COMPOSE);
        expect(await fs.readFile(path.join(backupDir, "data", "keep.txt"), "utf-8")).toBe("keep me");
    });

    it("rolls back without touching the original directory and restarts the stack it stopped (D-09, D-11)", async () => {
        mockDocker.up.mockRejectedValue(new Error("docker compose up failed"));

        const result = await buildService().migrate(input());

        expect(result.success).toBe(false);
        // #100: the error states the failure only; what the rollback achieved is in the verified report.
        expect(result.error).toBe("Migration failed: docker compose up failed");
        expect(result.rollback).toEqual({oldStack: "restored-running", original: "untouched", cleanupErrors: []});
        expect(result.originalPath).toBe(originalDir);
        expect(mockStackFs.removeDirectory).toHaveBeenCalledWith(stackId);
        expect(mockStackRepo.delete).toHaveBeenCalledWith(stackId);
        expect(mockOldStack.start).toHaveBeenCalledTimes(1);
        expect(mockOldStack.start).toHaveBeenCalledWith({composePath, project: "original"}, ["web"]);
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
        expect(result.error).toBe("Migration failed: port is already allocated");
        expect(result.rollback).toEqual({oldStack: "not-stopped", original: "untouched", cleanupErrors: []});
    });

    describe("the old project as Docker runs it (#102, D-04)", () => {
        function startedAs(project: string): void {
            mockProjects.resolve.mockResolvedValue({
                kind: "resolved",
                project: {name: project, source: "containers", containers: [runningContainer(project)]},
            });
        }

        it("refuses preflight and preview with a BadRequestError before anything is stopped when the project cannot be resolved", async () => {
            mockProjects.resolve.mockResolvedValue({kind: "unresolved", reason: "Docker could not be queried: socket closed"});

            const preflight = buildService().preflight(input());
            const preview = buildService().previewMigration(input());

            await expect(preflight).rejects.toBeInstanceOf(BadRequestError);
            await expect(preflight).rejects.toThrow(composePath);
            await expect(preflight).rejects.toThrow("socket closed");
            await expect(preview).rejects.toBeInstanceOf(BadRequestError);
            expectNoSideEffects();
        });

        it("carries the resolved project in the plan", async () => {
            startedAs("other");

            const plan = await buildService().preflight(input());

            expect(plan.oldProject.name).toBe("other");
        });

        it("stops and verifies the project Docker runs, not the one the directory name suggests (-p other from a directory named original)", async () => {
            startedAs("other");
            mockDocker.up.mockResolvedValue(undefined);
            const steps: string[] = [];

            const result = await buildService().migrate(input(), ({step}) => steps.push(step));

            expect(result.success).toBe(true);
            expect(mockProjects.listContainers.mock.calls).toEqual([
                ["other", composePath],
                ["other", composePath],
            ]);
            expect(mockOldStack.stop).toHaveBeenCalledWith({composePath, project: "other"}, {timeoutMs: 120_000});
            const [listBefore, listAfter] = mockProjects.listContainers.mock.invocationCallOrder;
            const [stopped] = mockOldStack.stop.mock.invocationCallOrder;
            expect(listBefore).toBeLessThan(stopped ?? Number.NaN);
            expect(stopped).toBeLessThan(listAfter ?? Number.NaN);
            expect(steps.slice(0, 3)).toEqual(["stopping_old_stack", "verifying_stop", "creating_directory"]);
        });

        it("runs no stop and no restart when nothing of the old project was running", async () => {
            mockProjects.listContainers.mockResolvedValue([{...runningContainer("original"), running: false}]);
            mockDocker.up.mockRejectedValue(new Error("docker compose up failed"));
            const listener = vi.fn();

            const result = await buildService().migrate(input(), listener);

            expect(result.success).toBe(false);
            expect(mockOldStack.stop).not.toHaveBeenCalled();
            expect(mockOldStack.start).not.toHaveBeenCalled();
            expect(listener).toHaveBeenCalledWith({step: "stopping_old_stack", detail: "(nothing was running)"});
            expect(result.rollback?.oldStack).toBe("not-stopped");
        });

        it("gives the stop a timeout that grows with the number of containers", async () => {
            const many = Array.from({length: 10}, (_, index) => runningContainer("original", "web", index + 1));
            mockProjects.listContainers.mockResolvedValueOnce(many).mockResolvedValue([]);
            mockDocker.up.mockResolvedValue(undefined);

            await buildService().migrate(input());

            expect(mockOldStack.stop).toHaveBeenCalledWith(expect.anything(), {timeoutMs: 300_000});
        });

        describe("restarts only what was running before (#100)", () => {
            const mixed = [
                runningContainer("original", "web"),
                runningContainer("original", "db"),
                {...runningContainer("original", "job"), running: false},
            ];

            beforeEach(() => {
                mockProjects.listContainers
                    .mockResolvedValueOnce(mixed)
                    .mockResolvedValue(mixed.map((container) => ({...container, running: false})));
            });

            it("after a failure later in the migration", async () => {
                mockDocker.up.mockRejectedValue(new Error("docker compose up failed"));

                const result = await buildService().migrate(input());

                expect(mockOldStack.start).toHaveBeenCalledTimes(1);
                expect(mockOldStack.start).toHaveBeenCalledWith({composePath, project: "original"}, ["db", "web"]);
                // The fake project never shows the services running again, so the restore stays unverified (D-07).
                expect(result.rollback).toEqual({oldStack: "restart-unverified", original: "untouched", cleanupErrors: []});
                expect(result.error).not.toContain("restored");
            });

            it("after a stop that failed or timed out", async () => {
                mockOldStack.stop.mockRejectedValue(new Error("timed out"));

                const result = await buildService().migrate(input());

                expect(result.success).toBe(false);
                expect(mockOldStack.start).toHaveBeenCalledWith({composePath, project: "original"}, ["db", "web"]);
            });
        });

        it("refuses with no override when a container of the old project is still running after the stop, before anything is created or copied (D-04)", async () => {
            startedAs("other");
            mockProjects.listContainers.mockImplementation(() => Promise.resolve([runningContainer("other", "db")]));

            const result = await buildService().migrate(input());

            expect(result.success).toBe(false);
            expect(result.error).toContain('"other"');
            expect(result.error).toContain("other-db-1");
            expect(mockOldStack.stop).toHaveBeenCalledTimes(1);
            expect(mockStackFs.createDirectoryExclusive).not.toHaveBeenCalled();
            expect(mockMigrator.copyDirectory).not.toHaveBeenCalled();
            expect(mockMigrator.moveDirectory).not.toHaveBeenCalled();
            expect(mockMigrator.copyVolumeToBindMount).not.toHaveBeenCalled();
            expect(mockStackRepo.create).not.toHaveBeenCalled();
            expect(mockDocker.up).not.toHaveBeenCalled();
            expect(mockOldStack.start).toHaveBeenCalledTimes(1);
            await assertOriginalUntouched();
        });
    });

    it("tells the user how to restart manually when the automatic restart fails", async () => {
        mockDocker.up.mockRejectedValue(new Error("docker compose up failed"));
        mockOldStack.start.mockRejectedValue(new Error("daemon unreachable"));

        const result = await buildService().migrate(input());

        expect(result.success).toBe(false);
        expect(result.error).toBe("Migration failed: docker compose up failed. Restarting the old stack failed: daemon unreachable.");
        expect(result.rollback).toEqual({oldStack: "restart-failed", original: "untouched", cleanupErrors: []});
        expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("daemon unreachable"));
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
            path.join(sameNameStackPath, BACKUP_DIR_NAME, "stack"),
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
            volumeSelections: [{originalPath: "./data", newPath: "./volumes/data", convert: true}],
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("ENOSPC");
        expect(result.rollback).toEqual({oldStack: "restored-running", original: "untouched", cleanupErrors: []});
        expect(mockStackFs.removeDirectory).toHaveBeenCalledWith(stackId);
        expect(mockOldStack.start).toHaveBeenCalledTimes(1);
        expect(mockOldStack.start).toHaveBeenCalledWith({composePath, project: "original"}, ["web"]);
        expect(mockStackRepo.create).not.toHaveBeenCalled();
        expect(mockStackRepo.delete).not.toHaveBeenCalled();
        expect(mockDocker.up).not.toHaveBeenCalled();
        await expect(fs.access(path.join(newStackPath, "volumes", "data"))).rejects.toThrow();
        await assertOriginalUntouched();
    });

    it("refuses the migration in preflight on a non-ENOENT access error instead of creating an empty volume (CR-01)", async () => {
        const realAccess = fs.access.bind(fs);
        const blockedSource = path.join(originalDir, "data");
        vi.spyOn(fs, "access").mockImplementation(async (target, mode) => {
            if (String(target) === blockedSource) {
                throw Object.assign(new Error("EACCES: permission denied, access"), {code: "EACCES"});
            }
            return realAccess(target, mode);
        });

        await expect(
            buildService().migrate({
                ...input({backup: false}),
                volumeSelections: [{originalPath: "./data", newPath: "./volumes/data", convert: true}],
            }),
        ).rejects.toThrow("EACCES");

        expectNoSideEffects();
        expect(mockMigrator.moveDirectory).not.toHaveBeenCalled();
    });

    it("keeps a missing bind-mount source as an empty destination directory (CR-01)", async () => {
        mockDocker.up.mockResolvedValue(undefined);

        const result = await buildService().migrate({
            ...input({backup: false}),
            volumeSelections: [{originalPath: "./missing", newPath: "./volumes/missing", convert: true}],
        });

        expect(result.success).toBe(true);
        expect(mockMigrator.copyDirectory).not.toHaveBeenCalled();
        expect((await fs.stat(path.join(newStackPath, "volumes", "missing"))).isDirectory()).toBe(true);
    });

    it("copies an existing bind-mount source into the new stack directory (CR-01)", async () => {
        mockDocker.up.mockResolvedValue(undefined);

        const result = await buildService().migrate({
            ...input({backup: false}),
            volumeSelections: [{originalPath: "./data", newPath: "./volumes/data", convert: true}],
        });

        expect(result.success).toBe(true);
        expect(mockMigrator.copyDirectory).toHaveBeenCalledWith(
            path.join(originalDir, "data"),
            path.join(newStackPath, "volumes", "data"),
        );
    });

    it("refuses a traversing named volume name before anything is stopped (CR-02, WR-01)", async () => {
        await expect(
            buildService().migrate({...input(), namedVolumeSelections: new Map([["../escape", true]])}),
        ).rejects.toThrow(BadRequestError);

        expectNoSideEffects();
        expect(mockMigrator.copyVolumeToBindMount).not.toHaveBeenCalled();
        expect(mockOldStack.start).not.toHaveBeenCalled();
        await assertOriginalUntouched();
    });

    describe("free disk space on the receiving filesystem (#107, D-08)", () => {
        const dataSource = (): string => path.join(originalDir, "data");

        /** Sizes by path: the old stack directory, the ./data bind source, anything else small. */
        function sizes(figures: {stackDir: number; data: number}): void {
            mockDiskSpace.measureDirectoryBytes.mockImplementation(async (target: string) => {
                if (target === originalDir) return figures.stackDir;
                if (target === dataSource()) return figures.data;
                return 1;
            });
        }

        function copyingData(overrides: Partial<{backup: boolean}> = {}) {
            return {
                ...input(overrides),
                volumeSelections: [{originalPath: "./data", newPath: "./volumes/data", convert: true}],
            };
        }

        it("refuses a start before anything is stopped when the receiving filesystem is short, naming needed and available", async () => {
            sizes({stackDir: 600, data: 400});
            mockDiskSpace.filesystemOf.mockResolvedValue({filesystemId: "fs-stacks", label: STACKS_FILESYSTEM, availableBytes: 439});

            const refusal = buildService().migrate(copyingData({backup: false}));

            await expect(refusal).rejects.toBeInstanceOf(BadRequestError);
            await expect(refusal).rejects.toThrow(
                `Migration refused before anything was stopped: not enough free disk space. ${STACKS_FILESYSTEM} needs 440 B (including a 10% margin), 439 B available.`,
            );
            expectNoSideEffects();
            expect(mockMigrator.moveDirectory).not.toHaveBeenCalled();
            expect(mockDiskSpace.filesystemOf).toHaveBeenCalledWith(newStackPath);
        });

        it("accepts a start with exactly the required size (data times 1.1)", async () => {
            sizes({stackDir: 600, data: 400});
            mockDiskSpace.filesystemOf.mockResolvedValue({filesystemId: "fs-stacks", label: STACKS_FILESYSTEM, availableBytes: 440});

            const plan = await buildService().preflight(copyingData({backup: false}));

            expect(plan.stackId).toBe(stackId);
        });

        it("measures nothing and requires nothing when no data is copied and there is no backup", async () => {
            mockDiskSpace.filesystemOf.mockResolvedValue({filesystemId: "fs-stacks", label: STACKS_FILESYSTEM, availableBytes: 0});

            await expect(buildService().preflight(input({backup: false}))).resolves.toBeDefined();

            expect(mockDiskSpace.measureDirectoryBytes).not.toHaveBeenCalled();
            expect(mockDiskSpace.measureVolumeBytes).not.toHaveBeenCalled();
        });

        it("adds the old stack directory to what is needed when a backup is chosen", async () => {
            sizes({stackDir: 600, data: 400});
            mockDiskSpace.filesystemOf.mockResolvedValue({filesystemId: "fs-stacks", label: STACKS_FILESYSTEM, availableBytes: 1_099});

            const refusal = buildService().preflight(copyingData({backup: true}));

            await expect(refusal).rejects.toThrow(`${STACKS_FILESYSTEM} needs 1.1 KiB (including a 10% margin), 1.1 KiB available.`);
            expect(mockDiskSpace.measureDirectoryBytes).toHaveBeenCalledWith(originalDir);

            mockDiskSpace.filesystemOf.mockResolvedValue({filesystemId: "fs-stacks", label: STACKS_FILESYSTEM, availableBytes: 1_100});
            await expect(buildService().preflight(copyingData({backup: true}))).resolves.toBeDefined();
        });

        it("counts a bind source outside the old stack directory for the copy and for the backup", async () => {
            const outside = path.join(tmpRoot, "media");
            await fs.mkdir(outside);
            await fs.writeFile(composePath, composeDeclaring([outside]), "utf-8");
            mockDiskSpace.measureDirectoryBytes.mockImplementation(async (target: string) => (target === originalDir ? 600 : target === outside ? 300 : 1));
            mockDiskSpace.filesystemOf.mockResolvedValue({filesystemId: "fs-stacks", label: STACKS_FILESYSTEM, availableBytes: 1_319});
            const request = {
                ...input({backup: true}),
                volumeSelections: [{originalPath: outside, newPath: "./volumes/media", convert: true}],
            };

            // copy 300 + backup (600 directory + 300 outside source) = 1200, times 1.1 = 1320
            await expect(buildService().preflight(request)).rejects.toThrow("needs 1.3 KiB");
            mockDiskSpace.filesystemOf.mockResolvedValue({filesystemId: "fs-stacks", label: STACKS_FILESYSTEM, availableBytes: 1_320});
            await expect(buildService().preflight(request)).resolves.toBeDefined();
        });

        it("measures a converted named volume by its real Docker name and counts it", async () => {
            await fs.writeFile(composePath, "services:\n  web:\n    image: nginx\nvolumes:\n  data:\n", "utf-8");
            mockDiskSpace.measureVolumeBytes.mockResolvedValue(1_000);
            mockDiskSpace.filesystemOf.mockResolvedValue({filesystemId: "fs-stacks", label: STACKS_FILESYSTEM, availableBytes: 1_099});

            const refusal = buildService().preflight({...input({backup: false}), namedVolumeSelections: new Map([["data", true]])});

            await expect(refusal).rejects.toThrow(`needs 1.1 KiB (including a 10% margin), 1.1 KiB available`);
            expect(mockDiskSpace.measureVolumeBytes).toHaveBeenCalledWith("original_data");
        });

        it("does not count a named volume the user keeps, and never counts it for the backup", async () => {
            await fs.writeFile(composePath, "services:\n  web:\n    image: nginx\nvolumes:\n  data:\n", "utf-8");

            await buildService().preflight({...input({backup: true}), namedVolumeSelections: new Map([["data", false]])});

            expect(mockDiskSpace.measureVolumeBytes).not.toHaveBeenCalled();
        });

        it("blocks a size it cannot measure instead of skipping the check, naming the path", async () => {
            mockDiskSpace.measureDirectoryBytes.mockImplementation(async (target: string) => (target === dataSource() ? null : 1));

            const refusal = buildService().preflight(copyingData({backup: false}));

            await expect(refusal).rejects.toBeInstanceOf(BadRequestError);
            await expect(refusal).rejects.toThrow(/size of .*\.\/data.* could not be measured/s);
            expectNoSideEffects();
        });

        it("blocks a named volume whose size it cannot measure, naming the volume", async () => {
            await fs.writeFile(composePath, "services:\n  web:\n    image: nginx\nvolumes:\n  data:\n", "utf-8");
            mockDiskSpace.measureVolumeBytes.mockResolvedValue(null);

            const refusal = buildService().preflight({...input({backup: false}), namedVolumeSelections: new Map([["data", true]])});

            await expect(refusal).rejects.toThrow(/size of .*original_data.* could not be measured/s);
            expectNoSideEffects();
        });

        it("blocks an old stack directory it cannot measure when a backup is chosen", async () => {
            mockDiskSpace.measureDirectoryBytes.mockImplementation(async (target: string) => (target === originalDir ? null : 1));

            await expect(buildService().preflight(input({backup: true}))).rejects.toThrow(/size of .*old stack directory.* could not be measured/s);

            expectNoSideEffects();
        });

        it("does not ask about the old directory when no backup is chosen", async () => {
            await buildService().preflight(copyingData({backup: false}));

            expect(mockDiskSpace.measureDirectoryBytes).not.toHaveBeenCalledWith(originalDir);
        });
    });

    describe("the backup comes after the verified stop and before any data is copied (D-01, D-02, D-03)", () => {
        const outside = (): string => path.join(tmpRoot, "media");

        /** Every step the listener hears and every copy the migrator is asked for, in one timeline. */
        function timeline(): string[] {
            const events: string[] = [];
            mockMigrator.copyDirectory.mockImplementation(async (src: string, dest: string) => {
                events.push(`copy ${path.relative(tmpRoot, src)} -> ${path.relative(newStackPath, dest)}`);
                await fs.mkdir(dest, {recursive: true});
            });
            mockMigrator.copyVolumeToBindMount.mockImplementation(async (name: string, dest: string) => {
                events.push(`volume ${name} -> ${path.relative(newStackPath, dest)}`);
            });
            mockOldStack.stop.mockImplementation(async () => {
                events.push("stop");
            });
            return events;
        }

        function copyingEverything(overrides: Partial<{backup: boolean}> = {}) {
            return {
                ...input(overrides),
                volumeSelections: [
                    {originalPath: "./data", newPath: "./volumes/data", convert: true},
                    {originalPath: outside(), newPath: "./volumes/media", convert: true},
                ],
                namedVolumeSelections: new Map([["pgdata", true]]),
            };
        }

        beforeEach(async () => {
            await fs.mkdir(outside());
            await fs.writeFile(composePath, `${composeDeclaring(["./data", outside()])}volumes:\n  pgdata:\n`, "utf-8");
            mockDocker.up.mockResolvedValue(undefined);
        });

        it("stops and verifies first, then backs up the directory and the outside source, then copies the data", async () => {
            const events = timeline();
            const listener = vi.fn((progress: {step: string}) => events.push(progress.step));

            const result = await buildService().migrate(copyingEverything(), listener);

            expect(result.success).toBe(true);
            expect(events).toEqual([
                "stopping_old_stack",
                "stop",
                "verifying_stop",
                "creating_directory",
                "backing_up",
                `copy original -> ${BACKUP_DIR_NAME}/stack`,
                `copy media -> ${BACKUP_DIR_NAME}/bind-mounts/1-media`,
                "copying_named_volume",
                "volume original_pgdata -> volumes/pgdata",
                "copying_bind_mount",
                "copy original/data -> volumes/data",
                "copying_bind_mount",
                "copy media -> volumes/media",
                "writing_compose",
                "recording_stack",
                "deploying",
            ]);
        });

        it("writes a manifest naming the old directory and every bind mount in the backup", async () => {
            await buildService().migrate(copyingEverything());

            const manifest: unknown = JSON.parse(await fs.readFile(path.join(newStackPath, BACKUP_DIR_NAME, "manifest.json"), "utf-8"));
            expect(manifest).toEqual({
                createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
                stackDirectory: {source: originalDir, backup: "stack"},
                bindMounts: [{originalPath: outside(), source: outside(), backup: "bind-mounts/1-media"}],
            });
        });

        it("does not copy named volumes into the backup", async () => {
            await buildService().migrate(copyingEverything());

            expect(mockMigrator.copyVolumeToBindMount).toHaveBeenCalledTimes(1);
            expect(mockMigrator.copyVolumeToBindMount).toHaveBeenCalledWith("original_pgdata", path.join(newStackPath, "volumes", "pgdata"));
        });

        it("rolls back and restarts the old stack when the backup copy fails, before any data was copied", async () => {
            mockMigrator.copyDirectory.mockRejectedValueOnce(new Error("no space left on device"));

            const result = await buildService().migrate(copyingEverything());

            expect(result.success).toBe(false);
            expect(result.error).toContain("no space left on device");
            expect(mockMigrator.copyDirectory).toHaveBeenCalledTimes(1);
            expect(mockMigrator.copyVolumeToBindMount).not.toHaveBeenCalled();
            expect(mockStackFs.removeDirectory).toHaveBeenCalledWith(stackId);
            expect(mockOldStack.start).toHaveBeenCalledTimes(1);
        });

        it("fails and rolls back when a bind source planned for the backup vanished", async () => {
            mockMigrator.copyDirectory.mockImplementationOnce(async () => {
                await fs.rm(outside(), {recursive: true});
            });

            const result = await buildService().migrate(copyingEverything());

            expect(result.success).toBe(false);
            expect(result.error).toContain("no longer exists");
            expect(mockMigrator.copyVolumeToBindMount).not.toHaveBeenCalled();
        });

        it("writes nothing under pre-migration-backup without a backup", async () => {
            const events = timeline();

            await buildService().migrate(copyingEverything({backup: false}));

            expect(events.some((event) => event.includes(BACKUP_DIR_NAME))).toBe(false);
            expect(events).not.toContain("backing_up");
            await expect(fs.access(path.join(newStackPath, BACKUP_DIR_NAME))).rejects.toThrow();
        });

        it("leaves a bind source inside the old directory to the stack copy", async () => {
            const events = timeline();

            await buildService().migrate({...copyingEverything(), volumeSelections: [{originalPath: "./data", newPath: "./volumes/data", convert: true}]});

            expect(events.filter((event) => event.includes(`${BACKUP_DIR_NAME}/`))).toEqual([`copy original -> ${BACKUP_DIR_NAME}/stack`]);
            const manifest = JSON.parse(await fs.readFile(path.join(newStackPath, BACKUP_DIR_NAME, "manifest.json"), "utf-8")) as {bindMounts: unknown[]};
            expect(manifest.bindMounts).toEqual([]);
        });
    });

    describe("named volumes by the real Docker volume name (#101)", () => {
        const volumesCompose = (block: string): string => `services:\n  web:\n    image: nginx\n    volumes:\n      - data:/data\nvolumes:\n${block}`;

        function convertingVolume(key = "data") {
            return {...input({backup: false}), namedVolumeSelections: new Map([[key, true]])};
        }

        it("copies from <project>_<key> of the resolved project, not from the bare key", async () => {
            await fs.writeFile(composePath, volumesCompose("  data:\n"), "utf-8");
            await fs.writeFile(path.join(originalDir, ".env"), "COMPOSE_PROJECT_NAME=myproj\n", "utf-8");
            mockDocker.up.mockResolvedValue(undefined);
            const listener = vi.fn();

            const result = await buildService().migrate(convertingVolume(), listener);

            expect(result.success).toBe(true);
            expect(mockMigrator.volumeExists).toHaveBeenCalledWith("myproj_data");
            expect(mockMigrator.copyVolumeToBindMount).toHaveBeenCalledWith("myproj_data", path.join(newStackPath, "volumes", "data"));
            expect(listener).toHaveBeenCalledWith({step: "copying_named_volume", detail: "data"});
        });

        it.each([
            ["a name: override", "  data:\n    name: custom_db\n", "custom_db"],
            ["an external volume by its literal name", "  data:\n    external: true\n", "data"],
            ["an external volume with a name:", "  data:\n    external: true\n    name: shared\n", "shared"],
        ])("copies from the volume of %s", async (_label, block, expectedName) => {
            await fs.writeFile(composePath, volumesCompose(block), "utf-8");
            mockDocker.up.mockResolvedValue(undefined);

            const result = await buildService().migrate(convertingVolume());

            expect(result.success).toBe(true);
            expect(mockMigrator.copyVolumeToBindMount).toHaveBeenCalledWith(expectedName, path.join(newStackPath, "volumes", "data"));
        });

        it("refuses a converted volume that does not exist before the old stack is stopped", async () => {
            await fs.writeFile(composePath, volumesCompose("  data:\n"), "utf-8");
            mockMigrator.volumeExists.mockResolvedValue(false);

            const refusal = buildService().migrate(convertingVolume());

            await expect(refusal).rejects.toThrow(BadRequestError);
            await expect(refusal).rejects.toThrow(/data.*original_data.*untick.*start the old stack once/s);
            expectNoSideEffects();
            expect(mockMigrator.copyVolumeToBindMount).not.toHaveBeenCalled();
        });

        it("refuses the same volume in the preview", async () => {
            await fs.writeFile(composePath, volumesCompose("  data:\n"), "utf-8");
            mockMigrator.volumeExists.mockResolvedValue(false);

            await expect(
                buildService().previewMigration({composePath, displayName, volumeSelections: [], namedVolumeSelections: new Map([["data", true]])}),
            ).rejects.toThrow(/original_data.*untick/s);
        });

        it("refuses a converted key the compose file does not declare", async () => {
            await fs.writeFile(composePath, volumesCompose("  data:\n"), "utf-8");

            await expect(buildService().migrate(convertingVolume("other"))).rejects.toThrow(/other.*not declared/s);

            expectNoSideEffects();
            expect(mockMigrator.volumeExists).not.toHaveBeenCalled();
        });

        it("refuses a converted volume whose real name is not a valid Docker volume name", async () => {
            await fs.writeFile(composePath, volumesCompose('  data:\n    name: "a,b"\n'), "utf-8");

            await expect(buildService().migrate(convertingVolume())).rejects.toThrow(/a,b.*not a valid/s);

            expectNoSideEffects();
            expect(mockMigrator.volumeExists).not.toHaveBeenCalled();
        });

        it("plans every declared volume by real name, with whether Docker has created it", async () => {
            await fs.writeFile(composePath, volumesCompose("  data:\n  cache:\n    external: true\n    name: shared\n"), "utf-8");
            mockMigrator.volumeExists.mockImplementation(async (name: string) => name !== "original_data");

            const plan = await buildService().preflight({...input({backup: false}), namedVolumeSelections: new Map([["data", false]])});

            expect([...plan.volumes]).toEqual([
                ["data", {name: "original_data", external: false, exists: false}],
                ["cache", {name: "shared", external: true, exists: true}],
            ]);
        });
    });

    describe("anonymous volumes start empty and need an acknowledgement (D-05)", () => {
        const HEX_ID = "b".repeat(64);
        const withAnonymous = `services:\n  web:\n    image: nginx\n    volumes:\n      - /cache\n`;

        function containersWithAnonymousVolume(): void {
            const container = {
                ...runningContainer("original", "db"),
                mounts: [{type: "volume", name: HEX_ID, source: "/var/lib/docker/volumes/x/_data", destination: "/var/lib/postgresql/data"}],
            };
            mockProjects.resolve.mockResolvedValue({kind: "resolved", project: {name: "original", source: "containers", containers: [container]}});
        }

        it("lists those the compose file declares in the preview", async () => {
            await fs.writeFile(composePath, withAnonymous, "utf-8");

            const preview = await buildService().previewMigration({composePath, displayName, volumeSelections: [], namedVolumeSelections: new Map()});

            expect(preview.anonymousVolumes).toEqual([{service: "web", containerPath: "/cache"}]);
        });

        it("lists those the old containers have in the preview", async () => {
            containersWithAnonymousVolume();

            const preview = await buildService().previewMigration({composePath, displayName, volumeSelections: [], namedVolumeSelections: new Map()});

            expect(preview.anonymousVolumes).toEqual([{service: "db", containerPath: "/var/lib/postgresql/data"}]);
        });

        it("lists none when the old stack has none", async () => {
            const preview = await buildService().previewMigration({composePath, displayName, volumeSelections: [], namedVolumeSelections: new Map()});

            expect(preview.anonymousVolumes).toEqual([]);
        });

        it("refuses a start without the acknowledgement, naming each service and path, before anything is stopped", async () => {
            await fs.writeFile(composePath, withAnonymous, "utf-8");
            containersWithAnonymousVolume();

            const refusal = buildService().migrate(input());

            await expect(refusal).rejects.toThrow(BadRequestError);
            await expect(refusal).rejects.toThrow(/db: \/var\/lib\/postgresql\/data.*web: \/cache.*start empty/s);
            expectNoSideEffects();
        });

        it("accepts the same request with the acknowledgement and never copies them", async () => {
            await fs.writeFile(composePath, withAnonymous, "utf-8");
            mockDocker.up.mockResolvedValue(undefined);

            const result = await buildService().migrate({...input(), acknowledgeAnonymousVolumes: true});

            expect(result.success).toBe(true);
            expect(mockMigrator.copyVolumeToBindMount).not.toHaveBeenCalled();
        });

        it("needs no acknowledgement when there are none", async () => {
            mockDocker.up.mockResolvedValue(undefined);

            await expect(buildService().migrate(input())).resolves.toMatchObject({success: true});
        });
    });

    it("hands the planned real volume names to every rewrite (#101)", async () => {
        mockDocker.up.mockResolvedValue(undefined);

        const plan = await buildService().preflight(input());
        await buildService().execute(plan);

        expect(plan.volumes.get("pgdata")).toEqual({name: "original_pgdata", external: false, exists: true});
        expect(mockRewriter.rewrite).toHaveBeenCalledWith(
            expect.any(String),
            expect.anything(),
            expect.anything(),
            undefined,
            expect.objectContaining({volumes: plan.volumes}),
        );
    });

    it("refuses a bind-mount newPath escaping the managed directory before anything is stopped (CR-02, WR-01)", async () => {
        await expect(
            buildService().migrate({
                ...input(),
                volumeSelections: [{originalPath: "./data", newPath: "../../outside", convert: true}],
            }),
        ).rejects.toThrow(/escapes/);

        expectNoSideEffects();
        expect(mockOldStack.start).not.toHaveBeenCalled();
        await assertOriginalUntouched();
    });

    describe("request paths are validated in preflight (WR-01)", () => {
        const converting = (originalPath: string, newPath = "./volumes/data") => ({
            ...input({backup: false}),
            volumeSelections: [{originalPath, newPath, convert: true}],
        });

        it("refuses a converted source the compose file does not declare, in preflight and migrate", async () => {
            const service = buildService();

            await expect(service.preflight(converting("./undeclared"))).rejects.toThrow(BadRequestError);
            await expect(service.migrate(converting("./undeclared"))).rejects.toThrow("./undeclared");

            expectNoSideEffects();
            expect(mockOwnMounts.ownMounts).not.toHaveBeenCalled();
        });

        it("refuses an arbitrary absolute host path the compose file does not declare", async () => {
            await expect(buildService().preflight(converting("/etc/passwd"))).rejects.toThrow(BadRequestError);

            expectNoSideEffects();
        });

        it("does not require an unselected source to be declared", async () => {
            const plan = await buildService().preflight({
                ...input({backup: false}),
                volumeSelections: [{originalPath: "./undeclared", newPath: "./undeclared", convert: false}],
            });

            expect(plan.bindCopies).toEqual([]);
        });

        it("refuses duplicate destinations among converted selections", async () => {
            await expect(
                buildService().migrate({
                    ...input({backup: false}),
                    volumeSelections: [
                        {originalPath: "./data", newPath: "./volumes/shared", convert: true},
                        {originalPath: "./missing", newPath: "./volumes/shared", convert: true},
                    ],
                }),
            ).rejects.toThrow(BadRequestError);

            expectNoSideEffects();
        });

        it("refuses a destination that would overwrite the compose file", async () => {
            await expect(buildService().preflight(converting("./data", "./docker-compose.yml"))).rejects.toThrow(
                BadRequestError,
            );
        });

        it("refuses a bind destination that collides with a converted named volume", async () => {
            await expect(
                buildService().preflight({
                    ...converting("./data", "./volumes/pgdata"),
                    namedVolumeSelections: new Map([["pgdata", true]]),
                }),
            ).rejects.toThrow(BadRequestError);
        });

        it("refuses a compose file that does not parse when a bind source is converted", async () => {
            await fs.writeFile(composePath, "services: [unterminated\n", "utf-8");

            await expect(buildService().migrate(converting("./data"))).rejects.toThrow(BadRequestError);

            expectNoSideEffects();
        });

        it("accepts the stack-directory mount copied to the stack root", async () => {
            await fs.writeFile(composePath, composeDeclaring(["."]), "utf-8");

            const plan = await buildService().preflight(converting(".", "."));

            expect(plan.bindCopies).toHaveLength(1);
        });
    });

    describe("bind-mount sources through Docktor's own mounts (CR-03)", () => {
        let hostRoot: string;

        beforeEach(async () => {
            // Stands for the host root that production mounts at /host.
            hostRoot = path.join(tmpRoot, "host");
            await fs.mkdir(path.join(hostRoot, "opt", "app", "data"), {recursive: true});
            await fs.writeFile(path.join(hostRoot, "opt", "app", "data", "keep.txt"), "keep me", "utf-8");
            await fs.writeFile(
                composePath,
                "services:\n  web:\n    image: nginx:latest\n    volumes:\n      - /opt/app/data:/var/lib/data\n",
                "utf-8",
            );
            mockOwnMounts.ownMounts.mockResolvedValue({
                kind: "container",
                mounts: [{type: "bind", source: "/", destination: toComparablePath(hostRoot)}],
            });
        });

        it.skipIf(process.platform === "win32")(
            "copies an absolute source that is only visible under a host-root mount from there",
            async () => {
                mockDocker.up.mockResolvedValue(undefined);

                const result = await buildService().migrate({
                    ...input({backup: false}),
                    volumeSelections: [{originalPath: "/opt/app/data", newPath: "./volumes/data", convert: true}],
                });

                expect(result.success).toBe(true);
                expect(mockMigrator.copyDirectory).toHaveBeenCalledTimes(1);
                const [source, destination] = mockMigrator.copyDirectory.mock.calls[0] as [string, string];
                expect(toComparablePath(source)).toBe(toComparablePath(path.join(hostRoot, "opt", "app", "data")));
                expect(destination).toBe(path.join(newStackPath, "volumes", "data"));
            },
        );
    });

    describe("~ bind sources resolved from the old containers (#104)", () => {
        let homeData: string;

        /** The old project as Docker runs it: `web` mounts `homeData` where the compose file says `~/data`. */
        function mountsHomeData(source: string): void {
            const container = {...runningContainer("original"), mounts: [{type: "bind", source, destination: "/mnt/0"}]};
            mockProjects.resolve.mockResolvedValue({
                kind: "resolved",
                project: {name: "original", source: "containers", containers: [container]},
            });
        }

        const selecting = (convert: boolean) => ({
            ...input({backup: false}),
            volumeSelections: [{originalPath: "~/data", newPath: convert ? "./volumes/data" : "~/data", convert}],
        });

        beforeEach(async () => {
            homeData = path.join(tmpRoot, "home", "alice", "data");
            await fs.mkdir(homeData, {recursive: true});
            await fs.writeFile(path.join(homeData, "note.txt"), "from home", "utf-8");
            await fs.writeFile(composePath, composeDeclaring(["~/data"]), "utf-8");
        });

        it("copies a converted ~ source from the host directory the old container mounts, and creates no other volumes directory", async () => {
            mountsHomeData(homeData);
            mockDocker.up.mockResolvedValue(undefined);

            const result = await buildService().migrate(selecting(true));

            expect(result.success).toBe(true);
            expect(mockMigrator.copyDirectory).toHaveBeenCalledTimes(1);
            expect(mockMigrator.copyDirectory).toHaveBeenCalledWith(homeData, path.join(newStackPath, "volumes", "data"));
        });

        it.each([true, false])("hands the resolved host path to the rewrite (convert: %s)", async (convert) => {
            mountsHomeData(homeData);
            mockDocker.up.mockResolvedValue(undefined);

            await buildService().migrate(selecting(convert));

            expect(mockRewriter.rewrite).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(Array),
                expect.any(Map),
                undefined,
                expect.objectContaining({homeSources: new Map([["~/data", homeData]])}),
            );
        });

        it.each([true, false])("refuses an unresolved ~ source before anything happens (convert: %s)", async (convert) => {
            mockProjects.resolve.mockResolvedValue({
                kind: "resolved",
                project: {name: "original", source: "files", containers: []},
            });
            const service = buildService();

            await expect(service.migrate(selecting(convert))).rejects.toThrow(BadRequestError);
            await expect(service.migrate(selecting(convert))).rejects.toThrow("~/data");
            await expect(service.migrate(selecting(convert))).rejects.toThrow("Start the old stack once");
            await expect(service.migrate(selecting(convert))).rejects.toThrow("absolute path");

            expectNoSideEffects();
            expect(mockMigrator.moveDirectory).not.toHaveBeenCalled();
        });

        it("refuses a ~ source that is declared but not selected when it cannot be resolved", async () => {
            await expect(buildService().migrate(input({backup: false}))).rejects.toThrow("~/data");

            expectNoSideEffects();
        });
    });

    describe("sources Docktor cannot read fail closed (CR-03)", () => {
        beforeEach(async () => {
            await fs.writeFile(
                composePath,
                composeDeclaring(["./data", "./missing", "/opt/app/data"]),
                "utf-8",
            );
        });

        const invisible = (originalPath: string) => ({
            ...input({backup: false}),
            volumeSelections: [{originalPath, newPath: "./volumes/data", convert: true}],
        });

        it.each([
            ["Docktor sees no host path", {kind: "container", mounts: []} as OwnMountsView],
            ["Docktor's mounts are unknown", {kind: "unknown"} as OwnMountsView],
        ])("refuses a selected absolute source when %s, before anything happens", async (_label, view) => {
            mockOwnMounts.ownMounts.mockResolvedValue(view);
            const service = buildService();

            await expect(service.migrate(invisible("/opt/app/data"))).rejects.toThrow(BadRequestError);
            await expect(service.migrate(invisible("/opt/app/data"))).rejects.toThrow("/opt/app/data");
            await expect(service.preflight(invisible("/opt/app/data"))).rejects.toThrow("/opt/app/data");

            expectNoSideEffects();
            expect(mockMigrator.moveDirectory).not.toHaveBeenCalled();
            expect(await fs.readFile(path.join(originalDir, "data", "keep.txt"), "utf-8")).toBe("keep me");
        });

        it("refuses a selected ~ source that no old container mounts, before anything happens", async () => {
            await fs.writeFile(composePath, composeDeclaring(["./data", "~/data"]), "utf-8");

            await expect(buildService().migrate(invisible("~/data"))).rejects.toThrow(BadRequestError);
            await expect(buildService().migrate(invisible("~/data"))).rejects.toThrow("~/data");

            expectNoSideEffects();
        });

        it("does not refuse an unselected source Docktor cannot read", async () => {
            await fs.writeFile(composePath, composeDeclaring(["./data", "/opt/app/data"]), "utf-8");
            mockOwnMounts.ownMounts.mockResolvedValue({kind: "unknown"});
            mockDocker.up.mockResolvedValue(undefined);

            const result = await buildService().migrate({
                ...input({backup: false}),
                volumeSelections: [{originalPath: "/opt/app/data", newPath: "/opt/app/data", convert: false}],
            });

            expect(result.success).toBe(true);
        });

        it("fails the migration, removes its directory and restarts the old stack when a planned source vanished", async () => {
            const service = buildService();
            const plan = await service.preflight({
                ...input({backup: false}),
                volumeSelections: [{originalPath: "./data", newPath: "./volumes/data", convert: true}],
            });
            await fs.rm(path.join(originalDir, "data"), {recursive: true});

            const result = await service.execute(plan);

            expect(result.success).toBe(false);
            expect(result.error).toContain("data");
            expect(result.error).toContain("no longer exists");
            expect(mockStackFs.removeDirectory).toHaveBeenCalledWith(stackId);
            expect(mockOldStack.start).toHaveBeenCalledTimes(1);
            expect(mockStackRepo.create).not.toHaveBeenCalled();
            expect(mockDocker.up).not.toHaveBeenCalled();
            expect(mockMigrator.copyDirectory).not.toHaveBeenCalled();
        });

        it("rolls back and restarts the old stack on an access error raised only at execute time", async () => {
            const service = buildService();
            const plan = await service.preflight({
                ...input({backup: false}),
                volumeSelections: [{originalPath: "./data", newPath: "./volumes/data", convert: true}],
            });
            const realAccess = fs.access.bind(fs);
            const blockedSource = path.join(originalDir, "data");
            vi.spyOn(fs, "access").mockImplementation(async (target, mode) => {
                if (String(target) === blockedSource) {
                    throw Object.assign(new Error("EACCES: permission denied, access"), {code: "EACCES"});
                }
                return realAccess(target, mode);
            });

            const result = await service.execute(plan);

            expect(result.success).toBe(false);
            expect(result.error).toContain("EACCES");
            expect(mockMigrator.copyDirectory).not.toHaveBeenCalled();
            expect(mockStackFs.removeDirectory).toHaveBeenCalledWith(stackId);
            expect(mockOldStack.start).toHaveBeenCalledTimes(1);
        });

        it("turns a declared but genuinely absent relative source into an empty directory", async () => {
            mockDocker.up.mockResolvedValue(undefined);

            const result = await buildService().migrate({
                ...input({backup: false}),
                volumeSelections: [{originalPath: "./missing", newPath: "./volumes/missing", convert: true}],
            });

            expect(result.success).toBe(true);
            expect(mockMigrator.copyDirectory).not.toHaveBeenCalled();
            expect((await fs.stat(path.join(newStackPath, "volumes", "missing"))).isDirectory()).toBe(true);
        });
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

    describe("already-managed refusal (G-18-2)", () => {
        function manageOriginalDir(): void {
            mockStackRepo.listLocations.mockResolvedValue([{id: "legacy", displayName: "Legacy", hostPath: originalDir}]);
        }

        it("refuses a compose file in a managed stack's directory with a ConflictError before anything is stopped", async () => {
            manageOriginalDir();

            const migration = buildService().migrate(input({stopOldStack: true}));
            await expect(migration).rejects.toBeInstanceOf(ConflictError);
            await expect(migration).rejects.toThrow(/already managed.*Legacy/);
            await expect(buildService().preflight(input())).rejects.toBeInstanceOf(ConflictError);

            expectNoSideEffects();
            expect(mockRewriter.rewrite).not.toHaveBeenCalled();
            expect(mockDocker.up).not.toHaveBeenCalled();
        });

        it("reports Docktor's own stack (BadRequestError) before the managed one", async () => {
            manageOriginalDir();
            mockSelfStack.composeFilePaths.mockResolvedValue([composePath]);

            await expect(buildService().preflight(input())).rejects.toBeInstanceOf(BadRequestError);
        });

        it("migrates a compose file in a directory no stack manages", async () => {
            mockStackRepo.listLocations.mockResolvedValue([
                {id: "other", displayName: "Other", hostPath: path.join(tmpRoot, "elsewhere")},
            ]);
            mockDocker.up.mockResolvedValue(undefined);

            const result = await buildService().migrate(input());

            expect(result.success).toBe(true);
        });
    });

    describe("progress reporting (G-18-job)", () => {
        function copyingInput(overrides: Partial<{backup: boolean; stopOldStack: boolean}> = {}) {
            return {
                ...input(overrides),
                volumeSelections: [{originalPath: "./data", newPath: "./volumes/data", convert: true}],
                namedVolumeSelections: new Map<string, boolean>([["pgdata", true]]),
            };
        }

        it("reports every step of a separate migration in order, with the volume or path as detail", async () => {
            mockDocker.up.mockResolvedValue(undefined);
            const listener = vi.fn();

            const result = await buildService().migrate(copyingInput(), listener);

            expect(result.success).toBe(true);
            expect(listener.mock.calls.map((call) => call[0])).toEqual([
                {step: "stopping_old_stack", detail: null},
                {step: "verifying_stop", detail: null},
                {step: "creating_directory", detail: null},
                {step: "backing_up", detail: null},
                {step: "copying_named_volume", detail: "pgdata"},
                {step: "copying_bind_mount", detail: "./data"},
                {step: "writing_compose", detail: null},
                {step: "recording_stack", detail: null},
                {step: "deploying", detail: null},
            ]);
        });

        it("skips the steps a run does not perform", async () => {
            mockDocker.up.mockResolvedValue(undefined);
            const listener = vi.fn();

            await buildService().migrate(input({backup: false, stopOldStack: false}), listener);

            expect(listener.mock.calls.map((call) => call[0].step)).toEqual([
                "creating_directory",
                "writing_compose",
                "recording_stack",
                "deploying",
            ]);
        });

        it("reports rolling_back and then restarting_old_stack when a step fails, and still returns the rollback failure", async () => {
            mockDocker.up.mockRejectedValue(new Error("docker compose up failed"));
            const listener = vi.fn();

            const result = await buildService().migrate(input(), listener);

            expect(result.success).toBe(false);
            expect(result.error).toContain("docker compose up failed");
            expect(listener.mock.calls.slice(-3).map((call) => call[0].step)).toEqual([
                "deploying",
                "rolling_back",
                "restarting_old_stack",
            ]);
        });

        it("is not affected by a listener that throws on every call", async () => {
            mockDocker.up.mockResolvedValue(undefined);
            const listener = vi.fn(() => {
                throw new Error("listener exploded");
            });

            const result = await buildService().migrate(copyingInput(), listener);

            expect(result).toEqual({success: true, stackId, originalPath: originalDir});
            expect(mockDocker.up).toHaveBeenCalledTimes(1);
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it("still rolls back and restarts the old stack when the listener throws during a failing run", async () => {
            mockDocker.up.mockRejectedValue(new Error("docker compose up failed"));
            const listener = vi.fn(() => {
                throw new Error("listener exploded");
            });

            const result = await buildService().migrate(input(), listener);

            expect(result.success).toBe(false);
            expect(result.rollback?.oldStack).toBe("restored-running");
            expect(mockStackFs.removeDirectory).toHaveBeenCalledWith(stackId);
            expect(mockOldStack.start).toHaveBeenCalledTimes(1);
        });

        it("runs without a listener", async () => {
            mockDocker.up.mockResolvedValue(undefined);

            await expect(buildService().migrate(copyingInput())).resolves.toMatchObject({success: true});
        });
    });

    describe("the rollback ledger (#100)", () => {
        /** A ledger that also writes to a shared call log, so record order can be compared with the side effects. */
        function loggingLedger(log: string[]): MigrationLedger {
            const inner = new InMemoryMigrationLedger();
            return {
                record: async (entry: MigrationLedgerEntry) => {
                    log.push(`record:${entry.kind}`);
                    await inner.record(entry);
                },
                entries: () => inner.entries(),
            };
        }

        it("records the stop before it happens and the directory and the record after they exist", async () => {
            mockDocker.up.mockResolvedValue(undefined);
            const log: string[] = [];
            mockOldStack.stop.mockImplementation(async () => {
                log.push("stop");
            });
            mockStackFs.createDirectoryExclusive.mockImplementation(async (id: string) => {
                log.push("createDirectory");
                const target = path.join(tmpRoot, "stacks", id);
                await fs.mkdir(target, {recursive: true});
                return target;
            });
            mockStackRepo.create.mockImplementation(async () => {
                log.push("createRecord");
            });
            const service = buildService();
            const ledger = loggingLedger(log);

            const result = await service.execute(await service.preflight(input({backup: false})), {ledger});

            expect(result.success).toBe(true);
            expect(log).toEqual([
                "record:stopped_old_stack",
                "stop",
                "createDirectory",
                "record:created_directory",
                "createRecord",
                "record:created_record",
            ]);
            expect(ledger.entries()[0]).toEqual({
                kind: "stopped_old_stack",
                project: "original",
                composePath,
                runningBefore: ["web"],
                sharesProjectWithNewStack: false,
            });
        });

        it("records nothing for a stop that was not needed", async () => {
            mockDocker.up.mockResolvedValue(undefined);
            mockProjects.listContainers.mockResolvedValue([]);
            const service = buildService();
            const ledger = new InMemoryMigrationLedger();

            await service.execute(await service.preflight(input({backup: false})), {ledger});

            expect(ledger.entries().map((entry) => entry.kind)).toEqual(["created_directory", "created_record"]);
            expect(mockOldStack.stop).not.toHaveBeenCalled();
        });

        it("does not record a directory the exclusive create refused, so rollback never removes a foreign one", async () => {
            mockStackFs.createDirectoryExclusive.mockRejectedValue(new Error("EEXIST"));
            const service = buildService();
            const ledger = new InMemoryMigrationLedger();

            const result = await service.execute(await service.preflight(input()), {ledger});

            expect(ledger.entries().map((entry) => entry.kind)).toEqual(["stopped_old_stack"]);
            expect(mockStackFs.removeDirectory).not.toHaveBeenCalled();
            expect(result.rollback?.oldStack).toBe("restored-running");
        });

        it("hands exactly the recorded entries to the rollback after a copy failure behind a verified stop", async () => {
            mockMigrator.copyDirectory.mockRejectedValue(new Error("ENOSPC: no space left on device"));
            const service = buildService();
            const ledger = new InMemoryMigrationLedger();

            const result = await service.execute(await service.preflight(input({backup: true})), {ledger});

            expect(result).toEqual({
                success: false,
                error: "Migration failed: ENOSPC: no space left on device",
                originalPath: originalDir,
                rollback: {oldStack: "restored-running", original: "untouched", cleanupErrors: []},
            });
            expect(ledger.entries().map((entry) => entry.kind)).toEqual(["stopped_old_stack", "created_directory"]);
        });

        it("lists a failing cleanup in the result and logs it through the injected logger", async () => {
            mockDocker.up.mockRejectedValue(new Error("docker compose up failed"));
            mockStackFs.removeDirectory.mockRejectedValue(new Error("EBUSY: directory busy"));
            mockStackRepo.delete.mockRejectedValue(new Error("database locked"));

            const result = await buildService().migrate(input());

            expect(result.rollback?.cleanupErrors).toEqual([
                "remove the stack record: database locked",
                "remove the new stack directory: EBUSY: directory busy",
            ]);
            expect(result.rollback?.oldStack).toBe("restored-running");
            expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("database locked"));
            expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("EBUSY: directory busy"));
        });

        it("never logs through the console when an injected logger is given", async () => {
            mockDocker.up.mockRejectedValue(new Error("docker compose up failed"));
            const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

            await buildService().migrate(input(), () => {
                throw new Error("listener exploded");
            });

            expect(consoleError).not.toHaveBeenCalled();
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    describe("in-place migration (G-18-7)", () => {
        const ASIDE_COMPOSE = COMPOSE;
        const REWRITTEN = "services:\n  web:\n    image: nginx:1.27\n";
        let asideDir: string;

        beforeEach(async () => {
            // The stack already lives in the stacks folder under its own slug: target == original.
            originalDir = path.join(tmpRoot, "stacks", stackId);
            composePath = path.join(originalDir, "docker-compose.yml");
            newStackPath = originalDir;
            asideDir = path.join(path.dirname(originalDir), `${stackId}-pre-migration`);
            await fs.mkdir(path.join(originalDir, "data"), {recursive: true});
            await fs.writeFile(composePath, ASIDE_COMPOSE, "utf-8");
            await fs.writeFile(path.join(originalDir, ".env"), "SECRET=1\n", "utf-8");
            await fs.writeFile(path.join(originalDir, "data", "keep.txt"), "keep me", "utf-8");

            mockStackFs.getStackDirectory.mockImplementation((id: string) => path.join(tmpRoot, "stacks", id));
            mockStackFs.removeDirectory.mockImplementation((id: string) =>
                fs.rm(path.join(tmpRoot, "stacks", id), {recursive: true, force: true}),
            );
            mockMigrator.moveDirectory.mockImplementation((src: string, dest: string) => fs.rename(src, dest));
            mockMigrator.copyDirectory.mockImplementation((src: string, dest: string) =>
                fs.cp(src, dest, {recursive: true}),
            );
            mockRewriter.rewrite.mockReturnValue({rewrittenCompose: REWRITTEN, extractedEnv: ""});
        });

        function inPlaceInput(overrides: Partial<{backup: boolean; stopOldStack: boolean; inPlaceAsideName: string}> = {}) {
            return {
                ...input({backup: true, stopOldStack: true}),
                volumeSelections: [{originalPath: "./data", newPath: "./volumes/data", convert: true}],
                ...overrides,
            };
        }

        it("renames the original aside, rebuilds the stack in its directory and keeps the renamed original as the backup", async () => {
            mockDocker.up.mockResolvedValue(undefined);

            const result = await buildService().migrate(inPlaceInput());

            expect(result).toEqual({success: true, stackId, originalPath: originalDir, keptOriginalAt: asideDir});
            const order = (mock: {mock: {invocationCallOrder: number[]}}): number =>
                mock.mock.invocationCallOrder[0] ?? Number.NaN;
            expect(order(mockOldStack.stop)).toBeLessThan(order(mockMigrator.moveDirectory));
            expect(order(mockMigrator.moveDirectory)).toBeLessThan(order(mockStackFs.createDirectoryExclusive));
            expect(mockMigrator.moveDirectory).toHaveBeenCalledWith(originalDir, asideDir);
            expect(mockMigrator.copyDirectory).toHaveBeenCalledWith(
                path.join(asideDir, "data"),
                path.join(originalDir, "volumes", "data"),
            );
            const destinations = mockMigrator.copyDirectory.mock.calls.map((call) => String(call[1]));
            expect(destinations.some((dest) => dest.endsWith(BACKUP_DIR_NAME))).toBe(false);
            expect(mockStackRepo.create).toHaveBeenCalledWith(expect.objectContaining({hostPath: originalDir}));
        });

        it("counts no backup copy in place: the renamed original is the backup", async () => {
            mockDiskSpace.measureDirectoryBytes.mockImplementation(async (target: string) =>
                target === path.join(originalDir, "data") ? 400 : 5_000_000,
            );
            mockDiskSpace.filesystemOf.mockResolvedValue({filesystemId: "fs-stacks", label: STACKS_FILESYSTEM, availableBytes: 440});

            const plan = await buildService().preflight(inPlaceInput({backup: true}));

            expect(plan.inPlace).not.toBeNull();
            expect(mockDiskSpace.measureDirectoryBytes).not.toHaveBeenCalledWith(originalDir);
        });

        it("reports moving_original_aside after stopping and before creating the directory, without a backup step", async () => {
            mockDocker.up.mockResolvedValue(undefined);
            const listener = vi.fn();

            await buildService().migrate(inPlaceInput(), listener);

            expect(listener.mock.calls.map((call) => call[0].step)).toEqual([
                "stopping_old_stack",
                "verifying_stop",
                "moving_original_aside",
                "creating_directory",
                "copying_bind_mount",
                "writing_compose",
                "recording_stack",
                "deploying",
            ]);
        });

        it("leaves the renamed original byte-identical and writes the new compose file and .env into the original path", async () => {
            mockDocker.up.mockResolvedValue(undefined);

            await buildService().migrate(inPlaceInput());

            expect(await fs.readFile(path.join(asideDir, "docker-compose.yml"), "utf-8")).toBe(ASIDE_COMPOSE);
            expect(await fs.readFile(path.join(asideDir, ".env"), "utf-8")).toBe("SECRET=1\n");
            expect(await fs.readFile(path.join(asideDir, "data", "keep.txt"), "utf-8")).toBe("keep me");
            expect(await fs.readFile(composePath, "utf-8")).toBe(REWRITTEN);
            expect(await fs.readFile(path.join(originalDir, ".env"), "utf-8")).toBe("SECRET=1\n");
            expect(await fs.readFile(path.join(originalDir, "volumes", "data", "keep.txt"), "utf-8")).toBe("keep me");
        });

        it("uses the aside name the user chose", async () => {
            mockDocker.up.mockResolvedValue(undefined);

            const result = await buildService().migrate(inPlaceInput({inPlaceAsideName: "memos-old"}));

            expect(result.success).toBe(true);
            expect(result.keptOriginalAt).toBe(path.join(path.dirname(originalDir), "memos-old"));
            expect(await fs.readFile(path.join(path.dirname(originalDir), "memos-old", "data", "keep.txt"), "utf-8")).toBe(
                "keep me",
            );
        });

        it("does not report keptOriginalAt for a migration into a separate directory", async () => {
            mockStackFs.getStackDirectory.mockImplementation((id: string) => path.join(tmpRoot, "elsewhere", id));
            mockStackFs.createDirectoryExclusive.mockImplementation(async (id: string) => {
                const target = path.join(tmpRoot, "elsewhere", id);
                await fs.mkdir(target, {recursive: true});
                return target;
            });
            mockDocker.up.mockResolvedValue(undefined);

            const result = await buildService().migrate(inPlaceInput());

            expect(result.success).toBe(true);
            expect(result.keptOriginalAt).toBeUndefined();
            expect(mockMigrator.moveDirectory).not.toHaveBeenCalled();
        });

        it("reads an absolute bind-mount source inside the original directory from the renamed directory", async () => {
            mockDocker.up.mockResolvedValue(undefined);
            // Long syntax, so a drive-letter path stays one value on Windows.
            await fs.writeFile(
                composePath,
                `services:\n  web:\n    image: nginx:latest\n    volumes:\n      - type: bind\n        source: ${JSON.stringify(path.join(originalDir, "data"))}\n        target: /data\n`,
                "utf-8",
            );

            const result = await buildService().migrate({
                ...inPlaceInput(),
                volumeSelections: [{originalPath: path.join(originalDir, "data"), newPath: "./volumes/data", convert: true}],
            });

            expect(result.success).toBe(true);
            expect(mockMigrator.copyDirectory).toHaveBeenCalledWith(
                path.join(asideDir, "data"),
                path.join(originalDir, "volumes", "data"),
            );
        });

        describe("refusals before any side effect", () => {
            function expectNothingMoved(): void {
                expectNoSideEffects();
                expect(mockMigrator.moveDirectory).not.toHaveBeenCalled();
            }

            it("refuses an in-place migration that does not stop the old stack (T-18-35)", async () => {
                const refusal = buildService().migrate(inPlaceInput({stopOldStack: false}));

                await expect(refusal).rejects.toBeInstanceOf(BadRequestError);
                await expect(refusal).rejects.toThrow("must stop the old stack");
                expectNothingMoved();
            });

            it.each([
                ["a traversing name", "../evil"],
                ["a name with a separator", "a/b"],
                ["a name with a backslash", "a\\b"],
                ["a dot name", ".."],
                ["the original directory's own name", stackId],
            ])("refuses %s as the aside name (T-18-33)", async (_label, name) => {
                await expect(buildService().migrate(inPlaceInput({inPlaceAsideName: name}))).rejects.toBeInstanceOf(
                    BadRequestError,
                );
                expectNothingMoved();
            });

            it("refuses an aside directory that already exists and leaves it untouched", async () => {
                await fs.mkdir(asideDir);
                await fs.writeFile(path.join(asideDir, "marker.txt"), "mine", "utf-8");

                const refusal = buildService().migrate(inPlaceInput({inPlaceAsideName: path.basename(asideDir)}));

                await expect(refusal).rejects.toBeInstanceOf(ConflictError);
                await expect(refusal).rejects.toThrow(asideDir);
                expectNothingMoved();
                expect(await fs.readFile(path.join(asideDir, "marker.txt"), "utf-8")).toBe("mine");
            });

            it("falls back to the next free default aside name when <slug>-pre-migration exists", async () => {
                await fs.mkdir(asideDir);

                const plan = await buildService().preflight(inPlaceInput());

                expect(plan.inPlace?.asideDir).toBe(`${asideDir}-2`);
                expectNothingMoved();
            });

            it("still refuses a target that nests inside the original directory", async () => {
                mockStackFs.getStackDirectory.mockReturnValue(path.join(originalDir, "nested"));

                const refusal = buildService().migrate(inPlaceInput());

                await expect(refusal).rejects.toBeInstanceOf(ConflictError);
                await expect(refusal).rejects.toThrow("overlap");
                expectNothingMoved();
            });
        });

        describe("rollback", () => {
            it("records the rename aside after it happened and shares the project with the new stack", async () => {
                mockDocker.up.mockResolvedValue(undefined);
                const service = buildService();
                const ledger = new InMemoryMigrationLedger();

                await service.execute(await service.preflight(inPlaceInput()), {ledger});

                expect(ledger.entries().map((entry) => entry.kind)).toEqual([
                    "stopped_old_stack",
                    "moved_aside",
                    "created_directory",
                    "created_record",
                ]);
                expect(ledger.entries()[0]).toMatchObject({sharesProjectWithNewStack: true});
                expect(ledger.entries()[1]).toEqual({kind: "moved_aside", originalDir, asideDir});
            });

            it("removes the new directory, moves the original back and restarts the old stack", async () => {
                mockDocker.up.mockRejectedValue(new Error("docker compose up failed"));

                const result = await buildService().migrate(inPlaceInput());

                expect(result.success).toBe(false);
                expect(result.error).toContain("docker compose up failed");
                expect(result.error).toBe("Migration failed: docker compose up failed");
                expect(result.rollback).toEqual({oldStack: "restored-running", original: "restored", cleanupErrors: []});
                expect(result.keptOriginalAt).toBeUndefined();
                expect(mockMigrator.moveDirectory).toHaveBeenLastCalledWith(asideDir, originalDir);
                expect(await fs.readFile(composePath, "utf-8")).toBe(ASIDE_COMPOSE);
                expect(await fs.readFile(path.join(originalDir, ".env"), "utf-8")).toBe("SECRET=1\n");
                expect(await fs.readFile(path.join(originalDir, "data", "keep.txt"), "utf-8")).toBe("keep me");
                await expect(fs.access(path.join(originalDir, "volumes"))).rejects.toThrow();
                await expect(fs.access(asideDir)).rejects.toThrow();
                expect(mockStackRepo.delete).toHaveBeenCalledWith(stackId);
                expect(mockOldStack.start).toHaveBeenCalledTimes(1);
                expect(mockOldStack.start).toHaveBeenCalledWith({composePath, project: stackId}, ["web"]);
                const moveBack = mockMigrator.moveDirectory.mock.invocationCallOrder[1] ?? Number.NaN;
                expect(moveBack).toBeLessThan(mockOldStack.start.mock.invocationCallOrder[0] ?? Number.NaN);
            });

            it("leaves everything in place and explains how to restore it when the original path is still occupied", async () => {
                mockDocker.up.mockRejectedValue(new Error("docker compose up failed"));
                // The new directory cannot be removed, so the original path stays taken.
                mockStackFs.removeDirectory.mockResolvedValue(undefined);

                const result = await buildService().migrate(inPlaceInput());

                expect(result.success).toBe(false);
                expect(result.rollback).toEqual({oldStack: "left-stopped", original: "left-aside", keptOriginalAt: asideDir, cleanupErrors: []});
                expect(mockMigrator.moveDirectory).toHaveBeenCalledTimes(1);
                expect(mockOldStack.start).not.toHaveBeenCalled();
                expect(await fs.readFile(path.join(asideDir, "docker-compose.yml"), "utf-8")).toBe(ASIDE_COMPOSE);
                expect(await fs.readFile(path.join(asideDir, ".env"), "utf-8")).toBe("SECRET=1\n");
                expect(await fs.readFile(path.join(asideDir, "data", "keep.txt"), "utf-8")).toBe("keep me");
            });

            it("gives the same manual instructions when the rename back fails", async () => {
                mockDocker.up.mockRejectedValue(new Error("docker compose up failed"));
                mockMigrator.moveDirectory
                    .mockImplementationOnce((src: string, dest: string) => fs.rename(src, dest))
                    .mockRejectedValueOnce(new Error("EBUSY: resource busy"));

                const result = await buildService().migrate(inPlaceInput());

                expect(result.success).toBe(false);
                expect(result.rollback).toMatchObject({oldStack: "left-stopped", original: "left-aside", keptOriginalAt: asideDir});
                expect(result.rollback?.cleanupErrors).toEqual([expect.stringContaining("EBUSY")]);
                expect(mockOldStack.start).not.toHaveBeenCalled();
                expect(await fs.readFile(path.join(asideDir, "data", "keep.txt"), "utf-8")).toBe("keep me");
            });

            it("restarts the old stack and creates nothing when the rename aside itself fails", async () => {
                mockMigrator.moveDirectory.mockRejectedValue(new Error("EXDEV: cross-device link not permitted"));

                const result = await buildService().migrate(inPlaceInput());

                expect(result.success).toBe(false);
                expect(result.error).toContain("EXDEV");
                expect(mockStackFs.createDirectoryExclusive).not.toHaveBeenCalled();
                expect(mockStackFs.removeDirectory).not.toHaveBeenCalled();
                expect(mockStackRepo.create).not.toHaveBeenCalled();
                expect(mockOldStack.start).toHaveBeenCalledTimes(1);
                expect(await fs.readFile(composePath, "utf-8")).toBe(ASIDE_COMPOSE);
                expect(await fs.readFile(path.join(originalDir, "data", "keep.txt"), "utf-8")).toBe("keep me");
            });
        });
    });
});

describe("previewMigration (MIG-02, D-04, G-18-7)", () => {
    const displayName = "Preview Fixture";
    const stackId = slugify(displayName);

    let tmpDir: string;
    let stacksRoot: string;
    let composeDir: string;
    let composePath: string;
    let mockStackFs: ReturnType<typeof createMockStackFs>;
    let mockStackRepo: ReturnType<typeof createMockStackRepo>;
    let mockSelfStack: ReturnType<typeof createMockSelfStack>;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "docktor-preview-"));
        stacksRoot = path.join(tmpDir, "stacks");
        composeDir = path.join(tmpDir, "original");
        composePath = path.join(composeDir, "docker-compose.yml");
        await fs.mkdir(composeDir, {recursive: true});
        await fs.writeFile(composePath, COMPOSE, "utf-8");
        mockStackFs = createMockStackFs(stacksRoot);
        mockStackRepo = createMockStackRepo();
        mockSelfStack = createMockSelfStack();
    });

    afterEach(async () => {
        await fs.rm(tmpDir, {recursive: true, force: true});
    });

    function buildPreviewService(
        rewriter: Pick<ComposeRewriterPort, "rewrite"> = {
            rewrite: vi.fn().mockReturnValue({rewrittenCompose: COMPOSE, extractedEnv: "", envVars: {}}),
        },
        ownMounts: OwnMountsPort = createMockOwnMounts(),
        projects: ComposeProjectResolverPort = createMockProjects() as unknown as ComposeProjectResolverPort,
        diskSpace: ReturnType<typeof createMockDiskSpace> = createMockDiskSpace(),
    ): MigrationService {
        return new MigrationService({
            docker: createMockDocker() as unknown as DockerExecutorPort,
            migrator: createMockMigrator() as unknown as VolumeMigratorPort,
            rewriter: rewriter as ComposeRewriterPort,
            stackFs: mockStackFs as unknown as StackFilesystemPort,
            stackRepo: mockStackRepo as unknown as StackRepository,
            oldStack: createMockOldStack() as unknown as ExternalStackControlPort,
            projects,
            selfStack: mockSelfStack as unknown as SelfStackPort,
            ownMounts,
            directories: hostViewDirectories(),
            diskSpace: diskSpace as unknown as DiskSpaceProbePort,
        });
    }

    function request(overrides: Partial<{composePath: string; displayName: string}> = {}) {
        return {
            composePath,
            displayName,
            volumeSelections: [],
            namedVolumeSelections: new Map<string, boolean>(),
            ...overrides,
        };
    }

    it("returns a UnifiedDiff with individually marked added and removed lines", async () => {
        const rewriter = {
            rewrite: vi.fn().mockReturnValue({
                rewrittenCompose: COMPOSE.replace("nginx:latest", "nginx:1.27"),
                extractedEnv: "FOO=bar",
                envVars: {},
            }),
        };

        const result = await buildPreviewService(rewriter).previewMigration(request());

        expect(result.diff.added).toBe(1);
        expect(result.diff.removed).toBe(1);
        const lines = result.diff.hunks.flatMap((hunk) => hunk.lines);
        expect(lines).toContainEqual(expect.objectContaining({kind: "removed", text: "    image: nginx:latest"}));
        expect(lines).toContainEqual(expect.objectContaining({kind: "added", text: "    image: nginx:1.27"}));
        expect(result.extractedEnv).toBe("FOO=bar");
    });

    it("hands the old .env text to the rewrite, or undefined when there is none", async () => {
        const rewriter = {rewrite: vi.fn().mockReturnValue({rewrittenCompose: COMPOSE, extractedEnv: "", envVars: {}})};
        const service = buildPreviewService(rewriter);

        await service.previewMigration(request());
        await fs.writeFile(path.join(composeDir, ".env"), "OLD=1\n", "utf-8");
        await service.previewMigration(request());

        expect(rewriter.rewrite.mock.calls.map((call) => call[3])).toEqual([undefined, "OLD=1\n"]);
    });

    describe("the disk space check (#107, D-08)", () => {
        const dataDir = (): string => path.join(composeDir, "data");
        const selection = [{originalPath: "./data", newPath: "./volumes/data", convert: true}];

        beforeEach(async () => {
            await fs.mkdir(dataDir());
        });

        function probe(availableBytes: number) {
            const diskSpace = createMockDiskSpace(availableBytes);
            diskSpace.measureDirectoryBytes.mockImplementation(async (target: string) => (target === composeDir ? 600 : target === dataDir() ? 400 : 1));
            return diskSpace;
        }

        it("reports the assessment without and with a backup for a separate migration, a shortfall as ok false", async () => {
            const result = await buildPreviewService(undefined, undefined, undefined, probe(1_000)).previewMigration(
                request({volumeSelections: selection}),
            );

            expect(result.diskSpace).toEqual({
                withoutBackup: {ok: true, filesystems: [{label: STACKS_FILESYSTEM, requiredBytes: 440, availableBytes: 1_000}]},
                withBackup: {ok: false, filesystems: [{label: STACKS_FILESYSTEM, requiredBytes: 1_100, availableBytes: 1_000}]},
            });
        });

        it("measures every item once, however many assessments it feeds", async () => {
            const diskSpace = probe(10_000);

            await buildPreviewService(undefined, undefined, undefined, diskSpace).previewMigration(request({volumeSelections: selection}));

            expect(diskSpace.measureDirectoryBytes.mock.calls.map((call) => call[0]).sort()).toEqual([composeDir, dataDir()].sort());
        });

        it("has no with-backup assessment for an in-place migration", async () => {
            const inPlaceDir = path.join(stacksRoot, stackId);
            await fs.mkdir(path.join(inPlaceDir, "data"), {recursive: true});
            await fs.writeFile(path.join(inPlaceDir, "docker-compose.yml"), COMPOSE, "utf-8");
            const diskSpace = probe(10_000);

            const result = await buildPreviewService(undefined, undefined, undefined, diskSpace).previewMigration(
                request({composePath: path.join(inPlaceDir, "docker-compose.yml"), volumeSelections: selection}),
            );

            expect(result.diskSpace.withBackup).toBeNull();
            expect(result.diskSpace.withoutBackup.ok).toBe(true);
            expect(diskSpace.measureDirectoryBytes.mock.calls.map((call) => call[0])).not.toContain(inPlaceDir);
        });

        it("refuses a size it cannot measure like the start does", async () => {
            const diskSpace = probe(10_000);
            diskSpace.measureDirectoryBytes.mockResolvedValue(null);

            await expect(
                buildPreviewService(undefined, undefined, undefined, diskSpace).previewMigration(request({volumeSelections: selection})),
            ).rejects.toBeInstanceOf(BadRequestError);
        });
    });

    describe("a ~ bind source (#104)", () => {
        const homeProject = (source: string): ComposeProjectResolverPort =>
            ({
                resolve: vi.fn().mockResolvedValue({
                    kind: "resolved",
                    project: {
                        name: "original",
                        source: "containers",
                        containers: [{...runningContainer("original"), mounts: [{type: "bind", source, destination: "/mnt/0"}]}],
                    },
                }),
                listContainers: vi.fn().mockResolvedValue([]),
            }) as unknown as ComposeProjectResolverPort;

        const selecting = (convert: boolean) => ({
            ...request(),
            volumeSelections: [{originalPath: "~/data", newPath: convert ? "./volumes/data" : "~/data", convert}],
        });

        beforeEach(async () => {
            await fs.writeFile(composePath, composeDeclaring(["~/data"]), "utf-8");
        });

        it.each([
            [true, "./volumes/data:/mnt/0"],
            [false, "/home/alice/data:/mnt/0"],
        ])("shows the rewritten line in the diff (convert: %s)", async (convert, rewritten) => {
            const service = buildPreviewService(new ComposeRewriter(), createMockOwnMounts(), homeProject("/home/alice/data"));

            const result = await service.previewMigration(selecting(convert));

            const lines = result.diff.hunks.flatMap((hunk) => hunk.lines);
            expect(lines).toContainEqual(expect.objectContaining({kind: "removed", text: "      - ~/data:/mnt/0"}));
            expect(lines).toContainEqual(expect.objectContaining({kind: "added", text: `      - ${rewritten}`}));
        });

        it("refuses a ~ source that cannot be resolved", async () => {
            await expect(buildPreviewService().previewMigration(selecting(true))).rejects.toThrow(BadRequestError);
            await expect(buildPreviewService().previewMigration(selecting(true))).rejects.toThrow("~/data");
        });
    });

    it("returns the empty diff when the rewrite leaves the content unchanged", async () => {
        const result = await buildPreviewService().previewMigration(request());

        expect(result.diff).toEqual({hunks: [], added: 0, removed: 0});
    });

    it("reports a separate target for a stack that moves into a new directory", async () => {
        const result = await buildPreviewService().previewMigration(request());

        expect(result.target).toEqual({
            stackId,
            directory: path.join(stacksRoot, stackId),
            originalDirectory: composeDir,
            inPlace: false,
            suggestedAsideName: null,
            sharedProjectName: null,
        });
    });

    describe("a stack already in the stacks folder under the same name", () => {
        let inPlaceCompose: string;

        beforeEach(async () => {
            const inPlaceDir = path.join(stacksRoot, stackId);
            inPlaceCompose = path.join(inPlaceDir, "docker-compose.yml");
            await fs.mkdir(inPlaceDir, {recursive: true});
            await fs.writeFile(inPlaceCompose, COMPOSE, "utf-8");
        });

        it("reports an in-place target with a free suggested aside name", async () => {
            const result = await buildPreviewService().previewMigration(request({composePath: inPlaceCompose}));

            expect(result.target).toEqual({
                stackId,
                directory: path.join(stacksRoot, stackId),
                originalDirectory: path.join(stacksRoot, stackId),
                inPlace: true,
                suggestedAsideName: `${stackId}-pre-migration`,
                sharedProjectName: null,
            });
        });

        it("suggests the next numbered name when the default is taken", async () => {
            await fs.mkdir(path.join(stacksRoot, `${stackId}-pre-migration`));

            const result = await buildPreviewService().previewMigration(request({composePath: inPlaceCompose}));

            expect(result.target.suggestedAsideName).toBe(`${stackId}-pre-migration-2`);
        });
    });

    describe("refuses what migrate would refuse", () => {
        it("a target nested inside the original directory (ConflictError)", async () => {
            mockStackFs.getStackDirectory.mockReturnValue(path.join(composeDir, "nested"));

            await expect(buildPreviewService().previewMigration(request())).rejects.toBeInstanceOf(ConflictError);
        });

        it("a separate target directory that already exists (ConflictError)", async () => {
            await fs.mkdir(path.join(stacksRoot, stackId), {recursive: true});

            await expect(buildPreviewService().previewMigration(request())).rejects.toBeInstanceOf(ConflictError);
        });

        it("an existing stack record (ConflictError)", async () => {
            mockStackRepo.exists.mockResolvedValue(true);

            await expect(buildPreviewService().previewMigration(request())).rejects.toBeInstanceOf(ConflictError);
        });

        it("a compose file in a managed stack's directory (ConflictError)", async () => {
            mockStackRepo.listLocations.mockResolvedValue([{id: "legacy", displayName: "Legacy", hostPath: composeDir}]);

            await expect(buildPreviewService().previewMigration(request())).rejects.toBeInstanceOf(ConflictError);
        });

        it("a display name that produces an empty slug (BadRequestError)", async () => {
            await expect(buildPreviewService().previewMigration(request({displayName: "!!!"}))).rejects.toBeInstanceOf(
                BadRequestError,
            );
        });

        it("Docktor's own compose file (BadRequestError)", async () => {
            mockSelfStack.composeFilePaths.mockResolvedValue([composePath]);

            await expect(buildPreviewService().previewMigration(request())).rejects.toBeInstanceOf(BadRequestError);
        });
    });

    describe("bind-mount sources (CR-03)", () => {
        it("lists a selected source that does not exist in emptySources and omits a present one", async () => {
            await fs.mkdir(path.join(composeDir, "present"));

            const preview = await buildPreviewService().previewMigration({
                ...request(),
                volumeSelections: [
                    {originalPath: "./missing", newPath: "./volumes/missing", convert: true},
                    {originalPath: "./present", newPath: "./volumes/present", convert: true},
                ],
            });

            expect(preview.emptySources).toEqual(["./missing"]);
        });

        it("refuses a converted source the compose file does not declare and a bad destination", async () => {
            const service = buildPreviewService();

            await expect(
                service.previewMigration({
                    ...request(),
                    volumeSelections: [{originalPath: "./undeclared", newPath: "./volumes/x", convert: true}],
                }),
            ).rejects.toThrow(BadRequestError);
            await expect(
                service.previewMigration({
                    ...request(),
                    volumeSelections: [{originalPath: "./present", newPath: "../../outside", convert: true}],
                }),
            ).rejects.toThrow(BadRequestError);
        });

        it("returns no emptySources when nothing is selected", async () => {
            const preview = await buildPreviewService().previewMigration(request());

            expect(preview.emptySources).toEqual([]);
        });

        it.each([
            ["Docktor sees no host path", {kind: "container", mounts: []} as OwnMountsView],
            ["Docktor's mounts are unknown", {kind: "unknown"} as OwnMountsView],
        ])("refuses a selected absolute source when %s", async (_label, view) => {
            await fs.writeFile(composePath, composeDeclaring(["/opt/app/data"]), "utf-8");
            const service = buildPreviewService(undefined, createMockOwnMounts(view));

            await expect(
                service.previewMigration({
                    ...request(),
                    volumeSelections: [{originalPath: "/opt/app/data", newPath: "./volumes/data", convert: true}],
                }),
            ).rejects.toThrow(BadRequestError);
        });
    });
});

describe.skipIf(process.platform === "win32")("a stack in the stacks folder reached through /host (G-18-22-inplace)", () => {
    const displayName = "Memos";
    const stackId = slugify(displayName);
    const REWRITTEN = "services:\n  web:\n    image: nginx:1.27\n";

    let tmpRoot: string;
    let hostRoot: string;
    let stacksRoot: string;
    let realDir: string;
    let aliasDir: string;
    let aliasCompose: string;
    let asideDir: string;
    let mockDocker: ReturnType<typeof createMockDocker>;
    let mockMigrator: ReturnType<typeof createMockMigrator>;
    let mockStackFs: ReturnType<typeof createMockStackFs>;
    let mockStackRepo: ReturnType<typeof createMockStackRepo>;
    let mockOldStack: ReturnType<typeof createMockOldStack>;
    let mockOwnMounts: ReturnType<typeof createMockOwnMounts>;

    beforeEach(async () => {
        tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "docktor-alias-"));
        stacksRoot = path.join(tmpRoot, "stacks");
        // Stands for the host root that production mounts read-only at /host.
        hostRoot = path.join(tmpRoot, "host");
        realDir = path.join(stacksRoot, stackId);
        asideDir = path.join(stacksRoot, `${stackId}-pre-migration`);
        await fs.mkdir(path.join(realDir, "data"), {recursive: true});
        await fs.writeFile(path.join(realDir, "docker-compose.yml"), COMPOSE, "utf-8");
        await fs.writeFile(path.join(realDir, ".env"), "SECRET=1\n", "utf-8");
        await fs.writeFile(path.join(realDir, "data", "keep.txt"), "keep me", "utf-8");
        // The same files are readable under both spellings, as on a real host.
        aliasDir = hostRoot + stacksRoot;
        await fs.mkdir(path.dirname(aliasDir), {recursive: true});
        await fs.symlink(stacksRoot, aliasDir);
        aliasCompose = path.join(aliasDir, stackId, "docker-compose.yml");

        mockDocker = createMockDocker();
        mockDocker.up.mockResolvedValue(undefined);
        mockMigrator = createMockMigrator();
        mockMigrator.moveDirectory.mockImplementation((src: string, dest: string) => fs.rename(src, dest));
        mockMigrator.copyDirectory.mockImplementation((src: string, dest: string) =>
            fs.cp(src, dest, {recursive: true}),
        );
        mockStackFs = createMockStackFs(stacksRoot);
        mockStackRepo = createMockStackRepo();
        mockOldStack = createMockOldStack();
        mockOwnMounts = createMockOwnMounts({
            kind: "container",
            mounts: [
                {type: "bind", source: "/", destination: toComparablePath(hostRoot)},
                {type: "bind", source: toComparablePath(stacksRoot), destination: toComparablePath(stacksRoot)},
            ],
        });
    });

    afterEach(async () => {
        await fs.rm(tmpRoot, {recursive: true, force: true});
    });

    function buildService(): MigrationService {
        const rewriter = {rewrite: vi.fn().mockReturnValue({rewrittenCompose: REWRITTEN, extractedEnv: "", envVars: {}})};
        return new MigrationService({
            docker: mockDocker as unknown as DockerExecutorPort,
            migrator: mockMigrator as unknown as VolumeMigratorPort,
            rewriter: rewriter as unknown as ComposeRewriterPort,
            stackFs: mockStackFs as unknown as StackFilesystemPort,
            stackRepo: mockStackRepo as unknown as StackRepository,
            oldStack: mockOldStack as unknown as ExternalStackControlPort,
            projects: createMockProjects(mockOldStack) as unknown as ComposeProjectResolverPort,
            selfStack: createMockSelfStack() as unknown as SelfStackPort,
            ownMounts: mockOwnMounts as unknown as OwnMountsPort,
            directories: directoriesOver(mockOwnMounts as unknown as OwnMountsPort),
            diskSpace: createMockDiskSpace() as unknown as DiskSpaceProbePort,
        });
    }

    function request(composePath: string = aliasCompose) {
        return {
            composePath,
            displayName,
            volumeSelections: [{originalPath: "./data", newPath: "./volumes/data", convert: true}],
            namedVolumeSelections: new Map<string, boolean>(),
        };
    }

    it("previews as an in-place migration with a free aside name instead of refusing", async () => {
        const preview = await buildService().previewMigration(request());

        expect(preview.target).toEqual({
            stackId,
            directory: realDir,
            originalDirectory: realDir,
            inPlace: true,
            suggestedAsideName: `${stackId}-pre-migration`,
            sharedProjectName: null,
        });
    });

    it("renames the original aside, builds the new stack and stops it through the writable stacks-folder path", async () => {
        const result = await buildService().migrate({
            ...request(),
            backup: false,
            stopOldStack: true,
        });

        expect(result).toEqual({success: true, stackId, originalPath: realDir, keptOriginalAt: asideDir});
        expect(mockMigrator.moveDirectory).toHaveBeenCalledWith(realDir, asideDir);
        for (const argument of mockMigrator.moveDirectory.mock.calls.flat()) {
            expect(String(argument).startsWith(hostRoot)).toBe(false);
        }
        expect(mockOldStack.stop).toHaveBeenCalledWith(
            {composePath: path.join(realDir, "docker-compose.yml"), project: stackId},
            {timeoutMs: 120_000},
        );
        expect(mockStackRepo.create).toHaveBeenCalledWith(expect.objectContaining({hostPath: realDir}));
        expect(await fs.readFile(path.join(asideDir, "data", "keep.txt"), "utf-8")).toBe("keep me");
        expect(await fs.readFile(path.join(realDir, "volumes", "data", "keep.txt"), "utf-8")).toBe("keep me");
    });

    it("refuses a target nested with the original through the /host spelling before anything happens", async () => {
        // The compose file sits in the stacks folder itself, so the new stack directory lies inside its directory.
        const composeInStacksFolder = path.join(aliasDir, "docker-compose.yml");
        await fs.writeFile(path.join(stacksRoot, "docker-compose.yml"), COMPOSE, "utf-8");

        await expect(buildService().migrate({...request(composeInStacksFolder), backup: true, stopOldStack: true})).rejects.toThrow(
            ConflictError,
        );

        expect(mockOldStack.stop).not.toHaveBeenCalled();
        expect(mockMigrator.moveDirectory).not.toHaveBeenCalled();
        expect(mockStackFs.createDirectoryExclusive).not.toHaveBeenCalled();
    });

    describe("a managed stack's directory reached through the /host spelling (WR-10)", () => {
        beforeEach(() => {
            mockStackRepo.listLocations.mockResolvedValue([
                {id: "blog", displayName: "Blog", hostPath: path.join(stacksRoot, "blog")},
            ]);
            mockStackRepo.exists.mockResolvedValue(false);
        });

        async function managedAliasRequest() {
            await fs.mkdir(path.join(stacksRoot, "blog"), {recursive: true});
            await fs.writeFile(path.join(stacksRoot, "blog", "docker-compose.yml"), COMPOSE, "utf-8");
            return request(path.join(aliasDir, "blog", "docker-compose.yml"));
        }

        it("refuses migrate with a ConflictError and no side effects", async () => {
            const managed = await managedAliasRequest();

            await expect(buildService().migrate({...managed, backup: false, stopOldStack: true})).rejects.toThrow(
                /already managed by Docktor as "Blog"/,
            );

            expect(mockOldStack.stop).not.toHaveBeenCalled();
            expect(mockStackFs.createDirectoryExclusive).not.toHaveBeenCalled();
            expect(mockMigrator.moveDirectory).not.toHaveBeenCalled();
            expect(mockStackRepo.create).not.toHaveBeenCalled();
        });

        it("refuses previewMigration with a ConflictError", async () => {
            const managed = await managedAliasRequest();

            await expect(buildService().previewMigration(managed)).rejects.toThrow(ConflictError);
        });
    });

    it("still refuses an existing target when Docktor's mounts are unknown (fail-safe)", async () => {
        mockOwnMounts.ownMounts.mockResolvedValue({kind: "unknown"});

        await expect(buildService().previewMigration(request())).rejects.toThrow(/already exists/);
    });
});

describe("MigrationService environment extraction (CR-02)", () => {
    const displayName = "Env Fixture";
    const stackId = slugify(displayName);
    const TWO_SERVICES = [
        "services:",
        "  web:",
        "    image: nginx",
        "    environment:",
        '      PORT: "80"',
        "  worker:",
        "    image: busybox",
        "    environment:",
        '      PORT: "9000"',
        "",
    ].join("\n");
    const ONE_SERVICE = ["services:", "  app:", "    image: nginx", "    environment:", '      PORT: "80"', ""].join("\n");
    const EXTRACTED_HEADER = "\n\n# Extracted from docker-compose.yml\n";

    let tmpRoot: string;
    let originalDir: string;
    let composePath: string;
    let newStackPath: string;
    let mockStackFs: ReturnType<typeof createMockStackFs>;
    let mockOldStack: ReturnType<typeof createMockOldStack>;

    beforeEach(async () => {
        tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "docktor-env-"));
        originalDir = path.join(tmpRoot, "original");
        composePath = path.join(originalDir, "docker-compose.yml");
        newStackPath = path.join(tmpRoot, "stacks", stackId);
        await fs.mkdir(originalDir, {recursive: true});
        await fs.writeFile(composePath, TWO_SERVICES, "utf-8");
        mockStackFs = createMockStackFs(path.join(tmpRoot, "stacks"));
        mockOldStack = createMockOldStack();
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await fs.rm(tmpRoot, {recursive: true, force: true});
    });

    function buildRealRewriterService(): MigrationService {
        const docker = createMockDocker();
        docker.up.mockResolvedValue(undefined);
        return new MigrationService({
            docker: docker as unknown as DockerExecutorPort,
            migrator: createMockMigrator() as unknown as VolumeMigratorPort,
            rewriter: new ComposeRewriter(() => new Set()),
            stackFs: mockStackFs as unknown as StackFilesystemPort,
            stackRepo: createMockStackRepo() as unknown as StackRepository,
            oldStack: mockOldStack as unknown as ExternalStackControlPort,
            projects: createMockProjects(mockOldStack) as unknown as ComposeProjectResolverPort,
            selfStack: createMockSelfStack() as unknown as SelfStackPort,
            ownMounts: createMockOwnMounts() as unknown as OwnMountsPort,
            directories: hostViewDirectories(),
            diskSpace: createMockDiskSpace() as unknown as DiskSpaceProbePort,
        });
    }

    function request() {
        return {
            composePath,
            displayName,
            volumeSelections: [],
            namedVolumeSelections: new Map<string, boolean>(),
            backup: false,
            stopOldStack: false,
            acknowledgeAnonymousVolumes: false,
        };
    }

    const readNewEnv = (): Promise<string> => fs.readFile(path.join(newStackPath, ".env"), "utf-8");

    function failReadingOldEnv(): void {
        const realReadFile = fs.readFile.bind(fs) as (...args: unknown[]) => Promise<unknown>;
        vi.spyOn(fs, "readFile").mockImplementation((async (target: unknown, ...rest: unknown[]) => {
            if (String(target) === path.join(originalDir, ".env")) {
                throw Object.assign(new Error("EACCES: permission denied, open"), {code: "EACCES"});
            }
            return realReadFile(target, ...rest);
        }) as typeof fs.readFile);
    }

    it("keeps each service's own PORT: web reads PORT, worker reads WORKER_PORT", async () => {
        const result = await buildRealRewriterService().migrate(request());

        expect(result.success).toBe(true);
        const written = await fs.readFile(path.join(newStackPath, "docker-compose.yml"), "utf-8");
        expect(written).toContain('PORT: "${PORT}"');
        expect(written).toContain('PORT: "${WORKER_PORT}"');
        const env = parseEnvAssignments(await readNewEnv());
        expect(env.PORT).toBe("80");
        expect(env.WORKER_PORT).toBe("9000");
    });

    describe("with an old .env", () => {
        beforeEach(async () => {
            await fs.writeFile(composePath, ONE_SERVICE, "utf-8");
        });

        it("appends the extracted block to the old content and writes every key on one line", async () => {
            await fs.writeFile(path.join(originalDir, ".env"), "PORT=8080\n", "utf-8");

            const result = await buildRealRewriterService().migrate(request());

            expect(result.success).toBe(true);
            const env = await readNewEnv();
            expect(env).toBe(`PORT=8080\n${EXTRACTED_HEADER}APP_PORT=80`);
            const keys = env.split("\n").filter((line) => /^[A-Z_]+=/.test(line)).map((line) => line.split("=")[0]);
            expect(new Set(keys).size).toBe(keys.length);
        });

        it("shows the preview the block execute appends", async () => {
            await fs.writeFile(path.join(originalDir, ".env"), "PORT=8080\n", "utf-8");
            const service = buildRealRewriterService();

            const preview = await service.previewMigration(request());
            await service.migrate(request());

            expect(preview.extractedEnv).toBe("APP_PORT=80");
            expect(await readNewEnv()).toContain(`${EXTRACTED_HEADER}${preview.extractedEnv}`);
        });

        it("copies the old .env byte for byte when nothing is extracted", async () => {
            await fs.writeFile(composePath, "services:\n  app:\n    image: nginx\n", "utf-8");
            const bytes = Buffer.from([0x41, 0x3d, 0x31, 0x0d, 0x0a, 0xff, 0x0a]);
            await fs.writeFile(path.join(originalDir, ".env"), bytes);

            const result = await buildRealRewriterService().migrate(request());

            expect(result.success).toBe(true);
            expect(Buffer.compare(await fs.readFile(path.join(newStackPath, ".env")), bytes)).toBe(0);
        });

        it("refuses the migration before anything is stopped when the old .env cannot be read (#101)", async () => {
            await fs.writeFile(path.join(originalDir, ".env"), "PORT=8080\n", "utf-8");
            failReadingOldEnv();

            await expect(buildRealRewriterService().migrate({...request(), stopOldStack: true})).rejects.toThrow("EACCES");

            expect(mockOldStack.stop).not.toHaveBeenCalled();
            expect(mockStackFs.createDirectoryExclusive).not.toHaveBeenCalled();
        });

        it("rejects the preview when the old .env cannot be read", async () => {
            await fs.writeFile(path.join(originalDir, ".env"), "PORT=8080\n", "utf-8");
            failReadingOldEnv();

            await expect(buildRealRewriterService().previewMigration(request())).rejects.toThrow("EACCES");
        });
    });

    it("writes only the extracted block when there is no old .env", async () => {
        await fs.writeFile(composePath, ONE_SERVICE, "utf-8");

        const result = await buildRealRewriterService().migrate(request());

        expect(result.success).toBe(true);
        expect(await readNewEnv()).toBe("PORT=80");
    });
});

describe("shared compose project name (G-18-22-status)", () => {
    const PLAIN_COMPOSE = "services:\n  web:\n    image: nginx:latest\n";

    let tmpRoot: string;
    let stacksRoot: string;
    let mockDocker: ReturnType<typeof createMockDocker>;
    let mockMigrator: ReturnType<typeof createMockMigrator>;
    let mockStackFs: ReturnType<typeof createMockStackFs>;
    let mockStackRepo: ReturnType<typeof createMockStackRepo>;
    let mockOldStack: ReturnType<typeof createMockOldStack>;

    beforeEach(async () => {
        tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "docktor-shared-name-"));
        stacksRoot = path.join(tmpRoot, "stacks");
        mockDocker = createMockDocker();
        mockDocker.up.mockResolvedValue(undefined);
        mockMigrator = createMockMigrator();
        mockStackFs = createMockStackFs(stacksRoot);
        mockStackRepo = createMockStackRepo();
        mockOldStack = createMockOldStack();
    });

    afterEach(async () => {
        await fs.rm(tmpRoot, {recursive: true, force: true});
    });

    /** An old stack in `<tmp>/<directoryName>` with the given compose file and optional `.env`. */
    async function oldStack(directoryName: string, compose = PLAIN_COMPOSE, env: string | null = null): Promise<string> {
        const dir = path.join(tmpRoot, directoryName);
        await fs.mkdir(dir, {recursive: true});
        await fs.writeFile(path.join(dir, "docker-compose.yml"), compose, "utf-8");
        if (env !== null) {
            await fs.writeFile(path.join(dir, ".env"), env, "utf-8");
        }
        return path.join(dir, "docker-compose.yml");
    }

    function buildService(): MigrationService {
        const rewriter = {rewrite: vi.fn().mockReturnValue({rewrittenCompose: PLAIN_COMPOSE, extractedEnv: ""})};
        return new MigrationService({
            docker: mockDocker as unknown as DockerExecutorPort,
            migrator: mockMigrator as unknown as VolumeMigratorPort,
            rewriter: rewriter as unknown as ComposeRewriterPort,
            stackFs: mockStackFs as unknown as StackFilesystemPort,
            stackRepo: mockStackRepo as unknown as StackRepository,
            oldStack: mockOldStack as unknown as ExternalStackControlPort,
            projects: createMockProjects(mockOldStack) as unknown as ComposeProjectResolverPort,
            selfStack: createMockSelfStack() as unknown as SelfStackPort,
            ownMounts: createMockOwnMounts() as unknown as OwnMountsPort,
            directories: hostViewDirectories(),
            diskSpace: createMockDiskSpace() as unknown as DiskSpaceProbePort,
        });
    }

    function request(composePath: string, displayName: string, stopOldStack: boolean) {
        return {
            composePath,
            displayName,
            volumeSelections: [],
            namedVolumeSelections: new Map<string, boolean>(),
            backup: false,
            stopOldStack,
        };
    }

    function expectNoSideEffects(): void {
        expect(mockOldStack.stop).not.toHaveBeenCalled();
        expect(mockStackFs.createDirectoryExclusive).not.toHaveBeenCalled();
        expect(mockMigrator.copyDirectory).not.toHaveBeenCalled();
        expect(mockStackRepo.create).not.toHaveBeenCalled();
    }

    describe("the old directory name equals the new stack id", () => {
        let composePath: string;

        beforeEach(async () => {
            composePath = await oldStack("memos");
        });

        it("refuses migrate with the old stack left running and names the project name and the way out", async () => {
            const refusal = buildService().migrate(request(composePath, "Memos", false));

            await expect(refusal).rejects.toBeInstanceOf(BadRequestError);
            await expect(refusal).rejects.toThrow('"memos"');
            await expect(refusal).rejects.toThrow("Stop the old stack");
            expectNoSideEffects();
        });

        it("refuses preflight the same way", async () => {
            const refusal = buildService().preflight(request(composePath, "Memos", false));

            await expect(refusal).rejects.toBeInstanceOf(BadRequestError);
            await expect(refusal).rejects.toThrow("Docker Compose project name");
            expectNoSideEffects();
        });

        it("proceeds when the old stack is stopped", async () => {
            const result = await buildService().migrate(request(composePath, "Memos", true));

            expect(result.success).toBe(true);
            expect(mockOldStack.stop).toHaveBeenCalledTimes(1);
        });

        it("reports the shared name in the preview", async () => {
            const preview = await buildService().previewMigration(request(composePath, "Memos", false));

            expect(preview.target.sharedProjectName).toEqual({name: "memos", source: "directory"});
        });
    });

    describe("a name the old stack's files set", () => {
        it("refuses COMPOSE_PROJECT_NAME in the old .env and names it", async () => {
            const composePath = await oldStack("old", PLAIN_COMPOSE, "COMPOSE_PROJECT_NAME=bar\n");

            const refusal = buildService().migrate(request(composePath, "Foo", false));

            await expect(refusal).rejects.toBeInstanceOf(BadRequestError);
            await expect(refusal).rejects.toThrow('"bar"');
            await expect(refusal).rejects.toThrow("COMPOSE_PROJECT_NAME");
            expectNoSideEffects();
        });

        it("refuses a top-level name: in the compose file and names it", async () => {
            const composePath = await oldStack("old", `name: shop\n${PLAIN_COMPOSE}`);

            const refusal = buildService().migrate(request(composePath, "Foo", false));

            await expect(refusal).rejects.toBeInstanceOf(BadRequestError);
            await expect(refusal).rejects.toThrow('"shop"');
            await expect(refusal).rejects.toThrow("name:");
            expectNoSideEffects();
        });

        it("reports the source of the shared name in the preview", async () => {
            const envPath = await oldStack("old-env", PLAIN_COMPOSE, "COMPOSE_PROJECT_NAME=bar\n");
            const filePath = await oldStack("old-file", `name: shop\n${PLAIN_COMPOSE}`);

            const fromEnv = await buildService().previewMigration(request(envPath, "Foo", false));
            const fromFile = await buildService().previewMigration(request(filePath, "Foo", false));

            expect(fromEnv.target.sharedProjectName).toEqual({name: "bar", source: "env-file"});
            expect(fromFile.target.sharedProjectName).toEqual({name: "shop", source: "compose-file"});
        });

        it.each([
            ["COMPOSE_PROJECT_NAME", PLAIN_COMPOSE, "COMPOSE_PROJECT_NAME=bar\n"],
            ["name:", `name: shop\n${PLAIN_COMPOSE}`, null],
        ])("proceeds with the old stack stopped (%s)", async (_label, compose, env) => {
            const composePath = await oldStack("old", compose, env);

            const result = await buildService().migrate(request(composePath, "Foo", true));

            expect(result.success).toBe(true);
        });
    });

    describe("an old stack started under another name than its files suggest (-p)", () => {
        function startedAs(project: string): ReturnType<typeof createMockProjects> {
            const projects = createMockProjects(mockOldStack);
            projects.resolve.mockResolvedValue({kind: "resolved", project: {name: project, source: "containers", containers: []}});
            return projects;
        }

        function serviceWith(projects: ReturnType<typeof createMockProjects>): MigrationService {
            const rewriter = {rewrite: vi.fn().mockReturnValue({rewrittenCompose: PLAIN_COMPOSE, extractedEnv: ""})};
            return new MigrationService({
                docker: mockDocker as unknown as DockerExecutorPort,
                migrator: mockMigrator as unknown as VolumeMigratorPort,
                rewriter: rewriter as unknown as ComposeRewriterPort,
                stackFs: mockStackFs as unknown as StackFilesystemPort,
                stackRepo: mockStackRepo as unknown as StackRepository,
                oldStack: mockOldStack as unknown as ExternalStackControlPort,
                projects: projects as unknown as ComposeProjectResolverPort,
                selfStack: createMockSelfStack() as unknown as SelfStackPort,
                ownMounts: createMockOwnMounts() as unknown as OwnMountsPort,
                directories: hostViewDirectories(),
                diskSpace: createMockDiskSpace() as unknown as DiskSpaceProbePort,
            });
        }

        it("refuses leaving it running when the new stack id equals the real project name, saying the new stack takes it from its directory", async () => {
            const composePath = await oldStack("old");

            const refusal = serviceWith(startedAs("foo")).migrate(request(composePath, "Foo", false));

            await expect(refusal).rejects.toBeInstanceOf(BadRequestError);
            await expect(refusal).rejects.toThrow('"foo"');
            await expect(refusal).rejects.toThrow("the new stack takes it from its directory name");
            expectNoSideEffects();
        });

        it("reports the shared name in the preview with the new stack's name source", async () => {
            const composePath = await oldStack("old");

            const preview = await serviceWith(startedAs("foo")).previewMigration(request(composePath, "Foo", false));

            expect(preview.target.sharedProjectName).toEqual({name: "foo", source: "directory"});
        });

        it("does not refuse when only the files' name equals the new stack id but the real project differs", async () => {
            const composePath = await oldStack("memos");

            const result = await serviceWith(startedAs("other")).migrate(request(composePath, "Memos", false));

            expect(result.success).toBe(true);
        });
    });

    it("does not report or refuse a different stack name", async () => {
        const composePath = await oldStack("memos");

        const preview = await buildService().previewMigration(request(composePath, "Memos New", false));
        const result = await buildService().migrate(request(composePath, "Memos New", false));

        expect(preview.target.sharedProjectName).toBeNull();
        expect(result.success).toBe(true);
    });

    it("never reports a shared name for an in-place migration", async () => {
        const composePath = await oldStack(path.join("stacks", "memos"));

        const preview = await buildService().previewMigration(request(composePath, "Memos", false));

        expect(preview.target.inPlace).toBe(true);
        expect(preview.target.sharedProjectName).toBeNull();
    });
});

describe("MigrationService compose file check and dependencies (#108, T-22-03)", () => {
    const displayName = "Hardening Fixture";

    let tmpRoot: string;
    let mockStackFs: ReturnType<typeof createMockStackFs>;
    let mockStackRepo: ReturnType<typeof createMockStackRepo>;

    beforeEach(async () => {
        tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "docktor-compose-check-"));
        mockStackFs = createMockStackFs(path.join(tmpRoot, "stacks"));
        mockStackRepo = createMockStackRepo();
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await fs.rm(tmpRoot, {recursive: true, force: true});
    });

    /** Only the ports assessTarget touches; every other dependency falls back to its production singleton. */
    function buildService(): MigrationService {
        return new MigrationService({
            rewriter: createMockRewriter() as unknown as ComposeRewriterPort,
            stackFs: mockStackFs as unknown as StackFilesystemPort,
            stackRepo: mockStackRepo as unknown as StackRepository,
            projects: createMockProjects() as unknown as ComposeProjectResolverPort,
            selfStack: createMockSelfStack() as unknown as SelfStackPort,
            ownMounts: createMockOwnMounts() as unknown as OwnMountsPort,
            directories: hostViewDirectories(),
            diskSpace: createMockDiskSpace() as unknown as DiskSpaceProbePort,
        });
    }

    function request(composePath: string) {
        return {
            composePath,
            displayName,
            volumeSelections: [],
            namedVolumeSelections: new Map<string, boolean>(),
            backup: false,
            stopOldStack: false,
            acknowledgeAnonymousVolumes: false,
        };
    }

    it("uses the given fakes and falls back to the production singletons for omitted dependencies", async () => {
        const dir = path.join(tmpRoot, "app");
        await fs.mkdir(dir, {recursive: true});
        const composePath = path.join(dir, "docker-compose.yml");
        await fs.writeFile(composePath, COMPOSE, "utf-8");

        const preview = await buildService().previewMigration(request(composePath));

        expect(mockStackRepo.exists).toHaveBeenCalledWith(slugify(displayName));
        expect(preview.target.stackId).toBe(slugify(displayName));
    });

    it("refuses a missing compose file with a BadRequestError that keeps the ENOENT error as cause", async () => {
        const composePath = path.join(tmpRoot, "gone", "docker-compose.yml");

        const error = await buildService().previewMigration(request(composePath)).catch((err: unknown) => err);

        expect(error).toBeInstanceOf(BadRequestError);
        expect(error).toHaveProperty("message", expect.stringContaining(composePath));
        expect(error).toHaveProperty("cause.code", "ENOENT");
    });

    describe.skipIf(process.platform === "win32")("a compose.yml that is a symlink", () => {
        let composePath: string;
        let realTarget: string;

        beforeEach(async () => {
            const dir = path.join(tmpRoot, "linked");
            await fs.mkdir(dir, {recursive: true});
            realTarget = path.join(dir, "passwd");
            await fs.writeFile(realTarget, "root:x:0:0:root:/root:/bin/sh\n", "utf-8");
            composePath = path.join(dir, "compose.yml");
            await fs.symlink(realTarget, composePath);
        });

        it("is refused by the preview before its content is read, naming the real path", async () => {
            const readFile = vi.spyOn(fs, "readFile");

            const error = await buildService().previewMigration(request(composePath)).catch((err: unknown) => err);

            expect(error).toBeInstanceOf(BadRequestError);
            expect(error).toHaveProperty("message", expect.stringContaining(await fs.realpath(realTarget)));
            expect(readFile).not.toHaveBeenCalled();
        });

        it("is refused by preflight with the same error", async () => {
            const error = await buildService()
                .preflight(request(composePath))
                .catch((err: unknown) => err);

            expect(error).toBeInstanceOf(BadRequestError);
            expect(error).toHaveProperty("message", expect.stringContaining(await fs.realpath(realTarget)));
        });

        it("is accepted when the link points at a compose file", async () => {
            const realCompose = path.join(tmpRoot, "linked", "docker-compose.yaml");
            await fs.writeFile(realCompose, COMPOSE, "utf-8");
            await fs.rm(composePath);
            await fs.symlink(realCompose, composePath);

            const preview = await buildService().previewMigration(request(composePath));

            expect(preview.target.stackId).toBe(slugify(displayName));
        });
    });
});
