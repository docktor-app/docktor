import {describe, expect, it} from "vitest";
import type {MigrationOperation} from "@docktor/shared";
import {
    finishMigrationOperation,
    pruneFinishedOperations,
    recordMigrationStep,
    startMigrationOperation,
} from "../../../src/domain/migration-operation.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const T0 = new Date("2026-01-01T10:00:00.000Z");

function at(minutes: number): Date {
    return new Date(T0.getTime() + minutes * MINUTE);
}

function running(id: string, startedMinute: number): MigrationOperation {
    return startMigrationOperation({
        id,
        stackId: id,
        displayName: id,
        composePath: `/opt/${id}/docker-compose.yml`,
        backup: true,
        stopOldStack: false,
        startedAt: at(startedMinute),
    });
}

function finished(id: string, startedMinute: number, finishedMinute: number, success = true): MigrationOperation {
    return finishMigrationOperation(
        running(id, startedMinute),
        success ? {success: true, stackId: id, originalPath: "/opt/old"} : {success: false, error: "boom", originalPath: "/opt/old"},
        at(finishedMinute),
    );
}

describe("startMigrationOperation", () => {
    it("starts running at the first step with no result", () => {
        const operation = running("a", 0);

        expect(operation).toMatchObject({
            id: "a",
            status: "running",
            step: "starting",
            stepDetail: null,
            finishedAt: null,
            result: null,
            startedAt: "2026-01-01T10:00:00.000Z",
        });
    });
});

describe("recordMigrationStep", () => {
    it("sets the step and its detail on a running operation without mutating the input", () => {
        const operation = running("a", 0);

        const next = recordMigrationStep(operation, "copying_named_volume", "pgdata");

        expect(next).toEqual({...operation, step: "copying_named_volume", stepDetail: "pgdata"});
        expect(operation.step).toBe("starting");
    });

    it("clears a previous detail when the next step has none", () => {
        const withDetail = recordMigrationStep(running("a", 0), "copying_bind_mount", "./data");

        expect(recordMigrationStep(withDetail, "deploying", null).stepDetail).toBeNull();
    });

    it("returns a finished operation unchanged", () => {
        const done = finished("a", 0, 3);

        expect(recordMigrationStep(done, "rolling_back", null)).toBe(done);
    });
});

describe("finishMigrationOperation", () => {
    it("ends as succeeded at the finished step when the migration succeeded", () => {
        const operation = finished("a", 0, 3);

        expect(operation.status).toBe("succeeded");
        expect(operation.step).toBe("finished");
        expect(operation.finishedAt).toBe("2026-01-01T10:03:00.000Z");
        expect(operation.result).toEqual({success: true, stackId: "a", originalPath: "/opt/old"});
    });

    it("ends as failed when the migration failed", () => {
        expect(finished("a", 0, 3, false).status).toBe("failed");
    });

    it("does not mutate the running operation", () => {
        const original = running("a", 0);

        finishMigrationOperation(original, {success: true, originalPath: "/opt/old"}, at(1));

        expect(original.status).toBe("running");
    });
});

describe("pruneFinishedOperations", () => {
    it("drops finished operations older than the maximum age and keeps younger ones", () => {
        const old = finished("old", 0, 1);
        const fresh = finished("fresh", 70, 80);

        const kept = pruneFinishedOperations([old, fresh], at(90), HOUR, 50);

        expect(kept.map((o) => o.id)).toEqual(["fresh"]);
    });

    it("never drops a running operation, however old", () => {
        const kept = pruneFinishedOperations([running("slow", 0)], at(600), HOUR, 50);

        expect(kept.map((o) => o.id)).toEqual(["slow"]);
    });

    it("keeps at most maxFinished finished operations, the newest ones", () => {
        const operations = [finished("a", 1, 2), finished("b", 3, 4), finished("c", 5, 6)];

        const kept = pruneFinishedOperations(operations, at(10), HOUR, 2);

        expect(kept.map((o) => o.id)).toEqual(["c", "b"]);
    });

    it("does not count running operations against the finished cap", () => {
        const operations = [running("r1", 1), running("r2", 2), finished("f1", 3, 4)];

        const kept = pruneFinishedOperations(operations, at(10), HOUR, 1);

        expect(kept.map((o) => o.id)).toEqual(["f1", "r2", "r1"]);
    });

    it("returns operations newest first by start time", () => {
        const operations = [running("a", 1), finished("b", 5, 6), running("c", 3)];

        const kept = pruneFinishedOperations(operations, at(10), HOUR, 50);

        expect(kept.map((o) => o.id)).toEqual(["b", "c", "a"]);
    });
});
