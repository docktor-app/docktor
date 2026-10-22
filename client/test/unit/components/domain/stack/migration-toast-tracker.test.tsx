import {useState} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {act, render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter} from "react-router";
import type {MigrationOperation} from "@docktor/shared";
import {toast} from "sonner";
import {MigrationToastTracker} from "@/components/domain/stack/migration-toast-tracker";
import {useMigrationOperations} from "@/hooks/use-migration-operations";
import {useContainerEvents, type StateEvent} from "@/hooks/use-container-events";
import {lostMigrationMessage, migrationOperationsStore} from "@/lib/migration-operations-store";
import {showMigrationToast} from "@/lib/migration-progress";

vi.mock("sonner", () => ({
    toast: {error: vi.fn(), info: vi.fn(), success: vi.fn(), loading: vi.fn(), warning: vi.fn()},
}));
vi.mock("@/lib/migration-progress", () => ({
    showMigrationToast: vi.fn(),
}));
vi.mock("@/hooks/use-container-events", () => ({
    useContainerEvents: vi.fn(),
}));

const mockedEvents = vi.mocked(useContainerEvents);
const mockedShowToast = vi.mocked(showMigrationToast);

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

function succeeded(): MigrationOperation {
    return makeOperation({
        status: "succeeded",
        step: "finished",
        finishedAt: "2026-10-16T10:01:00.000Z",
        result: {success: true, stackId: "db", originalPath: "/host/opt/db"},
    });
}

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

/** Stands in for BrownfieldImport: starts following an operation, then can be removed from the page. */
function ImportPageStub() {
    const {track} = useMigrationOperations();
    return <button onClick={() => track(makeOperation())}>start migration</button>;
}

function Page({listOperations}: Readonly<{listOperations: () => Promise<{operations: MigrationOperation[]}>}>) {
    const [showImport, setShowImport] = useState(true);
    return (
        <MemoryRouter>
            <MigrationToastTracker listOperations={listOperations} />
            {showImport && <ImportPageStub />}
            <button onClick={() => setShowImport(false)}>leave page</button>
        </MemoryRouter>
    );
}

describe("MigrationToastTracker", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        migrationOperationsStore.reset();
    });

    it("renders nothing", () => {
        const {container} = render(
            <MemoryRouter>
                <MigrationToastTracker listOperations={vi.fn().mockResolvedValue({operations: []})} />
            </MemoryRouter>,
        );

        expect(container).toBeEmptyDOMElement();
    });

    it("shows the toast of every followed update", () => {
        render(
            <MemoryRouter>
                <MigrationToastTracker listOperations={vi.fn().mockResolvedValue({operations: []})} />
            </MemoryRouter>,
        );
        const operation = makeOperation({step: "deploying"});

        emit({type: "migration_progress", operation});

        expect(mockedShowToast).toHaveBeenCalledWith(operation, expect.any(Function));
    });

    it("keeps updating the toast after the page that started the migration is gone", async () => {
        render(<Page listOperations={vi.fn().mockResolvedValue({operations: []})} />);
        await userEvent.click(screen.getByRole("button", {name: "start migration"}));
        await userEvent.click(screen.getByRole("button", {name: "leave page"}));
        expect(screen.queryByRole("button", {name: "start migration"})).toBeNull();
        mockedShowToast.mockClear();

        emit({type: "migration_progress", operation: succeeded()});

        expect(mockedShowToast).toHaveBeenCalledWith(succeeded(), expect.any(Function));
    });

    it("ends a followed operation the server no longer reports in a terminal error toast", async () => {
        const operation = makeOperation({displayName: "blog"});
        const listOperations = vi.fn().mockResolvedValue({operations: []});
        render(
            <MemoryRouter>
                <MigrationToastTracker listOperations={listOperations} />
            </MemoryRouter>,
        );
        act(() => migrationOperationsStore.track(operation));

        openStream();

        await vi.waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith(lostMigrationMessage(operation), {id: operation.id}),
        );
        expect(toast.error).toHaveBeenCalledTimes(1);
    });

    it("stops listening when it unmounts", () => {
        const {unmount} = render(
            <MemoryRouter>
                <MigrationToastTracker listOperations={vi.fn().mockResolvedValue({operations: []})} />
            </MemoryRouter>,
        );
        unmount();

        act(() => migrationOperationsStore.track(makeOperation()));

        expect(mockedShowToast).not.toHaveBeenCalled();
    });
});
