import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter} from "react-router";
import {BrownfieldImport, type BrownfieldImportApi} from "@/components/domain/stack/brownfield-import";
import type {DiscoveredStack, MigrationResult} from "@/lib/brownfield-types";
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

const stack: DiscoveredStack = {
    path: "/host/opt/db/docker-compose.yml",
    directory: "/host/opt/db",
    compatibility: "yellow",
    serviceCount: 1,
    namedVolumes: ["pgdata"],
    absolutePaths: [],
    inlineEnvVars: false,
    unsupportedFeatures: [],
};

const okResult: MigrationResult = {success: true, stackId: "db", originalPath: "/host/opt/db"};

function createApi(executeMigration: BrownfieldImportApi["executeMigration"]): BrownfieldImportApi {
    return {
        scanDirectories: vi.fn().mockResolvedValue({stacks: [stack], skippedDirectories: 0}),
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
});
