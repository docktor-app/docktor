import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {act, renderHook, waitFor} from "@testing-library/react";
import type {MigrationOperation} from "@docktor/shared";
import {useMigrationOperationFeed, useMigrationOperations} from "@/hooks/use-migration-operations";
import {useContainerEvents, type StateEvent} from "@/hooks/use-container-events";
import {migrationOperationsStore, type FollowedChange} from "@/lib/migration-operations-store";

vi.mock("@/hooks/use-container-events", () => ({
    useContainerEvents: vi.fn(),
}));

const mockedEvents = vi.mocked(useContainerEvents);

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

/** Delivers an SSE event to the handler the feed registered with useContainerEvents. */
function emit(event: StateEvent): void {
    const handler = mockedEvents.mock.lastCall?.[0];
    if (!handler) throw new Error("useContainerEvents was not called");
    act(() => handler(event));
}

function openStream(): void {
    const onOpen = mockedEvents.mock.lastCall?.[1]?.onOpen;
    if (!onOpen) throw new Error("no onOpen callback registered");
    act(() => onOpen());
}

describe("useMigrationOperationFeed", () => {
    let changes: FollowedChange[];
    let unsubscribe: () => void;

    beforeEach(() => {
        vi.clearAllMocks();
        migrationOperationsStore.reset();
        changes = [];
        unsubscribe = migrationOperationsStore.onFollowedChange((change) => changes.push(change));
    });

    afterEach(() => unsubscribe());

    it("does not list operations on mount, only when the stream opens", async () => {
        const listOperations = vi.fn().mockResolvedValue({operations: []});

        renderHook(() => useMigrationOperationFeed(listOperations));
        expect(listOperations).not.toHaveBeenCalled();

        openStream();

        await waitFor(() => expect(listOperations).toHaveBeenCalledTimes(1));
    });

    it("lists once per stream open", async () => {
        const listOperations = vi.fn().mockResolvedValue({operations: []});
        renderHook(() => useMigrationOperationFeed(listOperations));

        openStream();
        await waitFor(() => expect(listOperations).toHaveBeenCalledTimes(1));
        openStream();

        await waitFor(() => expect(listOperations).toHaveBeenCalledTimes(2));
    });

    it("follows the running operations the list reports", async () => {
        const running = makeOperation();
        const listOperations = vi.fn().mockResolvedValue({operations: [running, succeeded({id: "op-done"})]});
        renderHook(() => useMigrationOperationFeed(listOperations));

        openStream();

        await waitFor(() => expect(changes).toEqual([{kind: "updated", operation: running}]));
        expect(migrationOperationsStore.getSnapshot()).toHaveLength(2);
    });

    it("moves a followed operation that finished while the stream was closed", async () => {
        migrationOperationsStore.track(makeOperation());
        changes.length = 0;
        const listOperations = vi.fn().mockResolvedValue({operations: [succeeded()]});
        renderHook(() => useMigrationOperationFeed(listOperations));

        openStream();

        await waitFor(() => expect(changes).toEqual([{kind: "updated", operation: succeeded()}]));
    });

    it("ends a followed running operation the server no longer reports as lost", async () => {
        const operation = makeOperation();
        migrationOperationsStore.track(operation);
        changes.length = 0;
        const listOperations = vi.fn().mockResolvedValue({operations: []});
        renderHook(() => useMigrationOperationFeed(listOperations));

        openStream();

        await waitFor(() => expect(changes).toEqual([{kind: "lost", operation}]));
    });

    it("does not call an operation lost that started after the list was requested", async () => {
        let resolveList: (value: {operations: MigrationOperation[]}) => void = () => undefined;
        const listOperations = vi.fn().mockReturnValue(new Promise((resolve) => (resolveList = resolve)));
        renderHook(() => useMigrationOperationFeed(listOperations));
        openStream();

        act(() => migrationOperationsStore.track(makeOperation()));
        changes.length = 0;
        await act(async () => resolveList({operations: []}));

        expect(changes).toEqual([]);
    });

    it("feeds migration_progress events into the store", () => {
        renderHook(() => useMigrationOperationFeed(vi.fn().mockResolvedValue({operations: []})));
        const operation = makeOperation({step: "deploying"});

        emit({type: "migration_progress", operation});

        expect(changes).toEqual([{kind: "updated", operation}]);
    });

    it("ignores events of other types", () => {
        renderHook(() => useMigrationOperationFeed(vi.fn().mockResolvedValue({operations: []})));

        emit({type: "stack_status", stackId: "db", stackStatus: "running"});

        expect(migrationOperationsStore.getSnapshot()).toEqual([]);
    });

    it("does not throw when the list cannot be read", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const listOperations = vi.fn().mockRejectedValue(new Error("offline"));
        renderHook(() => useMigrationOperationFeed(listOperations));

        openStream();

        await waitFor(() => expect(warn).toHaveBeenCalled());
        expect(migrationOperationsStore.getSnapshot()).toEqual([]);
        warn.mockRestore();
    });
});

describe("useMigrationOperations", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        migrationOperationsStore.reset();
    });

    it("opens no event stream of its own", () => {
        renderHook(() => useMigrationOperations());

        expect(mockedEvents).not.toHaveBeenCalled();
    });

    it("stores a tracked operation and exposes it as running by compose path", () => {
        const {result} = renderHook(() => useMigrationOperations());
        const operation = makeOperation();

        act(() => result.current.track(operation));

        expect(result.current.operations).toEqual([operation]);
        expect(result.current.runningByComposePath.get(operation.composePath)).toEqual(operation);
    });

    it("reflects store updates made elsewhere and drops an operation from running when it finishes", () => {
        const {result} = renderHook(() => useMigrationOperations());
        act(() => result.current.track(makeOperation()));

        act(() => migrationOperationsStore.receive(makeOperation({step: "copying_named_volume", stepDetail: "pgdata"})));
        expect(result.current.runningByComposePath.get(makeOperation().composePath)?.step).toBe("copying_named_volume");

        act(() => migrationOperationsStore.receive(succeeded()));
        expect(result.current.runningByComposePath.size).toBe(0);
        expect(result.current.operations[0]?.status).toBe("succeeded");
    });

    it("keeps the same runningByComposePath map until the operations change", () => {
        const {result, rerender} = renderHook(() => useMigrationOperations());
        act(() => result.current.track(makeOperation()));
        const first = result.current.runningByComposePath;

        rerender();

        expect(result.current.runningByComposePath).toBe(first);
    });
});
