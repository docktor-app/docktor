import {beforeEach, describe, expect, it, vi} from "vitest";
import type {MigrationLedgerEntry} from "@docktor/shared";
import {
    MigrationRollbackRunner,
    type MigrationRollbackRunnerDependencies,
} from "../../../src/application/migration-rollback-runner.js";
import type {ProjectContainer} from "../../../src/domain/compose-project.js";
import {RESTART_VERIFY_INTERVAL_MS, RESTART_VERIFY_TIMEOUT_MS} from "../../../src/domain/migration-rollback.js";

const COMPOSE_PATH = "/opt/memos/docker-compose.yml";
const ORIGINAL_DIR = "/opt/memos";
const ASIDE_DIR = "/opt/memos-pre-migration";

const stopped = (runningBefore: string[], sharesProjectWithNewStack = false): MigrationLedgerEntry => ({
    kind: "stopped_old_stack",
    project: "memos",
    composePath: COMPOSE_PATH,
    runningBefore,
    sharesProjectWithNewStack,
});
const movedAside: MigrationLedgerEntry = {kind: "moved_aside", originalDir: ORIGINAL_DIR, asideDir: ASIDE_DIR};
const createdDirectory: MigrationLedgerEntry = {kind: "created_directory", stackId: "memos-new"};
const createdRecord: MigrationLedgerEntry = {kind: "created_record", stackId: "memos-new"};

function container(service: string, running: boolean): ProjectContainer {
    return {id: `${service}-1`, name: `memos-${service}-1`, service, running, mounts: []};
}

