import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {toast} from "sonner";
import {MigrationWizard} from "@/routes/setup/components/migration-wizard";
import type {DiscoveredStack, MigrationPreview} from "@/lib/brownfield-types";
import type {MigrationPreviewInput, MigrationTarget} from "@docktor/shared";
import type {CodeEditorProps} from "@/components/common/code-editor";
import type {UnifiedDiff} from "@/lib/stacks-api";

// CodeMirror itself is covered by its own tests — mock it with a textarea
// exposing the same aria-label so this file only asserts the review step.
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
    relativePaths: [],
    inlineEnvVars: false,
    unsupportedFeatures: [],
    managedStack: null,
};

const sampleDiff: UnifiedDiff = {
    added: 1,
    removed: 1,
    hunks: [
        {
            oldStart: 1,
            oldLines: 3,
            newStart: 1,
            newLines: 3,
            lines: [
                {kind: "context", text: "services:", oldLine: 1, newLine: 1},
                {kind: "removed", text: "      - pgdata:/var/lib/postgresql/data", oldLine: 2, newLine: null},
                {kind: "added", text: "      - ./volumes/pgdata:/var/lib/postgresql/data", oldLine: null, newLine: 2},
            ],
        },
    ],
};

const emptyDiff: UnifiedDiff = {hunks: [], added: 0, removed: 0};

const PREVIEW_FALLBACK = "Failed to generate preview. Check that the compose file is still readable and try again.";

type PreviewFn = (input: MigrationPreviewInput) => Promise<MigrationPreview>;

// Not in place: the scanned directory is outside Docktor's stacks folder.
const separateTarget: MigrationTarget = {
    stackId: "db",
    directory: "/opt/docktor/stacks/db",
    originalDirectory: "/host/opt/db",
    inPlace: false,
    suggestedAsideName: null,
    sharedProjectName: null,
};

function renderWizard(
    previewMigration: PreviewFn,
    onClose = vi.fn(),
    onConfirmMigrate = vi.fn(),
    wizardStack: DiscoveredStack = stack,
) {
    render(
        <MigrationWizard
            stack={wizardStack}
            open
            onClose={onClose}
            onConfirmMigrate={onConfirmMigrate}
            previewMigration={previewMigration}
        />,
    );
    return {onClose, onConfirmMigrate};
}

const okPreview = (): Promise<MigrationPreview> => Promise.resolve({diff: emptyDiff, extractedEnv: "", emptySources: [], target: separateTarget});

