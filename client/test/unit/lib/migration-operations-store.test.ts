import {beforeEach, describe, expect, it, vi} from "vitest";
import type {MigrationOperation} from "@docktor/shared";
import {
    lostMigrationMessage,
    MigrationOperationsStore,
    type FollowedChange,
} from "@/lib/migration-operations-store";

function makeOperation(overrides: Partial<MigrationOperation> = {}): MigrationOperation {
    return {
        id: "op-1",
        stackId: "db",
        displayName: "db",
        composePath: "/host/opt/db/docker-compose.yml",
        backup: false,
        stopOldStack: true,
        status: "running",
        step: "starting",
        stepDetail: null,
        startedAt: "2026-10-16T10:00:00.000Z",
        finishedAt: null,
        result: null,
        ...overrides,
    };
}

function succeeded(overrides: Partial<MigrationOperation> = {}): MigrationOperation {
    return makeOperation({
        status: "succeeded",
        step: "finished",
        finishedAt: "2026-10-16T10:01:00.000Z",
        result: {success: true, stackId: "db", originalPath: "/host/opt/db"},
        ...overrides,
    });
}

describe("MigrationOperationsStore", () => {
    let store: MigrationOperationsStore;
    let changes: FollowedChange[];

    beforeEach(() => {
        store = new MigrationOperationsStore();
        changes = [];
        store.onFollowedChange((change) => changes.push(change));
    });

    describe("following", () => {
        it("follows a tracked operation and reports it", () => {
            const operation = makeOperation();

            store.track(operation);

            expect(changes).toEqual([{kind: "updated", operation}]);
            expect(store.getSnapshot()).toEqual([operation]);
        });

        it("follows a running operation it only received", () => {
            const operation = makeOperation();

            store.receive(operation);

            expect(changes).toEqual([{kind: "updated", operation}]);
        });

        it("stays silent about a finished operation it never followed", () => {
            store.receive(succeeded({id: "op-other"}));

            expect(changes).toEqual([]);
            expect(store.getSnapshot()).toHaveLength(1);
        });

        it("reports every later snapshot of a followed operation", () => {
            store.track(makeOperation());
            const copying = makeOperation({step: "copying_named_volume", stepDetail: "pgdata"});
            const done = succeeded();

            store.receive(copying);
            store.receive(done);

            expect(changes.map((change) => change.operation)).toEqual([makeOperation(), copying, done]);
        });
    });

    describe("stale snapshots", () => {
        it("ignores a late running snapshot of an operation that already finished", () => {
            store.receive(succeeded());
            store.track(makeOperation());
            store.receive(makeOperation({step: "deploying"}));

            expect(changes).toEqual([]);
            expect(store.getSnapshot()[0]?.status).toBe("succeeded");
        });

        it("does not move a running operation back to an earlier step", () => {
            store.receive(makeOperation({step: "deploying"}));
            changes.length = 0;

            store.track(makeOperation({step: "starting"}));

            expect(changes).toEqual([]);
            expect(store.getSnapshot()[0]?.step).toBe("deploying");
        });

        it("orders the verifying_stop step after stopping_old_stack and the restart request after rolling_back", () => {
            store.receive(makeOperation({step: "verifying_stop"}));
            store.receive(makeOperation({step: "stopping_old_stack"}));
            store.receive(makeOperation({step: "restarting_old_stack"}));
            store.receive(makeOperation({step: "rolling_back"}));

            expect(changes.map((change) => change.operation.step)).toEqual(["verifying_stop", "restarting_old_stack"]);
        });

        it("ignores an identical repeat", () => {
            store.receive(makeOperation());
            store.receive(makeOperation());

            expect(changes).toHaveLength(1);
        });
    });

    describe("reconcile", () => {
        it("moves a followed operation to the state the list reports", () => {
            store.track(makeOperation());

            store.reconcile([succeeded()]);

            expect(changes.at(-1)).toEqual({kind: "updated", operation: succeeded()});
        });

        it("reports a followed running operation the list no longer contains as lost, once", () => {
            const operation = makeOperation();
            store.track(operation);
            changes.length = 0;

            store.reconcile([]);
            store.reconcile([]);

            expect(changes).toEqual([{kind: "lost", operation}]);
        });

        it("drops a lost operation from the snapshot so its row is actionable again", () => {
            store.track(makeOperation());

            store.reconcile([]);

            expect(store.getSnapshot()).toEqual([]);
        });

        it("does not report a finished operation as lost", () => {
            store.track(makeOperation());
            store.receive(succeeded());
            changes.length = 0;

            store.reconcile([]);

            expect(changes).toEqual([]);
        });

        it("does not report an operation as lost when it started after the list was requested", () => {
            const before = store.runningIds();
            store.track(makeOperation({id: "op-new"}));
            changes.length = 0;

            store.reconcile([], before);

            expect(changes).toEqual([]);
            expect(store.getSnapshot()).toHaveLength(1);
        });

        it("keeps stale-snapshot protection when the list repeats what is stored", () => {
            store.track(makeOperation());
            changes.length = 0;

            store.reconcile([makeOperation()]);

            expect(changes).toEqual([]);
        });

        it("stays silent about finished operations of earlier sessions", () => {
            store.reconcile([succeeded({id: "old"})]);

            expect(changes).toEqual([]);
            expect(store.getSnapshot()).toHaveLength(1);
        });
    });

    describe("subscription", () => {
        it("returns the same snapshot reference until something changes", () => {
            store.track(makeOperation());
            const first = store.getSnapshot();

            expect(store.getSnapshot()).toBe(first);
            store.receive(makeOperation());
            expect(store.getSnapshot()).toBe(first);

            store.receive(makeOperation({step: "deploying"}));
            expect(store.getSnapshot()).not.toBe(first);
        });

        it("notifies subscribers on change and stops after unsubscribe", () => {
            const listener = vi.fn();
            const unsubscribe = store.subscribe(listener);

            store.track(makeOperation());
            expect(listener).toHaveBeenCalledTimes(1);

            unsubscribe();
            store.receive(makeOperation({step: "deploying"}));
            expect(listener).toHaveBeenCalledTimes(1);
        });

        it("stops reporting followed changes after unsubscribe", () => {
            const listener = vi.fn();
            const unsubscribe = store.onFollowedChange(listener);
            unsubscribe();

            store.track(makeOperation());

            expect(listener).not.toHaveBeenCalled();
        });

        it("reset forgets operations and what was followed", () => {
            store.track(makeOperation());

            store.reset();
            changes.length = 0;
            store.receive(succeeded());

            expect(changes).toEqual([]);
            expect(store.getSnapshot()).toHaveLength(1);
        });
    });
});

describe("lostMigrationMessage", () => {
    it("states an observation, never an outcome", () => {
        const message = lostMigrationMessage(makeOperation({displayName: "blog"}));

        expect(message).toBe(
            "Docktor no longer reports the migration of blog (it may have restarted). Check the stack list and the old stack before trying again.",
        );
    });
});
