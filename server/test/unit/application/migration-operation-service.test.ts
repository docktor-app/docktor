import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {MigrationOperationService} from "../../../src/application/migration-operation-service.js";
import type {
    MigrationExecuteOptions,
    MigrationInput,
    MigrationPlan,
    MigrationResult,
} from "../../../src/application/migration-service.js";
import type {MigrationOperation, MigrationRollbackReport} from "@docktor/shared";
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

    beforeEach(() => {
        clock = new Date("2026-01-01T10:00:00.000Z");
        counter = 0;
        preflight = vi.fn(async (input: MigrationInput) => planFor(input));
        execute = vi.fn(async () => SUCCESS);
        emit = vi.fn();
        service = new MigrationOperationService(
            {preflight, execute},
            () => `op-${++counter}`,
            () => clock,
            {emit},
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
});
