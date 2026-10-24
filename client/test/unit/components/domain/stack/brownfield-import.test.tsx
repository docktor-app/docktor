import {beforeEach, describe, expect, it, vi} from "vitest";
import {act, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter} from "react-router";
import type {MigrationOperation, MigrationTarget} from "@docktor/shared";
import {toast} from "sonner";
import {BrownfieldImport, type BrownfieldImportApi} from "@/components/domain/stack/brownfield-import";
import {MigrationToastTracker} from "@/components/domain/stack/migration-toast-tracker";
import {migrationOperationsStore} from "@/lib/migration-operations-store";
import {useContainerEvents, type StateEvent} from "@/hooks/use-container-events";
import type {DiscoveredStack, ScanResult} from "@/lib/brownfield-types";
import type {CodeEditorProps} from "@/components/common/code-editor";

// #107: a preview whose filesystem has room for the migration, with or without a backup.
const ROOMY_DISK_SPACE = {
    withoutBackup: {ok: true, filesystems: [{label: "/opt/docktor/stacks", requiredBytes: 1024, availableBytes: 1_048_576}]},
    withBackup: {ok: true, filesystems: [{label: "/opt/docktor/stacks", requiredBytes: 2048, availableBytes: 1_048_576}]},
};

// CodeMirror itself is covered by its own tests.
vi.mock("@/components/common/code-editor", () => ({
    CodeEditor: ({value, ariaLabel}: CodeEditorProps) => (
        <textarea aria-label={ariaLabel} value={value} readOnly onChange={() => undefined} />
    ),
}));

vi.mock("sonner", () => ({
    toast: {error: vi.fn(), info: vi.fn(), success: vi.fn(), loading: vi.fn(), warning: vi.fn()},
}));

// The SSE connection is exercised by the hook's own tests; here the test
// delivers migration_progress events through the handler the layout-level
// tracker registered (it owns the stream and the toasts, see AppLayout).
vi.mock("@/hooks/use-container-events", () => ({
    useContainerEvents: vi.fn(),
}));

const mockedEvents = vi.mocked(useContainerEvents);

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

const FALLBACK = "Migration failed. Check the error and the old stack, then try again.";

const stack: DiscoveredStack = {
    path: "/host/opt/db/docker-compose.yml",
    directory: "/host/opt/db",
    compatibility: "yellow",
    serviceCount: 1,
    namedVolumes: ["pgdata"],
    externalVolumes: [],
    absolutePaths: [],
    relativePaths: [],
    inlineEnvVars: false,
    unsupportedFeatures: [],
    managedStack: null,
};

const separateTarget: MigrationTarget = {
    stackId: "db",
    directory: "/opt/docktor/stacks/db",
    originalDirectory: "/host/opt/db",
    inPlace: false,
    suggestedAsideName: null,
    sharedProjectName: null,
};

const inPlaceTarget: MigrationTarget = {
    stackId: "db",
    directory: "/opt/docktor/stacks/db",
    originalDirectory: "/opt/docktor/stacks/db",
    inPlace: true,
    suggestedAsideName: "db-pre-migration",
    sharedProjectName: null,
};

