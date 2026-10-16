import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter} from "react-router";
import {toast} from "sonner";
import {BrownfieldImport, type BrownfieldImportApi} from "@/components/domain/stack/brownfield-import";
import type {DiscoveredStack, MigrationResult, ScanResult} from "@/lib/brownfield-types";
import type {CodeEditorProps} from "@/components/common/code-editor";

// CodeMirror itself is covered by its own tests.
vi.mock("@/components/common/code-editor", () => ({
    CodeEditor: ({value, ariaLabel}: CodeEditorProps) => (
        <textarea aria-label={ariaLabel} value={value} readOnly onChange={() => undefined} />
    ),
}));

vi.mock("sonner", () => ({
    toast: {error: vi.fn(), info: vi.fn(), success: vi.fn()},
}));

const FALLBACK = "Migration failed. Your original stack directory was not modified. Check the error and try again.";

const stack: DiscoveredStack = {
    path: "/host/opt/db/docker-compose.yml",
    directory: "/host/opt/db",
    compatibility: "yellow",
    serviceCount: 1,
    namedVolumes: ["pgdata"],
    absolutePaths: [],
    relativePaths: [],
    inlineEnvVars: false,
    unsupportedFeatures: [],
    managedStack: null,
};

const okResult: MigrationResult = {success: true, stackId: "db", originalPath: "/host/opt/db"};

function createApi(executeMigration: BrownfieldImportApi["executeMigration"]): BrownfieldImportApi {
    return {
        scanDirectories: vi.fn().mockResolvedValue({stacks: [stack], skippedDirectories: 0, skipped: []}),
        adoptStack: vi.fn().mockResolvedValue({id: "db"}),
        previewMigration: vi.fn().mockResolvedValue({diff: {hunks: [], added: 0, removed: 0}, extractedEnv: ""}),
        executeMigration,
    };
}

async function walkToConfirm(options: {backupOff?: boolean; stopOff?: boolean} = {}): Promise<void> {
    await userEvent.click(screen.getByRole("button", {name: "Scan"}));
    await userEvent.click(await screen.findByRole("button", {name: "Migrate"}));
    await userEvent.click(screen.getByRole("button", {name: "Preview Changes"}));
    await userEvent.click(await screen.findByRole("button", {name: "Choose Backup"}));
    if (options.backupOff) {
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
            <BrownfieldImport api={api} />
        </MemoryRouter>,
    );
}