describe("MigrationRollbackRunner", () => {
    let calls: string[];
    let clock: number;
    let deps: {
        [K in keyof MigrationRollbackRunnerDependencies]: MigrationRollbackRunnerDependencies[K];
    };
    let listContainers: ReturnType<typeof vi.fn<(project: string, composePath: string) => Promise<readonly ProjectContainer[]>>>;
    let start: ReturnType<typeof vi.fn<(target: unknown, services: readonly string[]) => Promise<void>>>;
    let pathTaken: ReturnType<typeof vi.fn<(target: string) => Promise<boolean>>>;
    let logger: {info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>};

    beforeEach(() => {
        calls = [];
        clock = 0;
        listContainers = vi.fn(async () => [container("db", true), container("web", true)]);
        start = vi.fn(async (_target, services) => {
            calls.push(`start:${services.join(",")}`);
        });
        pathTaken = vi.fn(async () => false);
        logger = {info: vi.fn(), warn: vi.fn(), error: vi.fn()};
        deps = {
            stackRepo: {
                delete: vi.fn(async (id: string) => {
                    calls.push(`deleteRecord:${id}`);
                }),
            },
            stackFs: {
                removeDirectory: vi.fn(async (id: string) => {
                    calls.push(`removeDirectory:${id}`);
                }),
            },
            migrator: {
                moveDirectory: vi.fn(async (source: string, destination: string) => {
                    calls.push(`move:${source}->${destination}`);
                }),
            },
            oldStack: {start},
            projects: {listContainers},
            pathTaken,
            logger,
            sleep: vi.fn(async (ms: number) => {
                clock += ms;
            }),
            now: () => clock,
        };
    });

    function runner(): MigrationRollbackRunner {
        return new MigrationRollbackRunner(deps);
    }

    it("undoes the record, the directory and the stop in reverse and verifies the restart", async () => {
        const progress = vi.fn();

        const outcome = await runner().run([stopped(["db", "web"]), createdDirectory, createdRecord], {onProgress: progress});

        expect(calls).toEqual(["deleteRecord:memos-new", "removeDirectory:memos-new", "start:db,web"]);
        expect(start).toHaveBeenCalledWith({composePath: COMPOSE_PATH, project: "memos"}, ["db", "web"]);
        expect(listContainers).toHaveBeenCalledWith("memos", COMPOSE_PATH);
        expect(progress).toHaveBeenCalledWith({step: "restarting_old_stack", detail: null});
        expect(outcome).toEqual({report: {oldStack: "restored-running", original: "untouched", cleanupErrors: []}});
    });

    it("waits until the services are seen running instead of trusting the start command", async () => {
        listContainers
            .mockResolvedValueOnce([container("db", false), container("web", false)])
            .mockResolvedValueOnce([container("db", true), container("web", false)])
            .mockResolvedValue([container("db", true), container("web", true)]);

        const outcome = await runner().run([stopped(["db", "web"])]);

        expect(listContainers).toHaveBeenCalledTimes(3);
        expect(deps.sleep).toHaveBeenCalledTimes(2);
        expect(deps.sleep).toHaveBeenCalledWith(RESTART_VERIFY_INTERVAL_MS);
        expect(outcome.report.oldStack).toBe("restored-running");
    });

    it("keeps polling through a failing container listing", async () => {
        listContainers.mockRejectedValueOnce(new Error("docker busy")).mockResolvedValue([container("web", true)]);

        const outcome = await runner().run([stopped(["web"])]);

        expect(outcome.report.oldStack).toBe("restored-running");
        expect(logger.warn).toHaveBeenCalled();
    });

    it("reports restart-unverified when the services are not seen running within the timeout", async () => {
        listContainers.mockResolvedValue([container("db", true), container("web", false)]);

        const outcome = await runner().run([stopped(["db", "web"])]);

        expect(outcome.report).toEqual({oldStack: "restart-unverified", original: "untouched", cleanupErrors: []});
        expect(outcome.restartError).toBeUndefined();
        expect(clock).toBeGreaterThanOrEqual(RESTART_VERIFY_TIMEOUT_MS);
    });

    it("reports restart-failed with the error when the start command rejects, and does not poll", async () => {
        start.mockRejectedValue(new Error("daemon unreachable"));

        const outcome = await runner().run([stopped(["web"])]);

        expect(outcome.report.oldStack).toBe("restart-failed");
        expect(outcome.restartError).toBe("daemon unreachable");
        expect(listContainers).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalled();
    });

    it("reports not-stopped and starts nothing when nothing was running before the stop", async () => {
        const outcome = await runner().run([stopped([])]);

        expect(outcome.report.oldStack).toBe("not-stopped");
        expect(start).not.toHaveBeenCalled();
    });

    it("reports not-stopped when the old stack was never stopped", async () => {
        const outcome = await runner().run([createdDirectory, createdRecord]);

        expect(outcome.report).toEqual({oldStack: "not-stopped", original: "untouched", cleanupErrors: []});
        expect(start).not.toHaveBeenCalled();
    });

    it("moves the aside directory back into a free original path before restarting", async () => {
        const outcome = await runner().run([stopped(["web"]), movedAside, createdDirectory]);

        expect(calls).toEqual(["removeDirectory:memos-new", `move:${ASIDE_DIR}->${ORIGINAL_DIR}`, "start:web"]);
        expect(pathTaken).toHaveBeenCalledWith(ORIGINAL_DIR);
        expect(outcome.report).toEqual({oldStack: "restored-running", original: "restored", cleanupErrors: []});
    });

    it("leaves the original aside, moves nothing and does not start the stack when the original path is taken", async () => {
        pathTaken.mockResolvedValue(true);

        const outcome = await runner().run([stopped(["web"]), movedAside, createdDirectory]);

        expect(deps.migrator.moveDirectory).not.toHaveBeenCalled();
        expect(start).not.toHaveBeenCalled();
        expect(outcome.report).toEqual({
            oldStack: "left-stopped",
            original: "left-aside",
            keptOriginalAt: ASIDE_DIR,
            cleanupErrors: [],
        });
    });

    it("leaves the original aside and records the error when moving it back fails", async () => {
        vi.mocked(deps.migrator.moveDirectory).mockRejectedValue(new Error("EBUSY: resource busy"));

        const outcome = await runner().run([stopped(["web"]), movedAside]);

        expect(start).not.toHaveBeenCalled();
        expect(outcome.report.original).toBe("left-aside");
        expect(outcome.report.keptOriginalAt).toBe(ASIDE_DIR);
        expect(outcome.report.oldStack).toBe("left-stopped");
        expect(outcome.report.cleanupErrors).toEqual([expect.stringContaining("EBUSY")]);
        expect(logger.error).toHaveBeenCalled();
    });

    it("logs and lists a failing record delete and directory removal while the remaining steps still run", async () => {
        vi.mocked(deps.stackRepo.delete).mockRejectedValue(new Error("database locked"));
        vi.mocked(deps.stackFs.removeDirectory).mockRejectedValue(new Error("EBUSY: directory busy"));

        const outcome = await runner().run([stopped(["web"]), createdDirectory, createdRecord]);

        expect(outcome.report.cleanupErrors).toEqual([
            expect.stringContaining("database locked"),
            expect.stringContaining("EBUSY: directory busy"),
        ]);
        expect(logger.error).toHaveBeenCalledTimes(2);
        expect(start).toHaveBeenCalledWith(expect.anything(), ["web"]);
        expect(outcome.report.oldStack).toBe("restored-running");
    });

    it("is not affected by a progress listener that throws", async () => {
        const progress = vi.fn(() => {
            throw new Error("listener exploded");
        });

        const outcome = await runner().run([stopped(["web"])], {onProgress: progress});

        expect(outcome.report.oldStack).toBe("restored-running");
        expect(logger.error).toHaveBeenCalled();
    });

    it("does not mutate the entries it is given", async () => {
        const entries = [stopped(["web"]), createdDirectory];

        await runner().run(entries);

        expect(entries).toEqual([stopped(["web"]), createdDirectory]);
    });
});
