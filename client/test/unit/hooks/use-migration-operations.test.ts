import {beforeEach, describe, expect, it, vi} from "vitest";
import {act, renderHook, waitFor} from "@testing-library/react";
import type {MigrationOperation} from "@docktor/shared";
import {useMigrationOperations} from "@/hooks/use-migration-operations";
import {useContainerEvents, type StateEvent} from "@/hooks/use-container-events";

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

function progress(operation: MigrationOperation): StateEvent {
    return {type: "migration_progress", operation};
}

/** Delivers an SSE event to the handler the hook registered with useContainerEvents. */
function emit(event: StateEvent): void {
    const handler = mockedEvents.mock.lastCall?.[0];
    if (!handler) throw new Error("useContainerEvents was not called");
    act(() => handler(event));
}

describe("useMigrationOperations", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("reads the operation list once on mount and follows the running operations", async () => {
        const running = makeOperation({id: "op-run"});
        const done = succeeded({id: "op-done", composePath: "/host/opt/other/docker-compose.yml"});
        const listOperations = vi.fn().mockResolvedValue({operations: [running, done]});
        const onUpdate = vi.fn();

        const {result} = renderHook(() => useMigrationOperations(listOperations, {onUpdate}));

        await waitFor(() => expect(result.current.runningByComposePath.size).toBe(1));
        expect(listOperations).toHaveBeenCalledTimes(1);
        expect(result.current.runningByComposePath.get(running.composePath)).toEqual(running);
        expect(onUpdate).toHaveBeenCalledTimes(1);
        expect(onUpdate).toHaveBeenCalledWith(running);
        expect(result.current.operations).toHaveLength(2);
    });

    it("does not throw when the list cannot be read", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const listOperations = vi.fn().mockRejectedValue(new Error("offline"));

        const {result} = renderHook(() => useMigrationOperations(listOperations));

        await waitFor(() => expect(warn).toHaveBeenCalled());
        expect(result.current.operations).toEqual([]);
        warn.mockRestore();
    });

    it("stores a tracked operation and reports it through onUpdate", async () => {
        const listOperations = vi.fn().mockResolvedValue({operations: []});
        const onUpdate = vi.fn();
        const {result} = renderHook(() => useMigrationOperations(listOperations, {onUpdate}));
        await waitFor(() => expect(listOperations).toHaveBeenCalled());
        const operation = makeOperation();

        act(() => result.current.track(operation));

        expect(onUpdate).toHaveBeenCalledWith(operation);
        expect(result.current.runningByComposePath.get(operation.composePath)).toEqual(operation);
    });

    it("reports every progress event of a tracked operation and drops it from running when it succeeds", async () => {
        const listOperations = vi.fn().mockResolvedValue({operations: []});
        const onUpdate = vi.fn();
        const {result} = renderHook(() => useMigrationOperations(listOperations, {onUpdate}));
        await waitFor(() => expect(listOperations).toHaveBeenCalled());
        act(() => result.current.track(makeOperation()));

        const copying = makeOperation({step: "copying_named_volume", stepDetail: "pgdata"});
        emit(progress(copying));
        expect(onUpdate).toHaveBeenLastCalledWith(copying);
        expect(result.current.runningByComposePath.get(copying.composePath)?.step).toBe("copying_named_volume");

        const done = succeeded();
        emit(progress(done));
        expect(onUpdate).toHaveBeenLastCalledWith(done);
        expect(result.current.runningByComposePath.size).toBe(0);
        expect(onUpdate).toHaveBeenCalledTimes(3);
    });

    it("ignores a late running snapshot of an operation that already finished", async () => {
        const listOperations = vi.fn().mockResolvedValue({operations: []});
        const onUpdate = vi.fn();
        const {result} = renderHook(() => useMigrationOperations(listOperations, {onUpdate}));
        await waitFor(() => expect(listOperations).toHaveBeenCalled());
        emit(progress(succeeded()));
        onUpdate.mockClear();

        act(() => result.current.track(makeOperation()));
        emit(progress(makeOperation({step: "deploying"})));

        expect(onUpdate).not.toHaveBeenCalled();
        expect(result.current.runningByComposePath.size).toBe(0);
        expect(result.current.operations[0]?.status).toBe("succeeded");
    });

    it("does not let the slower start response move a tracked operation back to an earlier step", async () => {
        const listOperations = vi.fn().mockResolvedValue({operations: []});
        const onUpdate = vi.fn();
        const {result} = renderHook(() => useMigrationOperations(listOperations, {onUpdate}));
        await waitFor(() => expect(listOperations).toHaveBeenCalled());
        emit(progress(makeOperation({step: "deploying"})));
        onUpdate.mockClear();

        act(() => result.current.track(makeOperation({step: "starting"})));

        expect(onUpdate).not.toHaveBeenCalled();
        expect(result.current.runningByComposePath.get("/host/opt/db/docker-compose.yml")?.step).toBe("deploying");
    });

    it("stays silent about finished operations it never followed", async () => {
        const listOperations = vi.fn().mockResolvedValue({operations: []});
        const onUpdate = vi.fn();
        const {result} = renderHook(() => useMigrationOperations(listOperations, {onUpdate}));
        await waitFor(() => expect(listOperations).toHaveBeenCalled());

        emit(progress(succeeded({id: "op-other"})));

        expect(onUpdate).not.toHaveBeenCalled();
        expect(result.current.operations).toHaveLength(1);
    });

    it("ignores events of other types", async () => {
        const listOperations = vi.fn().mockResolvedValue({operations: []});
        const onUpdate = vi.fn();
        const {result} = renderHook(() => useMigrationOperations(listOperations, {onUpdate}));
        await waitFor(() => expect(listOperations).toHaveBeenCalled());

        emit({type: "stack_status", stackId: "db", stackStatus: "running"});

        expect(onUpdate).not.toHaveBeenCalled();
        expect(result.current.operations).toEqual([]);
    });
});
