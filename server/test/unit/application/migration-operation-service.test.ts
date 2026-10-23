import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {MigrationOperationService} from "../../../src/application/migration-operation-service.js";
import type {
    MigrationExecuteOptions,
    MigrationInput,
    MigrationPlan,
    MigrationProgressListener,
    MigrationResult,
} from "../../../src/application/migration-service.js";
import type {
    MigrationJournalDocument,
    MigrationLedgerEntry,
    MigrationOperation,
    MigrationRollbackReport,
} from "@docktor/shared";
import type {MigrationRollbackOutcome} from "../../../src/application/migration-rollback-runner.js";
import type {MigrationJournalPort} from "../../../src/application/ports/migration-journal-port.js";
import {BadRequestError, ConflictError, NotFoundError} from "../../../src/lib/errors.js";

const HOUR = 60 * 60_000;

interface Deferred {
    promise: Promise<MigrationResult>;
    resolve: (result: MigrationResult) => void;
    reject: (error: unknown) => void;
}

function deferred(): Deferred {
    let resolve!: (result: MigrationResult) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<MigrationResult>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return {promise, resolve, reject};
}

function inputFor(displayName: string, composePath = `/opt/${displayName}/docker-compose.yml`): MigrationInput {
    return {
        composePath,
        displayName,
        volumeSelections: [],
        namedVolumeSelections: new Map(),
        backup: true,
        stopOldStack: false,
        acknowledgeAnonymousVolumes: false,
    };
}

function planFor(input: MigrationInput): MigrationPlan {
    return {
        stackId: input.displayName.toLowerCase().replaceAll(" ", "-"),
        displayName: input.displayName,
        composePath: input.composePath,
        originalDir: "/opt/old",
        targetDir: "/data/stacks/new",
        oldProject: {name: "old", source: "files", containers: []},
        volumeSelections: [],
        namedVolumeSelections: new Map(),
        backup: input.backup,
        stopOldStack: input.stopOldStack,
        bindCopies: [],
        homeSources: new Map(),
        volumes: new Map(),
        inPlace: null,
        sharesProjectWithNewStack: false,
    };
}

const RESTORED: MigrationRollbackReport = {oldStack: "restored-running", original: "untouched", cleanupErrors: []};

function journalDocument(id: string, overrides: Partial<MigrationOperation> = {}): MigrationJournalDocument {
    return {
        version: 1,
        operation: {
            id,
            stackId: "my-app",
            displayName: "My App",
            composePath: "/opt/app/docker-compose.yml",
            backup: true,
            stopOldStack: true,
            status: "running",
            step: "deploying",
            stepDetail: "web",
            startedAt: "2026-01-01T09:55:00.000Z",
            finishedAt: null,
            result: null,
            ...overrides,
        },
        originalDir: "/opt/app",
        ledger: [{kind: "created_directory", stackId: "my-app"}],
    };
}

const SUCCESS: MigrationResult = {success: true, stackId: "my-app", originalPath: "/opt/old"};