describe("BrownfieldImport migration flow", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("sends backup and stopOldStack as true by default and closes the dialog", async () => {
        const executeMigration = vi.fn().mockResolvedValue(okResult);
        renderImport(createApi(executeMigration));

        await walkToConfirm();
        expect(screen.getByRole("switch", {name: "Stop the old stack before migrating"})).toBeChecked();
        await userEvent.click(screen.getByRole("button", {name: "Confirm & Migrate"}));

        expect(executeMigration).toHaveBeenCalledTimes(1);
        expect(executeMigration).toHaveBeenCalledWith({
            composePath: "/host/opt/db/docker-compose.yml",
            displayName: "db",
            volumeSelections: [],
            namedVolumeSelections: {pgdata: true},
            backup: true,
            stopOldStack: true,
        });
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("sends backup and stopOldStack as false when both switches are turned off", async () => {
        const executeMigration = vi.fn().mockResolvedValue(okResult);
        renderImport(createApi(executeMigration));

        await walkToConfirm({backupOff: true, stopOff: true});
        await userEvent.click(screen.getByRole("button", {name: "Confirm & Migrate"}));

        expect(executeMigration).toHaveBeenCalledWith(expect.objectContaining({backup: false, stopOldStack: false}));
    });

    it("warns on step 3 when the backup switch is off", async () => {
        renderImport(createApi(vi.fn()));

        await userEvent.click(screen.getByRole("button", {name: "Scan"}));
        await userEvent.click(await screen.findByRole("button", {name: "Migrate"}));
        await userEvent.click(screen.getByRole("button", {name: "Preview Changes"}));
        await userEvent.click(await screen.findByRole("button", {name: "Choose Backup"}));

        const backupSwitch = screen.getByRole("switch", {name: "Back up the old stack first"});
        expect(backupSwitch).toBeChecked();
        expect(screen.queryByText(/No backup will be created\./)).toBeNull();

        await userEvent.click(backupSwitch);

        expect(screen.getByText(/No backup will be created\./)).toBeInTheDocument();
    });

    it("warns on step 4 when the stop switch is off", async () => {
        renderImport(createApi(vi.fn()));

        await walkToConfirm();
        expect(screen.queryByText(/The old stack keeps running\./)).toBeNull();

        await userEvent.click(screen.getByRole("switch", {name: "Stop the old stack before migrating"}));

        expect(screen.getByText(/The old stack keeps running\./)).toBeInTheDocument();
    });

    describe("toasts", () => {
        const BACKUP_NOTE = "Backup saved to pre-migration-backup/ in the new stack directory.";
        const SUCCESS_TITLE = "Migration complete! db is now managed by Docktor";

        async function confirm(
            makeResult: () => Promise<MigrationResult>,
            options: {backupOff?: boolean; stopOff?: boolean} = {},
        ): Promise<void> {
            renderImport(createApi(vi.fn().mockImplementation(makeResult)));
            await walkToConfirm(options);
            await userEvent.click(screen.getByRole("button", {name: "Confirm & Migrate"}));
        }

        it("describes the kept backup and the stopped old stack on success", async () => {
            await confirm(() => Promise.resolve(okResult));

            expect(toast.info).toHaveBeenCalledWith("Migrating db\u2026");
            await waitFor(() =>
                expect(toast.success).toHaveBeenCalledWith(
                    SUCCESS_TITLE,
                    expect.objectContaining({
                        description: `${BACKUP_NOTE} The old stack was stopped.`,
                        action: expect.objectContaining({label: "View stack"}),
                    }),
                ),
            );
        });

        it("only mentions the backup when the old stack was left running", async () => {
            await confirm(() => Promise.resolve(okResult), {stopOff: true});

            await waitFor(() =>
                expect(toast.success).toHaveBeenCalledWith(SUCCESS_TITLE, expect.objectContaining({description: BACKUP_NOTE})),
            );
        });

        it("only mentions the stopped old stack when no backup was made", async () => {
            await confirm(() => Promise.resolve(okResult), {backupOff: true});

            await waitFor(() =>
                expect(toast.success).toHaveBeenCalledWith(
                    SUCCESS_TITLE,
                    expect.objectContaining({description: "The old stack was stopped."}),
                ),
            );
        });

        it("omits the description when neither a backup nor a stop was chosen", async () => {
            await confirm(() => Promise.resolve(okResult), {backupOff: true, stopOff: true});

            await waitFor(() => expect(vi.mocked(toast.success).mock.calls.some(([title]) => title === SUCCESS_TITLE)).toBe(true));
            const call = vi.mocked(toast.success).mock.calls.find(([title]) => title === SUCCESS_TITLE);
            expect(call?.[1]).not.toHaveProperty("description");
            expect(call?.[1]).toHaveProperty("action");
        });

        it("shows the server's failure message verbatim", async () => {
            const error = "Migration failed: disk full. Your original stack directory was not modified. The old stack was restarted.";
            await confirm(() => Promise.resolve({success: false, error, originalPath: "/host/opt/db"}));

            await waitFor(() => expect(toast.error).toHaveBeenCalledWith(error));
        });

        it("falls back to the generic message when the failure carries no error text", async () => {
            await confirm(() => Promise.resolve({success: false, originalPath: "/host/opt/db"}));

            await waitFor(() => expect(toast.error).toHaveBeenCalledWith(FALLBACK));
        });

        it("shows the message of an Error rejection", async () => {
            await confirm(() => Promise.reject(new Error("Network down")));

            await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Network down"));
        });

        it("falls back to the generic message when the request rejects with a non-Error", async () => {
            await confirm(() => Promise.reject("boom"));

            await waitFor(() => expect(toast.error).toHaveBeenCalledWith(FALLBACK));
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
});
