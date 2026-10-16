import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {MigrationOperationService} from "../../../src/application/migration-operation-service.js";
import type {MigrationInput, MigrationPlan, MigrationResult} from "../../../src/application/migration-service.js";
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
    };
}

function planFor(input: MigrationInput): MigrationPlan {
    return {
        stackId: input.displayName.toLowerCase().replaceAll(" ", "-"),
        displayName: input.displayName,
        composePath: input.composePath,
        originalDir: "/opt/old",
        targetDir: "/data/stacks/new",
        volumeSelections: [],
        namedVolumeSelections: new Map(),
        backup: input.backup,
        stopOldStack: input.stopOldStack,
        inPlace: null,
    };
}

const SUCCESS: MigrationResult = {success: true, stackId: "my-app", originalPath: "/opt/old"};

describe("MigrationOperationService", () => {
    let preflight: ReturnType<typeof vi.fn<(input: MigrationInput) => Promise<MigrationPlan>>>;
    let execute: ReturnType<typeof vi.fn<(plan: MigrationPlan) => Promise<MigrationResult>>>;
    let clock: Date;
    let counter: number;
    let service: MigrationOperationService;

    beforeEach(() => {
        clock = new Date("2026-01-01T10:00:00.000Z");
        counter = 0;
        preflight = vi.fn(async (input: MigrationInput) => planFor(input));
        execute = vi.fn(async () => SUCCESS);
        service = new MigrationOperationService(
            {preflight, execute},
            () => `op-${++counter}`,
            () => clock,
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

        it("propagates a preflight refusal, stores nothing and releases the slot", async () => {
            preflight.mockRejectedValueOnce(new BadRequestError("nested target"));

            await expect(service.start(inputFor("My App"))).rejects.toBeInstanceOf(BadRequestError);
            expect(service.list()).toEqual([]);

            await expect(service.start(inputFor("My App"))).resolves.toMatchObject({status: "running"});
            expect(preflight).toHaveBeenCalledTimes(2);
            await settle("op-1");
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