describe("MigrationOperationService", () => {
    let preflight: ReturnType<typeof vi.fn<(input: MigrationInput) => Promise<MigrationPlan>>>;
    let execute: ReturnType<
        typeof vi.fn<(plan: MigrationPlan, options?: MigrationExecuteOptions) => Promise<MigrationResult>>
    >;
    let clock: Date;
    let counter: number;
    let service: MigrationOperationService;
    let emit: ReturnType<typeof vi.fn<(event: "migration.progressed", payload: {operation: MigrationOperation}) => void>>;
    let journalWrite: ReturnType<typeof vi.fn<(document: MigrationJournalDocument) => Promise<void>>>;
    let journalRemove: ReturnType<typeof vi.fn<(operationId: string) => Promise<void>>>;
    let journal: MigrationJournalPort;
    let logger: {info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>};
    let rollbackInterrupted: ReturnType<
        typeof vi.fn<(entries: readonly MigrationLedgerEntry[], options: {onProgress?: MigrationProgressListener}) => Promise<MigrationRollbackOutcome>>
    >;

    beforeEach(() => {
        clock = new Date("2026-01-01T10:00:00.000Z");
        counter = 0;
        preflight = vi.fn(async (input: MigrationInput) => planFor(input));
        execute = vi.fn(async () => SUCCESS);
        rollbackInterrupted = vi.fn(async () => ({report: RESTORED}));
        emit = vi.fn();
        journalWrite = vi.fn(async () => undefined);
        journalRemove = vi.fn(async () => undefined);
        journal = {write: journalWrite, remove: journalRemove, list: vi.fn()};
        logger = {info: vi.fn(), error: vi.fn()};
        service = new MigrationOperationService(
            {preflight, execute, rollbackInterrupted},
            () => `op-${++counter}`,
            () => clock,
            {emit},
            journal,
            logger,
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    async function settle(id: string): Promise<void> {
        await vi.waitFor(() => expect(service.get(id).status).not.toBe("running"));
    }

    describe("start", () => {
        it("returns a running operation built from the plan and input", async () => {
            const pending = deferred();
            execute.mockReturnValue(pending.promise);

            const operation = await service.start(inputFor("My App"));

            expect(operation).toMatchObject({
                id: "op-1",
                stackId: "my-app",
                displayName: "My App",
                backup: true,
                stopOldStack: false,
                status: "running",
                result: null,
            });
            pending.resolve(SUCCESS);
            await settle("op-1");
        });

        it("ends the operation with the migration result mapped field by field", async () => {
            execute.mockResolvedValue({
                success: true,
                stackId: "my-app",
                originalPath: "/opt/old",
                keptOriginalAt: "/opt/old-pre-migration",
            });

            await service.start(inputFor("My App"));
            await settle("op-1");

            expect(service.get("op-1")).toMatchObject({
                status: "succeeded",
                step: "finished",
                result: {
                    success: true,
                    stackId: "my-app",
                    originalPath: "/opt/old",
                    keptOriginalAt: "/opt/old-pre-migration",
                },
            });
        });

        it("turns a rejection of execute into a failed operation and releases the slot", async () => {
            vi.spyOn(console, "error").mockImplementation(() => undefined);
            execute.mockRejectedValueOnce(new Error("disk gone"));

            await service.start(inputFor("My App"));
            await settle("op-1");

            expect(service.get("op-1")).toMatchObject({
                status: "failed",
                result: {success: false, error: "Migration failed: disk gone", originalPath: "/opt/old"},
            });
            await expect(service.start(inputFor("My App"))).resolves.toMatchObject({id: "op-2"});
            await settle("op-2");
        });

        it("stores and publishes a failure with URL credentials and secret pairs masked", async () => {
            execute.mockResolvedValue({
                success: false,
                error: "Migration failed: up failed: postgres://app:s3cret@db\n      DB_PASSWORD: hunter2",
                originalPath: "/opt/old",
            });

            await service.start(inputFor("My App"));
            await settle("op-1");

            const expected = "Migration failed: up failed: postgres://app:\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022@db\n      DB_PASSWORD: \u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
            expect(service.get("op-1").result?.error).toBe(expected);
            expect(emit.mock.calls.at(-1)?.[1].operation.result?.error).toBe(expected);
            expect(JSON.stringify(emit.mock.calls)).not.toMatch(/s3cret|hunter2/);
        });

        describe("the rollback report decides the final status (#100, D-07)", () => {
            const FAILED: MigrationResult = {success: false, error: "Migration failed: boom", originalPath: "/opt/old"};

            it("ends rolled_back when the original stack was seen running again", async () => {
                const rollback: MigrationRollbackReport = {oldStack: "restored-running", original: "untouched", cleanupErrors: []};
                execute.mockResolvedValue({...FAILED, rollback});

                await service.start(inputFor("My App"));
                await settle("op-1");

                expect(service.get("op-1")).toMatchObject({status: "rolled_back", step: "finished", result: {rollback}});
            });

            it("ends rolled_back when the old stack was never stopped and the directory untouched", async () => {
                execute.mockResolvedValue({...FAILED, rollback: {oldStack: "not-stopped", original: "untouched", cleanupErrors: []}});

                await service.start(inputFor("My App"));
                await settle("op-1");

                expect(service.get("op-1").status).toBe("rolled_back");
            });

            it.each([
                ["restart-unverified", "untouched"],
                ["restart-failed", "untouched"],
                ["left-stopped", "left-aside"],
            ] as const)("ends failed when the old stack is %s and the original %s", async (oldStack, original) => {
                execute.mockResolvedValue({...FAILED, rollback: {oldStack, original, cleanupErrors: []}});

                await service.start(inputFor("My App"));
                await settle("op-1");

                expect(service.get("op-1").status).toBe("failed");
            });

            it("ends failed when the result carries no rollback report", async () => {
                execute.mockResolvedValue(FAILED);

                await service.start(inputFor("My App"));
                await settle("op-1");

                expect(service.get("op-1").status).toBe("failed");
            });

            it("masks secrets in the cleanup errors it stores and publishes", async () => {
                execute.mockResolvedValue({
                    ...FAILED,
                    rollback: {
                        oldStack: "restored-running",
                        original: "untouched",
                        cleanupErrors: ["remove the stack record: postgres://app:s3cret@db unreachable"],
                    },
                });

                await service.start(inputFor("My App"));
                await settle("op-1");

                expect(service.get("op-1").result?.rollback?.cleanupErrors).toEqual([
                    "remove the stack record: postgres://app:\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022@db unreachable",
                ]);
                expect(JSON.stringify(emit.mock.calls)).not.toContain("s3cret");
            });
        });

        it("masks the message of an unexpected rejection the same way", async () => {
            vi.spyOn(console, "error").mockImplementation(() => undefined);
            execute.mockRejectedValueOnce(new Error("clone https://u:tok3n@git.example/x failed"));

            await service.start(inputFor("My App"));
            await settle("op-1");

            expect(service.get("op-1").result?.error).toBe(
                "Migration failed: clone https://u:\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022@git.example/x failed",
            );
        });

        it("propagates a preflight refusal, stores nothing and releases the slot", async () => {
            preflight.mockRejectedValueOnce(new BadRequestError("nested target"));

            await expect(service.start(inputFor("My App"))).rejects.toBeInstanceOf(BadRequestError);
            expect(service.list()).toEqual([]);

            await expect(service.start(inputFor("My App"))).resolves.toMatchObject({status: "running"});
            expect(preflight).toHaveBeenCalledTimes(2);
            await settle("op-1");
        });
    });

    describe("the migration journal (D-06)", () => {
        it("writes the journal before execute, hands the ledger to execute and removes the journal before the finished operation is saved", async () => {
            const order: string[] = [];
            journalWrite.mockImplementation(async () => void order.push("journal.write"));
            journalRemove.mockImplementation(async () => void order.push("journal.remove"));
            execute.mockImplementation(async () => {
                order.push("execute");
                return SUCCESS;
            });
            emit.mockImplementation((_event, payload) => void order.push(`save:${payload.operation.status}`));

            await service.start(inputFor("My App"));
            await settle("op-1");

            expect(order).toEqual(["save:running", "journal.write", "execute", "journal.remove", "save:succeeded"]);
        });

        it("journals the started operation with the original directory and an empty ledger", async () => {
            await service.start(inputFor("My App"));
            await settle("op-1");

            expect(journalWrite).toHaveBeenCalledWith({
                version: 1,
                operation: expect.objectContaining({id: "op-1", status: "running", step: "starting"}),
                originalDir: "/opt/old",
                ledger: [],
            });
        });

        it("passes a ledger to execute that persists every entry it records", async () => {
            execute.mockImplementation(async (_plan, options) => {
                await options?.ledger?.record({kind: "created_directory", stackId: "my-app"});
                return SUCCESS;
            });

            await service.start(inputFor("My App"));
            await settle("op-1");

            expect(journalWrite).toHaveBeenCalledTimes(2);
            expect(journalWrite.mock.calls[1]?.[0].ledger).toEqual([{kind: "created_directory", stackId: "my-app"}]);
        });

        it("removes the journal of a failed migration as well", async () => {
            execute.mockResolvedValue({success: false, error: "boom", originalPath: "/opt/old"});

            await service.start(inputFor("My App"));
            await settle("op-1");

            expect(journalRemove).toHaveBeenCalledWith("op-1");
        });

        it("removes the journal when execute rejects unexpectedly", async () => {
            vi.spyOn(console, "error").mockImplementation(() => undefined);
            execute.mockRejectedValueOnce(new Error("bug"));

            await service.start(inputFor("My App"));
            await settle("op-1");

            expect(journalRemove).toHaveBeenCalledWith("op-1");
        });

        it("finishes the operation failed without executing anything when the first journal write fails", async () => {
            journalWrite.mockRejectedValueOnce(new Error("read-only file system"));

            await service.start(inputFor("My App"));
            await settle("op-1");

            expect(execute).not.toHaveBeenCalled();
            expect(service.get("op-1")).toMatchObject({
                status: "failed",
                step: "finished",
                result: {
                    success: false,
                    error: "Migration not started: the migration journal could not be written: read-only file system",
                    originalPath: "/opt/old",
                },
            });
        });

        it("releases the slot after a journal write failure", async () => {
            journalWrite.mockRejectedValueOnce(new Error("read-only"));
            await service.start(inputFor("My App"));
            await settle("op-1");

            await expect(service.start(inputFor("My App"))).resolves.toMatchObject({id: "op-2"});
            await settle("op-2");
        });

        it("masks secrets in the journal write failure it stores", async () => {
            journalWrite.mockRejectedValueOnce(new Error("cannot write postgres://app:s3cret@db"));

            await service.start(inputFor("My App"));
            await settle("op-1");

            expect(service.get("op-1").result?.error).not.toContain("s3cret");
        });

        it("logs a failing journal removal and still saves the finished operation", async () => {
            journalRemove.mockRejectedValueOnce(new Error("busy"));

            await service.start(inputFor("My App"));
            await settle("op-1");

            expect(service.get("op-1").status).toBe("succeeded");
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("busy"));
        });
    });

    describe("progress events", () => {
        it("emits migration.progressed for the running operation before start returns, and again when it finishes", async () => {
            const pending = deferred();
            execute.mockReturnValue(pending.promise);

            const started = await service.start(inputFor("My App"));

            expect(emit).toHaveBeenCalledTimes(1);
            expect(emit).toHaveBeenLastCalledWith("migration.progressed", {operation: started});
            expect(started).toMatchObject({status: "running", step: "starting"});

            pending.resolve(SUCCESS);
            await settle("op-1");

            expect(emit).toHaveBeenCalledTimes(2);
            const finished = emit.mock.calls[1]?.[1].operation;
            expect(finished).toMatchObject({status: "succeeded", step: "finished"});
            expect(finished).toEqual(service.get("op-1"));
        });

        it("records and publishes each reported step, and get shows the latest step mid-run", async () => {
            const pending = deferred();
            const seenMidRun: Array<{step: string; stepDetail: string | null}> = [];
            execute.mockImplementation(async (_plan, options) => {
                const onProgress = options?.onProgress;
                onProgress?.({step: "copying_named_volume", detail: "pgdata"});
                const mid = service.get("op-1");
                seenMidRun.push({step: mid.step, stepDetail: mid.stepDetail});
                onProgress?.({step: "deploying", detail: null});
                return pending.promise;
            });

            await service.start(inputFor("My App"));
            await vi.waitFor(() => expect(emit).toHaveBeenCalledTimes(3));

            expect(seenMidRun).toEqual([{step: "copying_named_volume", stepDetail: "pgdata"}]);
            expect(service.get("op-1")).toMatchObject({status: "running", step: "deploying", stepDetail: null});

            pending.resolve(SUCCESS);
            await settle("op-1");

            const steps = emit.mock.calls.map((call) => call[1].operation.step);
            expect(steps).toEqual(["starting", "copying_named_volume", "deploying", "finished"]);
            expect(emit.mock.calls[1]?.[1].operation.stepDetail).toBe("pgdata");
        });

        it("emits a failed operation when the migration fails", async () => {
            execute.mockResolvedValue({success: false, error: "boom", originalPath: "/opt/old"});

            await service.start(inputFor("My App"));
            await settle("op-1");

            expect(emit).toHaveBeenLastCalledWith("migration.progressed", {
                operation: expect.objectContaining({status: "failed", step: "finished"}),
            });
        });

        it("emits nothing when preflight refuses the migration", async () => {
            preflight.mockRejectedValueOnce(new BadRequestError("nested target"));

            await expect(service.start(inputFor("My App"))).rejects.toBeInstanceOf(BadRequestError);

            expect(emit).not.toHaveBeenCalled();
        });
    });

    describe("in-flight guard", () => {
        it("refuses a second start of the same stack slug before preflight runs, and allows it after the run ended", async () => {
            const pending = deferred();
            execute.mockReturnValueOnce(pending.promise);

            const first = await service.start(inputFor("My App"));
            const second = service.start(inputFor("My App", "/elsewhere/docker-compose.yml"));

            await expect(second).rejects.toBeInstanceOf(ConflictError);
            await expect(second).rejects.toThrow(/my-app/);
            expect(preflight).toHaveBeenCalledTimes(1);

            pending.resolve(SUCCESS);
            await settle(first.id);
            await expect(service.start(inputFor("My App"))).resolves.toMatchObject({status: "running"});
            await settle("op-2");
        });

        it("refuses the same compose file under another name, also spelled with backslashes", async () => {
            const pending = deferred();
            execute.mockReturnValueOnce(pending.promise);
            await service.start(inputFor("My App", "C:/apps/web/docker-compose.yml"));

            await expect(
                service.start(inputFor("Other Name", "C:\\apps\\web\\docker-compose.yml")),
            ).rejects.toBeInstanceOf(ConflictError);

            pending.resolve(SUCCESS);
            await settle("op-1");
        });

        it("runs migrations with different slug and compose path concurrently", async () => {
            const a = deferred();
            const b = deferred();
            execute.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);

            await service.start(inputFor("App One"));
            await expect(service.start(inputFor("App Two"))).resolves.toMatchObject({status: "running"});

            a.resolve(SUCCESS);
            b.resolve(SUCCESS);
            await settle("op-1");
            await settle("op-2");
        });

        it("holds the slot atomically when two starts race", async () => {
            const pending = deferred();
            execute.mockReturnValue(pending.promise);

            const results = await Promise.allSettled([
                service.start(inputFor("My App")),
                service.start(inputFor("My App")),
            ]);

            expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
            pending.resolve(SUCCESS);
            await settle("op-1");
        });
    });

    describe("get", () => {
        it("throws NotFoundError for an unknown operation id", () => {
            expect(() => service.get("nope")).toThrow(NotFoundError);
        });
    });

    describe("list and retention", () => {
        it("lists running and finished operations newest first", async () => {
            await service.start(inputFor("First"));
            await settle("op-1");
            clock = new Date(clock.getTime() + 1000);
            const pending = deferred();
            execute.mockReturnValueOnce(pending.promise);
            await service.start(inputFor("Second"));

            expect(service.list().map((o) => o.id)).toEqual(["op-2", "op-1"]);
            pending.resolve(SUCCESS);
            await settle("op-2");
        });

        it("forgets a finished operation after one hour", async () => {
            await service.start(inputFor("My App"));
            await settle("op-1");

            clock = new Date(clock.getTime() + HOUR + 1000);

            expect(service.list()).toEqual([]);
            expect(() => service.get("op-1")).toThrow(NotFoundError);
        });

        it("keeps at most 50 finished operations", async () => {
            for (let i = 0; i < 52; i++) {
                clock = new Date(clock.getTime() + 1000);
                await service.start(inputFor(`App ${i}`));
                await settle(`op-${i + 1}`);
            }

            const listed = service.list();
            expect(listed).toHaveLength(50);
            expect(listed[0]?.id).toBe("op-52");
            expect(() => service.get("op-1")).toThrow(NotFoundError);
        });

        it("never prunes a running operation", async () => {
            const pending = deferred();
            execute.mockReturnValueOnce(pending.promise);
            await service.start(inputFor("Slow"));

            clock = new Date(clock.getTime() + 10 * HOUR);

            expect(service.get("op-1").status).toBe("running");
            pending.resolve(SUCCESS);
            await settle("op-1");
        });
    });

    describe("recoverInterrupted (D-06, D-07)", () => {
        const RESTART_ERROR = "Docktor restarted during the migration, so the migration was rolled back.";

        it("registers each document as running at step rolling_back under the same id and publishes it", () => {
            const recovery = service.recoverInterrupted([journalDocument("op-old")]);

            expect(recovery.count).toBe(1);
            expect(service.get("op-old")).toMatchObject({
                id: "op-old",
                status: "running",
                step: "rolling_back",
                stepDetail: null,
                startedAt: "2026-01-01T09:55:00.000Z",
                finishedAt: null,
                result: null,
            });
            expect(emit).toHaveBeenCalledWith("migration.progressed", {
                operation: expect.objectContaining({id: "op-old", step: "rolling_back"}),
            });
            expect(rollbackInterrupted).not.toHaveBeenCalled();
        });

        it("refuses a new start of the same stack or compose file until the recovery ended", async () => {
            const recovery = service.recoverInterrupted([journalDocument("op-old")]);

            await expect(service.start(inputFor("My App", "/elsewhere/docker-compose.yml"))).rejects.toBeInstanceOf(ConflictError);
            await expect(service.start(inputFor("Other", "/opt/app/docker-compose.yml"))).rejects.toBeInstanceOf(ConflictError);
            expect(preflight).not.toHaveBeenCalled();

            await recovery.run();

            await expect(service.start(inputFor("My App"))).resolves.toMatchObject({status: "running"});
            await settle("op-1");
        });

        it("rolls back with the journal's ledger and ends rolled_back with the verified report", async () => {
            const document = journalDocument("op-old");
            const recovery = service.recoverInterrupted([document]);

            await recovery.run();

            expect(rollbackInterrupted).toHaveBeenCalledWith(document.ledger, {onProgress: expect.any(Function)});
            expect(service.get("op-old")).toMatchObject({
                status: "rolled_back",
                step: "finished",
                result: {success: false, error: RESTART_ERROR, originalPath: "/opt/app", rollback: RESTORED},
            });
            expect(execute).not.toHaveBeenCalled();
        });

        it("ends failed, without claiming a rollback, when the rollback could not verify the old stack", async () => {
            const report: MigrationRollbackReport = {oldStack: "restart-unverified", original: "restored", cleanupErrors: []};
            rollbackInterrupted.mockResolvedValue({report});
            const recovery = service.recoverInterrupted([journalDocument("op-old")]);

            await recovery.run();

            const operation = service.get("op-old");
            expect(operation.status).toBe("failed");
            expect(operation.result?.rollback).toEqual(report);
            expect(operation.result?.error).not.toBe(RESTART_ERROR);
            expect(operation.result?.error).toContain("Docktor restarted during the migration");
        });

        it("names the restart error of the old stack in the failed result", async () => {
            rollbackInterrupted.mockResolvedValue({
                report: {oldStack: "restart-failed", original: "restored", cleanupErrors: []},
                restartError: "compose start failed",
            });

            await service.recoverInterrupted([journalDocument("op-old")]).run();

            expect(service.get("op-old").result?.error).toContain("compose start failed");
        });

        it("records the steps the rollback reports", async () => {
            const seen: string[] = [];
            rollbackInterrupted.mockImplementation(async (_entries, options) => {
                options.onProgress?.({step: "restarting_old_stack", detail: null});
                seen.push(service.get("op-old").step);
                return {report: RESTORED};
            });

            await service.recoverInterrupted([journalDocument("op-old")]).run();

            expect(seen).toEqual(["restarting_old_stack"]);
        });

        it("finishes failed with the reason when the rollback throws, and still removes the journal", async () => {
            rollbackInterrupted.mockRejectedValue(new Error("docker unreachable"));

            await service.recoverInterrupted([journalDocument("op-old")]).run();

            expect(service.get("op-old")).toMatchObject({
                status: "failed",
                step: "finished",
                result: {success: false, originalPath: "/opt/app"},
            });
            expect(service.get("op-old").result?.error).toContain("docker unreachable");
            expect(journalRemove).toHaveBeenCalledWith("op-old");
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("docker unreachable"));
        });

        it("removes the journal before the finished operation is published, and releases the keys", async () => {
            const order: string[] = [];
            journalRemove.mockImplementation(async () => void order.push("journal.remove"));
            emit.mockImplementation((_event, payload) => void order.push(`save:${payload.operation.status}`));

            await service.recoverInterrupted([journalDocument("op-old")]).run();

            expect(order).toEqual(["save:running", "journal.remove", "save:rolled_back"]);
            await expect(service.start(inputFor("My App"))).resolves.toMatchObject({status: "running"});
            await settle("op-1");
        });

        it("masks secrets in the error text and the cleanup errors it stores", async () => {
            rollbackInterrupted.mockResolvedValue({
                report: {
                    oldStack: "restored-running",
                    original: "untouched",
                    cleanupErrors: ["remove the stack record: postgres://app:s3cret@db unreachable"],
                },
            });
            rollbackInterrupted.mockRejectedValueOnce(new Error("clone https://u:tok3n@git.example/x failed"));

            await service.recoverInterrupted([journalDocument("op-a")]).run();
            await service.recoverInterrupted([journalDocument("op-b", {stackId: "b", displayName: "B", composePath: "/opt/b/c.yml"})]).run();

            expect(JSON.stringify(service.list())).not.toMatch(/s3cret|tok3n/);
        });

        it("recovers several documents one after the other and keeps going after a failure", async () => {
            const running: string[] = [];
            let active = 0;
            let overlapped = false;
            rollbackInterrupted.mockImplementation(async (entries) => {
                active += 1;
                overlapped ||= active > 1;
                running.push(String(entries.length));
                await Promise.resolve();
                active -= 1;
                if (entries.length === 1) {
                    throw new Error("first fails");
                }
                return {report: RESTORED};
            });
            const first = journalDocument("op-1x");
            const second = {...journalDocument("op-2x", {stackId: "b", displayName: "B", composePath: "/opt/b/c.yml"}), ledger: []};

            const recovery = service.recoverInterrupted([first, second]);
            await recovery.run();

            expect(recovery.count).toBe(2);
            expect(overlapped).toBe(false);
            expect(service.get("op-1x").status).toBe("failed");
            expect(service.get("op-2x").status).toBe("rolled_back");
        });

        it("never rejects from run, even when removing the journal fails", async () => {
            journalRemove.mockRejectedValue(new Error("busy"));

            await expect(service.recoverInterrupted([journalDocument("op-old")]).run()).resolves.toBeUndefined();

            expect(service.get("op-old").status).toBe("rolled_back");
            expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("busy"));
        });

        it("returns a no-op for no documents", async () => {
            const recovery = service.recoverInterrupted([]);

            expect(recovery.count).toBe(0);
            await expect(recovery.run()).resolves.toBeUndefined();
            expect(emit).not.toHaveBeenCalled();
        });
    });
});