function makeOperation(overrides: Partial<MigrationOperation> = {}): MigrationOperation {
    return {
        id: "op-1",
        stackId: "db",
        displayName: "db",
        composePath: stack.path,
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

const runningOperation = makeOperation();

function finished(overrides: Partial<MigrationOperation> = {}): MigrationOperation {
    return makeOperation({
        status: "succeeded",
        step: "finished",
        finishedAt: "2026-10-16T10:01:00.000Z",
        result: {success: true, stackId: "db", originalPath: "/host/opt/db"},
        ...overrides,
    });
}

function failed(error: string | undefined, overrides: Partial<MigrationOperation> = {}): MigrationOperation {
    return makeOperation({
        status: "failed",
        step: "finished",
        finishedAt: "2026-10-16T10:01:00.000Z",
        result: {success: false, originalPath: "/host/opt/db", ...(error !== undefined && {error})},
        ...overrides,
    });
}

function progress(operation: MigrationOperation): StateEvent {
    return {type: "migration_progress", operation};
}

function createApi(
    executeMigration: BrownfieldImportApi["executeMigration"],
    target: MigrationTarget = separateTarget,
): BrownfieldImportApi {
    return {
        scanDirectories: vi.fn().mockResolvedValue({stacks: [stack], skippedDirectories: 0, skipped: []}),
        adoptStack: vi.fn().mockResolvedValue({id: "db"}),
        previewMigration: vi.fn().mockResolvedValue({diff: {hunks: [], added: 0, removed: 0}, extractedEnv: "", emptySources: [], anonymousVolumes: [], diskSpace: ROOMY_DISK_SPACE, target}),
        executeMigration,
        listMigrationOperations: vi.fn().mockResolvedValue({operations: []}),
    };
}

async function walkToConfirm(options: {backupOn?: boolean; stopOff?: boolean} = {}): Promise<void> {
    await userEvent.click(screen.getByRole("button", {name: "Scan"}));
    await userEvent.click(await screen.findByRole("button", {name: "Migrate"}));
    await userEvent.click(screen.getByRole("button", {name: "Preview Changes"}));
    await userEvent.click(await screen.findByRole("button", {name: "Choose Backup"}));
    if (options.backupOn) {
        await userEvent.click(screen.getByRole("switch", {name: "Back up the old stack first"}));
    }
    await userEvent.click(screen.getByRole("button", {name: "Choose Old Stack Action"}));
    if (options.stopOff) {
        await userEvent.click(screen.getByRole("switch", {name: "Stop the old stack before migrating"}));
    }
}

function renderImport(api: BrownfieldImportApi): void {
    render(
        <MemoryRouter>
            <MigrationToastTracker listOperations={api.listMigrationOperations} />
            <BrownfieldImport api={api} />
        </MemoryRouter>,
    );
}

describe("BrownfieldImport migration flow", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        migrationOperationsStore.reset();
    });

    it("sends backup false and stopOldStack true by default and closes the dialog", async () => {
        const executeMigration = vi.fn().mockResolvedValue(runningOperation);
        const api = createApi(executeMigration);
        renderImport(api);

        await walkToConfirm();
        expect(screen.getByRole("switch", {name: "Stop the old stack before migrating"})).toBeChecked();
        await userEvent.click(screen.getByRole("button", {name: "Confirm & Migrate"}));

        expect(api.previewMigration).toHaveBeenCalledWith({
            composePath: "/host/opt/db/docker-compose.yml",
            displayName: "db",
            volumeSelections: [],
            namedVolumeSelections: {pgdata: true},
        });
        expect(executeMigration).toHaveBeenCalledTimes(1);
        const body = executeMigration.mock.calls[0]?.[0];
        expect(body).toEqual({
            composePath: "/host/opt/db/docker-compose.yml",
            displayName: "db",
            volumeSelections: [],
            namedVolumeSelections: {pgdata: true},
            backup: false,
            stopOldStack: true,
            acknowledgeAnonymousVolumes: false,
        });
        expect(body).not.toHaveProperty("inPlaceAsideName");
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("sends acknowledgeAnonymousVolumes true once the user acknowledged the anonymous volumes (D-05)", async () => {
        const executeMigration = vi.fn().mockResolvedValue(runningOperation);
        const api = createApi(executeMigration);
        vi.mocked(api.previewMigration).mockResolvedValue({
            diff: {hunks: [], added: 0, removed: 0},
            extractedEnv: "",
            emptySources: [],
            anonymousVolumes: [{service: "db", containerPath: "/var/lib/postgresql/data"}],
            diskSpace: ROOMY_DISK_SPACE,
            target: separateTarget,
        });
        renderImport(api);
        await userEvent.click(screen.getByRole("button", {name: "Scan"}));
        await userEvent.click(await screen.findByRole("button", {name: "Migrate"}));
        await userEvent.click(screen.getByRole("button", {name: "Preview Changes"}));
        await userEvent.click(await screen.findByRole("checkbox", {name: "I understand these volumes start empty in the new stack"}));
        await userEvent.click(screen.getByRole("button", {name: "Choose Backup"}));
        await userEvent.click(screen.getByRole("button", {name: "Choose Old Stack Action"}));

        await userEvent.click(screen.getByRole("button", {name: "Confirm & Migrate"}));

        expect(executeMigration.mock.calls[0]?.[0]).toMatchObject({acknowledgeAnonymousVolumes: true});
    });

    it("sends backup true and stopOldStack false when the backup is turned on and the stop off", async () => {
        const executeMigration = vi.fn().mockResolvedValue(runningOperation);
        renderImport(createApi(executeMigration));

        await walkToConfirm({backupOn: true, stopOff: true});
        await userEvent.click(screen.getByRole("button", {name: "Confirm & Migrate"}));

        expect(executeMigration).toHaveBeenCalledWith(expect.objectContaining({backup: true, stopOldStack: false}));
    });

    it("sends the aside name, the forced stop and no extra backup for an in-place migration", async () => {
        const executeMigration = vi.fn().mockResolvedValue(runningOperation);
        renderImport(createApi(executeMigration, inPlaceTarget));

        await walkToConfirm();
        expect(screen.getByRole("switch", {name: "Stop the old stack before migrating"})).toBeDisabled();
        await userEvent.click(screen.getByRole("button", {name: "Confirm & Migrate"}));

        expect(executeMigration).toHaveBeenCalledWith({
            composePath: "/host/opt/db/docker-compose.yml",
            displayName: "db",
            volumeSelections: [],
            namedVolumeSelections: {pgdata: true},
            backup: false,
            stopOldStack: true,
            acknowledgeAnonymousVolumes: false,
            inPlaceAsideName: "db-pre-migration",
        });
    });

    it("explains on step 3 that the original stays untouched while the backup switch is off", async () => {
        renderImport(createApi(vi.fn()));

        await userEvent.click(screen.getByRole("button", {name: "Scan"}));
        await userEvent.click(await screen.findByRole("button", {name: "Migrate"}));
        await userEvent.click(screen.getByRole("button", {name: "Preview Changes"}));
        await userEvent.click(await screen.findByRole("button", {name: "Choose Backup"}));

        const backupSwitch = screen.getByRole("switch", {name: "Back up the old stack first"});
        expect(backupSwitch).not.toBeChecked();
        expect(screen.getByText(/Your original stack stays untouched at \/host\/opt\/db/)).toBeInTheDocument();

        await userEvent.click(backupSwitch);

        expect(screen.queryByText(/Your original stack stays untouched at/)).toBeNull();
    });

    it("warns on step 4 when the stop switch is off", async () => {
        renderImport(createApi(vi.fn()));

        await walkToConfirm();
        expect(screen.queryByText(/The old stack keeps running\./)).toBeNull();

        await userEvent.click(screen.getByRole("switch", {name: "Stop the old stack before migrating"}));

        expect(screen.getByText(/The old stack keeps running\./)).toBeInTheDocument();
    });

    describe("operation-driven toasts (G-18-job)", () => {
        const BACKUP_NOTE = "Backup saved to pre-migration-backup/ in the new stack directory.";
        const SUCCESS_TITLE = "Migration complete! db is now managed by Docktor";

        async function confirm(
            execute: () => Promise<MigrationOperation>,
            options: {backupOn?: boolean; stopOff?: boolean} = {},
        ): Promise<void> {
            renderImport(createApi(vi.fn().mockImplementation(execute)));
            await walkToConfirm(options);
            await userEvent.click(screen.getByRole("button", {name: "Confirm & Migrate"}));
        }

        it("shows one persistent progress toast keyed by the operation id", async () => {
            await confirm(() => Promise.resolve(runningOperation));

            await waitFor(() =>
                expect(toast.loading).toHaveBeenCalledWith(expect.stringMatching(/^Migrating db/), {id: "op-1"}),
            );
        });

        it("follows a step change in the same toast", async () => {
            await confirm(() => Promise.resolve(runningOperation));
            await waitFor(() => expect(toast.loading).toHaveBeenCalled());

            emit(progress(makeOperation({step: "copying_named_volume", stepDetail: "pgdata"})));

            expect(toast.loading).toHaveBeenLastCalledWith(
                expect.stringContaining("Copying volume pgdata"),
                {id: "op-1"},
            );
        });

        it("turns the toast into the success toast and marks the row imported", async () => {
            await confirm(() => Promise.resolve(makeOperation({backup: true})), {backupOn: true});
            await waitFor(() => expect(toast.loading).toHaveBeenCalled());

            emit(progress(finished({backup: true})));

            expect(toast.success).toHaveBeenCalledWith(
                SUCCESS_TITLE,
                expect.objectContaining({
                    id: "op-1",
                    description: `${BACKUP_NOTE} The old stack was stopped.`,
                    action: expect.objectContaining({label: "View stack"}),
                }),
            );
            expect(await screen.findByText("Imported")).toBeInTheDocument();
        });

        it("only mentions the backup when the old stack was left running", async () => {
            await confirm(() => Promise.resolve(makeOperation({backup: true, stopOldStack: false})));
            await waitFor(() => expect(toast.loading).toHaveBeenCalled());

            emit(progress(finished({backup: true, stopOldStack: false})));

            expect(toast.success).toHaveBeenCalledWith(SUCCESS_TITLE, expect.objectContaining({description: BACKUP_NOTE}));
        });

        it("names the kept original directory of an in-place migration", async () => {
            await confirm(() => Promise.resolve(runningOperation));
            await waitFor(() => expect(toast.loading).toHaveBeenCalled());

            emit(
                progress(
                    finished({
                        result: {
                            success: true,
                            stackId: "db",
                            originalPath: "/opt/docktor/stacks/db",
                            keptOriginalAt: "/opt/docktor/stacks/db-pre-migration",
                        },
                    }),
                ),
            );

            expect(toast.success).toHaveBeenCalledWith(
                SUCCESS_TITLE,
                expect.objectContaining({
                    description: "The original directory is kept at /opt/docktor/stacks/db-pre-migration. The old stack was stopped.",
                }),
            );
        });

        it("omits the description when neither a backup nor a stop was chosen", async () => {
            await confirm(() => Promise.resolve(makeOperation({stopOldStack: false})));
            await waitFor(() => expect(toast.loading).toHaveBeenCalled());

            emit(progress(finished({stopOldStack: false})));

            const call = vi.mocked(toast.success).mock.calls.find(([title]) => title === SUCCESS_TITLE);
            expect(call?.[1]).not.toHaveProperty("description");
            expect(call?.[1]).toHaveProperty("action");
        });

        it("shows the server's error text as the detail of the failure toast", async () => {
            const error = "Migration failed: disk full.";
            await confirm(() => Promise.resolve(runningOperation));
            await waitFor(() => expect(toast.loading).toHaveBeenCalled());

            emit(progress(failed(error)));

            expect(toast.error).toHaveBeenCalledWith("Migration of db failed", {id: "op-1", description: error});
            expect(screen.queryByText("Imported")).toBeNull();
        });

        it("falls back to the generic message when the failure carries no error text", async () => {
            await confirm(() => Promise.resolve(runningOperation));
            await waitFor(() => expect(toast.loading).toHaveBeenCalled());

            emit(progress(failed(undefined)));

            expect(toast.error).toHaveBeenCalledWith("Migration of db failed", {id: "op-1", description: FALLBACK});
        });

        it("shows the refusal of a start (for example the in-flight guard) and tracks nothing", async () => {
            const message = 'A migration to stack "db" is already running';
            await confirm(() => Promise.reject(new Error(message)));

            await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
            expect(toast.loading).not.toHaveBeenCalled();
        });

        it("falls back to the generic message when the request rejects with a non-Error", async () => {
            await confirm(() => Promise.reject("boom"));

            await waitFor(() => expect(toast.error).toHaveBeenCalledWith(FALLBACK));
        });
    });

    describe("rows of running migrations (G-18-job)", () => {
        async function startMigration(api: BrownfieldImportApi): Promise<HTMLElement> {
            renderImport(api);
            await walkToConfirm();
            await userEvent.click(screen.getByRole("button", {name: "Confirm & Migrate"}));
            return screen.findByRole("row", {name: /\/host\/opt\/db/});
        }

        it("disables Migrate and Adopt and shows the current step while the operation runs", async () => {
            const row = await startMigration(createApi(vi.fn().mockResolvedValue(runningOperation)));

            expect(await within(row).findByRole("button", {name: "Migrating..."})).toBeDisabled();
            expect(within(row).getByRole("button", {name: "Adopt"})).toBeDisabled();
            expect(within(row).queryByRole("button", {name: "Migrate"})).toBeNull();
            expect(within(row).getByText("Starting")).toBeInTheDocument();

            emit(progress(makeOperation({step: "copying_bind_mount", stepDetail: "./data"})));

            expect(await within(row).findByText("Copying ./data")).toBeInTheDocument();
        });

        it("makes the row actionable again after a failed migration", async () => {
            const row = await startMigration(createApi(vi.fn().mockResolvedValue(runningOperation)));
            await within(row).findByRole("button", {name: "Migrating..."});

            emit(progress(failed("Migration failed: disk full.")));

            expect(await within(row).findByRole("button", {name: "Migrate"})).toBeEnabled();
            expect(within(row).getByRole("button", {name: "Adopt"})).toBeEnabled();
        });

        it("shows Imported after a successful migration", async () => {
            const row = await startMigration(createApi(vi.fn().mockResolvedValue(runningOperation)));
            await within(row).findByRole("button", {name: "Migrating..."});

            emit(progress(finished()));

            expect(await within(row).findByText("Imported")).toBeInTheDocument();
            expect(within(row).queryByRole("button")).toBeNull();
        });

        it("restores a running migration after a reload without any confirm in this session", async () => {
            const api = createApi(vi.fn());
            vi.mocked(api.listMigrationOperations).mockResolvedValue({operations: [runningOperation]});
            renderImport(api);
            openStream();

            await waitFor(() =>
                expect(toast.loading).toHaveBeenCalledWith(expect.stringMatching(/^Migrating db/), {id: "op-1"}),
            );
            await userEvent.click(screen.getByRole("button", {name: "Scan"}));
            const row = await screen.findByRole("row", {name: /\/host\/opt\/db/});
            expect(within(row).getByRole("button", {name: "Migrating..."})).toBeDisabled();
            expect(within(row).getByRole("button", {name: "Adopt"})).toBeDisabled();

            emit(progress(finished()));

            expect(toast.success).toHaveBeenCalledWith(
                "Migration complete! db is now managed by Docktor",
                expect.objectContaining({id: "op-1"}),
            );
        });

        it("re-reads the operations when the event stream reopens and reports what finished meanwhile", async () => {
            const api = createApi(vi.fn());
            vi.mocked(api.listMigrationOperations)
                .mockResolvedValueOnce({operations: [runningOperation]})
                .mockResolvedValueOnce({operations: [finished()]});
            renderImport(api);
            openStream();
            await waitFor(() => expect(toast.loading).toHaveBeenCalled());

            openStream();

            await waitFor(() =>
                expect(toast.success).toHaveBeenCalledWith(
                    "Migration complete! db is now managed by Docktor",
                    expect.objectContaining({id: "op-1"}),
                ),
            );
            expect(api.listMigrationOperations).toHaveBeenCalledTimes(2);
        });
    });

    describe("skipped scan roots (G-18-3-scan)", () => {
        const NOT_FOUND_PATH = "/run/desktop/mnt/host/c/stacks";

        async function scanWith(result: ScanResult): Promise<void> {
            const api = createApi(vi.fn());
            vi.mocked(api.scanDirectories).mockResolvedValue(result);
            renderImport(api);
            await userEvent.click(screen.getByRole("button", {name: "Scan"}));
        }

        it("lists a not-found root with the /host hint even when no stack was found", async () => {
            await scanWith({
                stacks: [],
                skippedDirectories: 1,
                skipped: [{directory: NOT_FOUND_PATH, reason: "not_found"}],
            });

            expect(await screen.findByText("No stacks found")).toBeInTheDocument();
            const region = screen.getByRole("region", {name: "Skipped directories"});
            expect(within(region).getByText(NOT_FOUND_PATH)).toBeInTheDocument();
            expect(within(region).getByText("Not found inside the Docktor container")).toBeInTheDocument();
            expect(region).toHaveTextContent("/host");
            expect(screen.queryByText(/permission denied/i)).toBeNull();
        });

        it("labels permission-denied and system-directory roots", async () => {
            await scanWith({
                stacks: [],
                skippedDirectories: 2,
                skipped: [
                    {directory: "/root", reason: "permission_denied"},
                    {directory: "/proc", reason: "system_directory"},
                ],
            });

            const region = await screen.findByRole("region", {name: "Skipped directories"});
            expect(within(region).getByText("Permission denied")).toBeInTheDocument();
            expect(within(region).getByText("System directory, never scanned")).toBeInTheDocument();
        });

        it("renders both the table and the skipped list when stacks were found", async () => {
            await scanWith({
                stacks: [stack],
                skippedDirectories: 1,
                skipped: [{directory: NOT_FOUND_PATH, reason: "not_found"}],
            });

            expect(await screen.findByRole("table")).toBeInTheDocument();
            expect(screen.getByRole("region", {name: "Skipped directories"})).toBeInTheDocument();
        });

        it("renders no skipped region when nothing was skipped", async () => {
            await scanWith({stacks: [stack], skippedDirectories: 0, skipped: []});

            expect(await screen.findByRole("table")).toBeInTheDocument();
            expect(screen.queryByRole("region", {name: "Skipped directories"})).toBeNull();
        });

        it("explains container-visible paths in the directories help text", () => {
            renderImport(createApi(vi.fn()));

            expect(screen.getByText(/host directories are under \/host/)).toBeInTheDocument();
        });
    });

    describe("already-managed rows (G-18-2)", () => {
        const managedStack: DiscoveredStack = {
            ...stack,
            path: "/host/opt/blog/docker-compose.yml",
            directory: "/host/opt/blog",
            managedStack: {id: "blog", displayName: "Blog"},
        };

        async function scanBoth(): Promise<{managedRow: HTMLElement; unmanagedRow: HTMLElement}> {
            const api = createApi(vi.fn());
            vi.mocked(api.scanDirectories).mockResolvedValue({
                stacks: [stack, managedStack],
                skippedDirectories: 0,
                skipped: [],
            });
            renderImport(api);
            await userEvent.click(screen.getByRole("button", {name: "Scan"}));
            return {
                managedRow: await screen.findByRole("row", {name: /\/host\/opt\/blog/}),
                unmanagedRow: screen.getByRole("row", {name: /\/host\/opt\/db/}),
            };
        }

        it("marks the managed row as already managed and links to its stack", async () => {
            const {managedRow, unmanagedRow} = await scanBoth();

            expect(within(managedRow).getByText("Already managed")).toBeInTheDocument();
            expect(within(managedRow).getByRole("link", {name: "View Blog"})).toHaveAttribute("href", "/stacks/blog");
            expect(within(unmanagedRow).queryByText("Already managed")).toBeNull();
        });

        it("shows Already managed in place of the compatibility badge", async () => {
            const {managedRow, unmanagedRow} = await scanBoth();

            expect(within(managedRow).queryByText("Migration Recommended")).toBeNull();
            expect(within(unmanagedRow).getByText("Migration Recommended")).toBeInTheDocument();
        });

        it("disables Migrate and Adopt on the managed row only", async () => {
            const {managedRow, unmanagedRow} = await scanBoth();

            expect(within(managedRow).getByRole("button", {name: "Migrate"})).toBeDisabled();
            expect(within(managedRow).getByRole("button", {name: "Adopt"})).toBeDisabled();
            expect(within(unmanagedRow).getByRole("button", {name: "Migrate"})).toBeEnabled();
            expect(within(unmanagedRow).getByRole("button", {name: "Adopt"})).toBeEnabled();
        });

        it("does not open the migration dialog from the managed row", async () => {
            const {managedRow} = await scanBoth();

            await userEvent.click(within(managedRow).getByRole("button", {name: "Migrate"}));

            expect(screen.queryByRole("dialog")).toBeNull();
        });
    });
});

describe("BrownfieldImport layout", () => {
    const longDirectory = "/host/home/raphael/workspace/docktor/dev-data/docktor/stacks/memos-archive";

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders the card up to max-w-6xl instead of max-w-3xl", () => {
        renderImport(createApi(vi.fn()));

        const card = screen.getByText("Import Existing Stacks").closest('[data-slot="card"]');

        expect(card).toHaveClass("max-w-6xl");
        expect(card).not.toHaveClass("max-w-3xl");
    });

    it("lets a long scanned directory wrap inside its table cell", async () => {
        const api = createApi(vi.fn());
        vi.mocked(api.scanDirectories).mockResolvedValue({
            stacks: [{...stack, path: `${longDirectory}/docker-compose.yml`, directory: longDirectory}],
            skippedDirectories: 0,
            skipped: [],
        });
        renderImport(api);

        await userEvent.click(screen.getByRole("button", {name: "Scan"}));
        const cell = (await screen.findByText(longDirectory)).closest("td");

        expect(longDirectory.length).toBeGreaterThanOrEqual(70);
        expect(cell).toHaveClass("whitespace-normal", "break-all");
    });
});