describe("MigrationWizard", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("opens as a wide dialog that caps its height so header and footer can stay pinned", () => {
        renderWizard(vi.fn());

        const dialog = screen.getByRole("dialog");
        expect(dialog.className).toContain("sm:max-w-5xl");
        expect(dialog.className).toContain("max-h-[90dvh]");
    });

    it("names the step-1 secondary action Cancel Migration and closes on click", async () => {
        const {onClose} = renderWizard(vi.fn());

        await userEvent.click(screen.getByRole("button", {name: "Cancel Migration"}));

        expect(onClose).toHaveBeenCalled();
    });

    it("renders the preview as a real line diff with +N / -N counters", async () => {
        const previewMigration = vi.fn().mockResolvedValue({diff: sampleDiff, extractedEnv: "", emptySources: [], target: separateTarget});
        renderWizard(previewMigration);

        await userEvent.click(screen.getByRole("button", {name: "Preview Changes"}));

        expect(previewMigration).toHaveBeenCalledTimes(1);
        expect(previewMigration).toHaveBeenCalledWith({
            composePath: "/host/opt/db/docker-compose.yml",
            displayName: "db",
            volumeSelections: [],
            namedVolumeSelections: {pgdata: true},
        });

        expect(await screen.findByRole("heading", {name: "Review Changes"})).toBeInTheDocument();
        const region = screen.getByRole("region", {name: "Migration compose diff"});
        const added = within(region).getByText("./volumes/pgdata", {exact: false}).closest("[data-diff-kind]");
        expect(added).toHaveAttribute("data-diff-kind", "added");
        const removed = within(region).getByText("- pgdata:/var/lib/postgresql/data", {exact: false}).closest("[data-diff-kind]");
        expect(removed).toHaveAttribute("data-diff-kind", "removed");

        expect(screen.getByText("Compose file changes")).toBeInTheDocument();
        expect(screen.getByText("+1")).toBeInTheDocument();
        expect(screen.getByText("−1")).toBeInTheDocument();
    });

    it("shows the empty state with +0 / -0 counters when there are no hunks", async () => {
        renderWizard(vi.fn().mockResolvedValue({diff: emptyDiff, extractedEnv: "", emptySources: [], target: separateTarget}));

        await userEvent.click(screen.getByRole("button", {name: "Preview Changes"}));

        expect(await screen.findByText("No changes to your compose file.")).toBeInTheDocument();
        expect(screen.getByText("The compose file is migrated as-is. Continue to choose a backup.")).toBeInTheDocument();
        expect(screen.getByText("+0")).toBeInTheDocument();
        expect(screen.getByText("−0")).toBeInTheDocument();
        expect(screen.queryByRole("region", {name: "Migration compose diff"})).toBeNull();
    });

    it("names every source that starts empty in a warning alert on the review step", async () => {
        renderWizard(vi.fn().mockResolvedValue({
            diff: emptyDiff,
            extractedEnv: "",
            emptySources: ["./missing", "/srv/app/cache"],
            target: separateTarget,
        }));

        await userEvent.click(screen.getByRole("button", {name: "Preview Changes"}));

        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("The new stack starts with an empty folder for each");
        expect(within(alert).getByText("./missing")).toBeInTheDocument();
        expect(within(alert).getByText("/srv/app/cache")).toBeInTheDocument();
    });

    it("shows no empty-source alert when the preview reports none", async () => {
        renderWizard(vi.fn().mockImplementation(okPreview));

        await userEvent.click(screen.getByRole("button", {name: "Preview Changes"}));

        expect(await screen.findByRole("heading", {name: "Review Changes"})).toBeInTheDocument();
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("disables the button and stays on step 1 while the preview is in flight", async () => {
        renderWizard(vi.fn().mockReturnValue(new Promise<MigrationPreview>(() => undefined)));

        await userEvent.click(screen.getByRole("button", {name: "Preview Changes"}));

        const busy = await screen.findByRole("button", {name: "Generating preview…"});
        expect(busy).toBeDisabled();
        expect(screen.getByRole("heading", {name: "Select Data to Migrate"})).toBeInTheDocument();
    });

    it("toasts the API message and keeps selections when the preview fails", async () => {
        renderWizard(vi.fn().mockRejectedValue(new Error("compose file vanished")));

        await userEvent.click(screen.getByRole("button", {name: "Preview Changes"}));

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("compose file vanished"));
        expect(screen.getByRole("heading", {name: "Select Data to Migrate"})).toBeInTheDocument();
        expect(screen.getByRole("checkbox", {name: "pgdata"})).toBeChecked();
    });

    it("falls back to the generic preview error when the rejection is not an Error", async () => {
        renderWizard(vi.fn().mockRejectedValue("boom"));

        await userEvent.click(screen.getByRole("button", {name: "Preview Changes"}));

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith(PREVIEW_FALLBACK));
        expect(screen.getByRole("heading", {name: "Select Data to Migrate"})).toBeInTheDocument();
    });

    describe("extracted .env preview", () => {
        const SECRET_ENV = "DB_PASSWORD=hunter2\nPORT=8080";
        const MASKED_ENV = "DB_PASSWORD=\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\nPORT=8080";

        async function previewWithEnv(extractedEnv: string, onClose = vi.fn()) {
            renderWizard(vi.fn().mockResolvedValue({diff: emptyDiff, extractedEnv, emptySources: [], target: separateTarget}), onClose);
            await userEvent.click(screen.getByRole("button", {name: "Preview Changes"}));
            await screen.findByRole("heading", {name: "Review Changes"});
        }

        it("masks secret values in a read-only editor until revealed", async () => {
            await previewWithEnv(SECRET_ENV);

            expect(screen.getByRole("heading", {name: "New .env file"})).toBeInTheDocument();
            expect(screen.getByRole("textbox", {name: "Extracted .env preview"})).toHaveValue(MASKED_ENV);

            await userEvent.click(screen.getByRole("button", {name: "Show secrets"}));

            expect(screen.getByRole("textbox", {name: "Extracted .env preview"})).toHaveValue(SECRET_ENV);
            expect(screen.getByRole("button", {name: "Hide secrets"})).toBeInTheDocument();
        });

        it("restores the mask after going Back to step 1 and previewing again", async () => {
            await previewWithEnv(SECRET_ENV);
            await userEvent.click(screen.getByRole("button", {name: "Show secrets"}));

            await userEvent.click(screen.getByRole("button", {name: "Back"}));
            await userEvent.click(screen.getByRole("button", {name: "Preview Changes"}));

            expect(await screen.findByRole("textbox", {name: "Extracted .env preview"})).toHaveValue(MASKED_ENV);
        });

        it("restores the mask after the dialog is closed and reopened", async () => {
            const onClose = vi.fn();
            const previewMigration = vi.fn().mockResolvedValue({diff: emptyDiff, extractedEnv: SECRET_ENV, emptySources: [], target: separateTarget});
            const props = {stack, onClose, onConfirmMigrate: vi.fn(), previewMigration};
            const {rerender} = render(<MigrationWizard {...props} open />);
            await userEvent.click(screen.getByRole("button", {name: "Preview Changes"}));
            await userEvent.click(await screen.findByRole("button", {name: "Show secrets"}));

            await userEvent.click(screen.getByRole("button", {name: "Close"}));
            expect(onClose).toHaveBeenCalled();

            // BrownfieldImport unmounts the wizard on close; mirror that, then reopen.
            rerender(<></>);
            rerender(<MigrationWizard {...props} open />);
            await userEvent.click(screen.getByRole("button", {name: "Preview Changes"}));

            expect(await screen.findByRole("textbox", {name: "Extracted .env preview"})).toHaveValue(MASKED_ENV);
        });

        it("offers no reveal button when no key looks secret", async () => {
            await previewWithEnv("PORT=8080");

            expect(screen.getByRole("textbox", {name: "Extracted .env preview"})).toHaveValue("PORT=8080");
            expect(screen.queryByRole("button", {name: "Show secrets"})).toBeNull();
        });

        it("omits the .env block entirely when nothing was extracted", async () => {
            await previewWithEnv("");

            expect(screen.queryByRole("heading", {name: "New .env file"})).toBeNull();
            expect(screen.queryByRole("textbox", {name: "Extracted .env preview"})).toBeNull();
        });
    });

    describe("four-step flow", () => {
        const click = (name: string) => userEvent.click(screen.getByRole("button", {name}));

        async function toStep(target: 2 | 3 | 4, previewMigration: PreviewFn = vi.fn().mockImplementation(okPreview)) {
            const rendered = renderWizard(previewMigration);
            await click("Preview Changes");
            await screen.findByRole("heading", {name: "Review Changes"});
            if (target >= 3) await click("Choose Backup");
            if (target >= 4) await click("Choose Old Stack Action");
            return {...rendered, previewMigration};
        }

        function currentSteps(): string[] {
            const items = within(screen.getByRole("list", {name: "Migration progress"})).getAllByRole("listitem");
            return items.filter((item) => item.getAttribute("aria-current") === "step").map((item) => item.textContent ?? "");
        }

        it("shows Step n of 4 and marks only the current step in the progress list", async () => {
            renderWizard(vi.fn().mockImplementation(okPreview));

            expect(screen.getByText(/Step 1 of 4/)).toBeInTheDocument();
            expect(within(screen.getByRole("list", {name: "Migration progress"})).getAllByRole("listitem")).toHaveLength(4);
            expect(currentSteps()).toEqual(["Select data"]);

            await click("Preview Changes");
            expect(await screen.findByText(/Step 2 of 4/)).toBeInTheDocument();
            expect(currentSteps()).toEqual(["Review changes"]);

            await click("Choose Backup");
            expect(screen.getByText(/Step 3 of 4/)).toBeInTheDocument();
            expect(currentSteps()).toEqual(["Backup"]);

            await click("Choose Old Stack Action");
            expect(screen.getByText(/Step 4 of 4/)).toBeInTheDocument();
            expect(currentSteps()).toEqual(["Old stack"]);
        });

        it("moves focus to the new step body on every step change, forward and back", async () => {
            await toStep(2);
            expect(screen.getByRole("group", {name: "Review changes"})).toHaveFocus();

            await click("Choose Backup");
            expect(screen.getByRole("group", {name: "Backup"})).toHaveFocus();

            await click("Back");
            expect(screen.getByRole("group", {name: "Review changes"})).toHaveFocus();
        });

        it("keeps the selections after Back and regenerates the preview from them", async () => {
            const {previewMigration} = await toStep(2);
            await click("Back");
            expect(screen.getByRole("checkbox", {name: "pgdata"})).toBeChecked();
            await userEvent.click(screen.getByRole("checkbox", {name: "pgdata"}));
            await click("Preview Changes");
            await screen.findByRole("heading", {name: "Review Changes"});
            await click("Back");

            expect(screen.getByRole("checkbox", {name: "pgdata"})).not.toBeChecked();
            expect(previewMigration).toHaveBeenCalledTimes(2);
            expect(previewMigration).toHaveBeenLastCalledWith({
                composePath: "/host/opt/db/docker-compose.yml",
                displayName: "db",
                volumeSelections: [],
                namedVolumeSelections: {pgdata: false},
            });
        });

        it("defaults the backup off with a note naming the untouched original path", async () => {
            await toStep(3);

            expect(screen.getByRole("switch", {name: "Back up the old stack first"})).not.toBeChecked();
            expect(screen.getByText(/Your original stack stays untouched at \/host\/opt\/db/)).toBeInTheDocument();
        });

        it("keeps the backup choice across Back, a regenerated preview and forward", async () => {
            await toStep(3);
            await userEvent.click(screen.getByRole("switch", {name: "Back up the old stack first"}));

            await click("Back");
            await click("Back");
            await click("Preview Changes");
            await screen.findByRole("heading", {name: "Review Changes"});
            await click("Choose Backup");

            expect(screen.getByRole("switch", {name: "Back up the old stack first"})).toBeChecked();
        });

        it("ignores a preview that arrives after the dialog was cancelled", async () => {
            let resolvePreview: (value: MigrationPreview) => void = () => undefined;
            const deferred = new Promise<MigrationPreview>((resolve) => {
                resolvePreview = resolve;
            });
            const {onClose} = renderWizard(vi.fn().mockReturnValue(deferred));

            await click("Preview Changes");
            await click("Cancel Migration");
            expect(onClose).toHaveBeenCalled();
            resolvePreview({diff: emptyDiff, extractedEnv: "", emptySources: [], target: separateTarget});
            await deferred;

            await waitFor(() => expect(screen.getByRole("heading", {name: "Select Data to Migrate"})).toBeInTheDocument());
            expect(screen.queryByRole("heading", {name: "Review Changes"})).toBeNull();
        });

        it("summarises one volume to copy plus the backup and stop choices", async () => {
            await toStep(4);
            const summary = screen.getByRole("region", {name: "Migration summary"});

            expect(summary).toHaveTextContent("Stack name: db");
            expect(summary).toHaveTextContent("Volumes to copy: 1");
            expect(summary).toHaveTextContent("Backup: No");
            expect(summary).toHaveTextContent("Stop old stack: Yes");
            expect(within(summary).queryByText(/Nothing to copy/)).toBeNull();
        });

        it("explains the zero-volume summary and reflects the backup on and the stop off", async () => {
            renderWizard(vi.fn().mockImplementation(okPreview));
            await userEvent.click(screen.getByRole("checkbox", {name: "pgdata"}));
            await click("Preview Changes");
            await screen.findByRole("heading", {name: "Review Changes"});
            await click("Choose Backup");
            await userEvent.click(screen.getByRole("switch", {name: "Back up the old stack first"}));
            await click("Choose Old Stack Action");
            await userEvent.click(screen.getByRole("switch", {name: "Stop the old stack before migrating"}));

            const summary = screen.getByRole("region", {name: "Migration summary"});
            expect(summary).toHaveTextContent("Volumes to copy: 0");
            expect(summary).toHaveTextContent("Nothing to copy. Only the compose file and .env are migrated.");
            expect(summary).toHaveTextContent("Backup: Yes");
            expect(summary).toHaveTextContent("Stop old stack: No");
        });

        it("sends backup true once the user turns the backup on", async () => {
            const {onConfirmMigrate} = await toStep(3);
            await userEvent.click(screen.getByRole("switch", {name: "Back up the old stack first"}));
            await click("Choose Old Stack Action");

            await click("Confirm & Migrate");

            expect(onConfirmMigrate).toHaveBeenCalledWith(expect.objectContaining({backup: true, inPlaceAsideName: null}));
        });

        it("hands off to the parent once with the default flags and closes once", async () => {
            const {onClose, onConfirmMigrate} = await toStep(4);

            await click("Confirm & Migrate");

            expect(onConfirmMigrate).toHaveBeenCalledTimes(1);
            expect(onConfirmMigrate).toHaveBeenCalledWith(
                expect.objectContaining({displayName: "db", backup: false, stopOldStack: true, inPlaceAsideName: null}),
            );
            expect(onClose).toHaveBeenCalledTimes(1);
        });
    });

    describe("in-place migration (G-18-7)", () => {
        const inPlaceTarget: MigrationTarget = {
            stackId: "db",
            directory: "/opt/docktor/stacks/db",
            originalDirectory: "/opt/docktor/stacks/db",
            inPlace: true,
            suggestedAsideName: "db-pre-migration",
            sharedProjectName: null,
        };
        const inPlacePreview = (): Promise<MigrationPreview> =>
            Promise.resolve({diff: emptyDiff, extractedEnv: "", emptySources: [], target: inPlaceTarget});
        const click = (name: string) => userEvent.click(screen.getByRole("button", {name}));

        async function walkTo(target: 3 | 4, onConfirmMigrate = vi.fn()) {
            const previewMigration = vi.fn().mockImplementation(inPlacePreview);
            renderWizard(previewMigration, vi.fn(), onConfirmMigrate);
            await click("Preview Changes");
            await screen.findByRole("heading", {name: "Review Changes"});
            await click("Choose Backup");
            if (target === 4) await click("Choose Old Stack Action");
            return previewMigration;
        }

        it("sends the stack name with the preview request", async () => {
            const previewMigration = await walkTo(3);

            expect(previewMigration).toHaveBeenCalledWith({
                composePath: "/host/opt/db/docker-compose.yml",
                displayName: "db",
                volumeSelections: [],
                namedVolumeSelections: {pgdata: true},
            });
        });

        it("asks for a name for the original directory instead of offering a backup switch", async () => {
            await walkTo(3);

            expect(screen.getByRole("textbox", {name: "Name for the original directory"})).toHaveValue("db-pre-migration");
            expect(
                screen.getByText(/\/opt\/docktor\/stacks\/db is renamed to db-pre-migration and kept as your backup/),
            ).toBeInTheDocument();
            expect(screen.queryByRole("switch", {name: "Back up the old stack first"})).toBeNull();
            expect(screen.getByText("The original directory is kept under a new name as your backup.")).toBeInTheDocument();
        });

        it("forces the old stack to be stopped and summarises the kept original", async () => {
            await walkTo(4);

            const stop = screen.getByRole("switch", {name: "Stop the old stack before migrating"});
            expect(stop).toBeChecked();
            expect(stop).toBeDisabled();
            expect(screen.getByText(/Required for an in-place migration/)).toBeInTheDocument();
            expect(screen.getByRole("region", {name: "Migration summary"})).toHaveTextContent(
                "Backup: Original kept as db-pre-migration",
            );
        });

        it("confirms with the edited aside name, the forced stop and no extra backup copy", async () => {
            const onConfirmMigrate = vi.fn();
            await walkTo(3, onConfirmMigrate);
            const input = screen.getByRole("textbox", {name: "Name for the original directory"});
            await userEvent.clear(input);
            await userEvent.type(input, "db-old");
            await click("Choose Old Stack Action");

            expect(screen.getByRole("region", {name: "Migration summary"})).toHaveTextContent("Backup: Original kept as db-old");
            await click("Confirm & Migrate");

            expect(onConfirmMigrate).toHaveBeenCalledWith(
                expect.objectContaining({inPlaceAsideName: "db-old", stopOldStack: true, backup: false}),
            );
        });

        it("keeps the edited aside name across Back and forward", async () => {
            await walkTo(3);
            const input = screen.getByRole("textbox", {name: "Name for the original directory"});
            await userEvent.clear(input);
            await userEvent.type(input, "db-old");

            await click("Back");
            await click("Choose Backup");

            expect(screen.getByRole("textbox", {name: "Name for the original directory"})).toHaveValue("db-old");
        });

        it.each([
            ["", "Use letters, digits, dots, dashes and underscores; start with a letter or digit."],
            ["../x", "Use letters, digits, dots, dashes and underscores; start with a letter or digit."],
            ["a/b", "Use letters, digits, dots, dashes and underscores; start with a letter or digit."],
            ["db", "Choose a name different from the current directory name."],
        ])("blocks continuing while the aside name %j is invalid", async (name, message) => {
            await walkTo(3);
            const input = screen.getByRole("textbox", {name: "Name for the original directory"});
            await userEvent.clear(input);
            if (name) await userEvent.type(input, name);

            expect(screen.getByText(message)).toBeInTheDocument();
            expect(screen.getByRole("button", {name: "Choose Old Stack Action"})).toBeDisabled();

            await userEvent.clear(input);
            await userEvent.type(input, "db-old");

            expect(screen.queryByText(message)).toBeNull();
            expect(screen.getByRole("button", {name: "Choose Old Stack Action"})).toBeEnabled();
        });

        it("shows the backup switch instead of the name field when a new preview is no longer in place", async () => {
            const previewMigration = vi
                .fn()
                .mockImplementationOnce(inPlacePreview)
                .mockImplementationOnce(okPreview);
            renderWizard(previewMigration);
            await click("Preview Changes");
            await screen.findByRole("heading", {name: "Review Changes"});
            await click("Back");
            await click("Preview Changes");
            await screen.findByRole("heading", {name: "Review Changes"});
            await click("Choose Backup");

            expect(screen.queryByRole("textbox", {name: "Name for the original directory"})).toBeNull();
            expect(screen.getByRole("switch", {name: "Back up the old stack first"})).not.toBeChecked();
        });
    });

    describe("shared compose project name (G-18-22-status)", () => {
        const sharedTarget: MigrationTarget = {...separateTarget, sharedProjectName: {name: "db", source: "directory"}};
        const click = (name: string) => userEvent.click(screen.getByRole("button", {name}));

        async function walkToStep4(target: MigrationTarget, onConfirmMigrate = vi.fn()) {
            const previewMigration = vi
                .fn()
                .mockResolvedValue({diff: emptyDiff, extractedEnv: "", emptySources: [], target});
            renderWizard(previewMigration, vi.fn(), onConfirmMigrate);
            await click("Preview Changes");
            await screen.findByRole("heading", {name: "Review Changes"});
            await click("Choose Backup");
            await click("Choose Old Stack Action");
        }

        it("forces the old stack to be stopped and explains the shared project name", async () => {
            await walkToStep4(sharedTarget);

            const stop = screen.getByRole("switch", {name: "Stop the old stack before migrating"});
            expect(stop).toBeChecked();
            expect(stop).toBeDisabled();
            expect(screen.getByText(/"db"/)).toHaveTextContent(/project name/);
            expect(screen.queryByText(/The old stack keeps running/)).toBeNull();
            expect(screen.getByRole("region", {name: "Migration summary"})).toHaveTextContent("Stop old stack: Yes");
        });

        it.each([
            ["directory", /go back and choose a different stack name/],
            ["compose-file", /set by name: in the compose file/],
            ["env-file", /set by COMPOSE_PROJECT_NAME in the stack's \.env file/],
        ] as const)("names where the shared name comes from (%s)", async (source, sentence) => {
            await walkToStep4({...separateTarget, sharedProjectName: {name: "db", source}});

            expect(screen.getByText(/Docker Compose project name "db"/)).toHaveTextContent(sentence);
        });

        it("confirms with stopOldStack true", async () => {
            const onConfirmMigrate = vi.fn();
            await walkToStep4(sharedTarget, onConfirmMigrate);

            await click("Confirm & Migrate");

            expect(onConfirmMigrate).toHaveBeenCalledWith(expect.objectContaining({stopOldStack: true}));
        });

        it("lets the user keep the old stack running when no project name is shared", async () => {
            await walkToStep4(separateTarget);

            const stop = screen.getByRole("switch", {name: "Stop the old stack before migrating"});
            expect(stop).toBeEnabled();
            await userEvent.click(stop);

            expect(stop).not.toBeChecked();
            expect(screen.getByText(/The old stack keeps running/)).toBeInTheDocument();
        });
    });

    describe("relative bind mounts (G-18-4)", () => {
        const memosStack: DiscoveredStack = {...stack, namedVolumes: [], relativePaths: ["./data"]};
        const DATA_SELECTION = [{originalPath: "./data", newPath: "./volumes/data", convert: true}];
        const click = (name: string) => userEvent.click(screen.getByRole("button", {name}));

        async function walkToStep4(onConfirmMigrate = vi.fn()) {
            const previewMigration = vi.fn().mockImplementation(okPreview);
            renderWizard(previewMigration, vi.fn(), onConfirmMigrate, memosStack);
            await click("Preview Changes");
            await screen.findByRole("heading", {name: "Review Changes"});
            await click("Choose Backup");
            await click("Choose Old Stack Action");
            return previewMigration;
        }

        it("lists the relative mount in its own section, moved into ./volumes/ by default", () => {
            renderWizard(vi.fn(), vi.fn(), vi.fn(), memosStack);

            expect(screen.getByText("Relative Bind Mounts")).toBeInTheDocument();
            expect(screen.getByRole("checkbox", {name: "./data"})).toBeChecked();
        });

        it("sends the mount as ./data -> ./volumes/data in the preview request", async () => {
            const previewMigration = vi.fn().mockImplementation(okPreview);
            renderWizard(previewMigration, vi.fn(), vi.fn(), memosStack);

            await click("Preview Changes");

            expect(previewMigration).toHaveBeenCalledWith({
                composePath: "/host/opt/db/docker-compose.yml",
                displayName: "db",
                volumeSelections: DATA_SELECTION,
                namedVolumeSelections: {},
            });
        });

        it("counts the mount in the summary and hands the same selections to the migrate request", async () => {
            const onConfirmMigrate = vi.fn();
            await walkToStep4(onConfirmMigrate);

            expect(screen.getByRole("region", {name: "Migration summary"})).toHaveTextContent("Volumes to copy: 1");

            await click("Confirm & Migrate");

            expect(onConfirmMigrate).toHaveBeenCalledWith(expect.objectContaining({volumeSelections: DATA_SELECTION}));
        });

        const KEPT_WARNING =
            "Stays at ./data in the new stack directory, outside Docktor's managed ./volumes/ layout, so Storage does not count it. It is still copied, and stack backups include it.";

        it("warns when a relative mount is kept, and then previews it at its own path while still counting it", async () => {
            const previewMigration = vi.fn().mockImplementation(okPreview);
            renderWizard(previewMigration, vi.fn(), vi.fn(), memosStack);
            expect(screen.queryByText(KEPT_WARNING)).toBeNull();

            await userEvent.click(screen.getByRole("checkbox", {name: "./data"}));

            expect(screen.getByText(KEPT_WARNING)).toBeInTheDocument();
            await click("Preview Changes");
            expect(previewMigration).toHaveBeenCalledWith({
                composePath: "/host/opt/db/docker-compose.yml",
                displayName: "db",
                volumeSelections: [{originalPath: "./data", newPath: "./data", convert: true}],
                namedVolumeSelections: {},
            });
            await screen.findByRole("heading", {name: "Review Changes"});
            await click("Choose Backup");
            await click("Choose Old Stack Action");
            expect(screen.getByRole("region", {name: "Migration summary"})).toHaveTextContent("Volumes to copy: 1");
        });

        it("only lets a mount outside the stack directory move into ./volumes/", () => {
            renderWizard(vi.fn(), vi.fn(), vi.fn(), {...memosStack, relativePaths: ["../shared"]});

            const checkbox = screen.getByRole("checkbox", {name: "../shared"});
            expect(checkbox).toBeChecked();
            expect(checkbox).toBeDisabled();
            expect(
                screen.getByText("Points outside the stack directory, so it is moved to ./volumes/shared."),
            ).toBeInTheDocument();
        });

        it("only lets the stack directory itself be kept, copying its files into the new stack directory", () => {
            renderWizard(vi.fn(), vi.fn(), vi.fn(), {...memosStack, relativePaths: ["."]});

            const checkbox = screen.getByRole("checkbox", {name: "."});
            expect(checkbox).not.toBeChecked();
            expect(checkbox).toBeDisabled();
            expect(
                screen.getByText("This is the stack directory itself; its files are copied into the new stack directory."),
            ).toBeInTheDocument();
        });
    });
});
