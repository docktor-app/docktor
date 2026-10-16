import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {toast} from "sonner";
import {MigrationWizard} from "@/routes/setup/components/migration-wizard";
import type {DiscoveredStack, MigrationPreview} from "@/lib/brownfield-types";
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

type PreviewFn = (
    composePath: string,
    volumeSelections: unknown[],
    namedVolumeSelections: Record<string, boolean>,
) => Promise<MigrationPreview>;

function renderWizard(previewMigration: PreviewFn, onClose = vi.fn(), onConfirmMigrate = vi.fn()) {
    render(
        <MigrationWizard
            stack={stack}
            open
            onClose={onClose}
            onConfirmMigrate={onConfirmMigrate}
            previewMigration={previewMigration}
        />,
    );
    return {onClose, onConfirmMigrate};
}

const okPreview = (): Promise<MigrationPreview> => Promise.resolve({diff: emptyDiff, extractedEnv: ""});

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
        const previewMigration = vi.fn().mockResolvedValue({diff: sampleDiff, extractedEnv: ""});
        renderWizard(previewMigration);

        await userEvent.click(screen.getByRole("button", {name: "Preview Changes"}));

        expect(previewMigration).toHaveBeenCalledTimes(1);
        expect(previewMigration).toHaveBeenCalledWith("/host/opt/db/docker-compose.yml", [], {pgdata: true});

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
        renderWizard(vi.fn().mockResolvedValue({diff: emptyDiff, extractedEnv: ""}));

        await userEvent.click(screen.getByRole("button", {name: "Preview Changes"}));

        expect(await screen.findByText("No changes to your compose file.")).toBeInTheDocument();
        expect(screen.getByText("The compose file is migrated as-is. Continue to choose a backup.")).toBeInTheDocument();
        expect(screen.getByText("+0")).toBeInTheDocument();
        expect(screen.getByText("−0")).toBeInTheDocument();
        expect(screen.queryByRole("region", {name: "Migration compose diff"})).toBeNull();
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
            renderWizard(vi.fn().mockResolvedValue({diff: emptyDiff, extractedEnv}), onClose);
            await userEvent.click(screen.getByRole("button", {name: "Preview Changes"}));
            await screen.findByRole("heading", {name: "Review Changes"});
        }

        it("masks secret values in a read-only editor until revealed", async () => {
            await previewWithEnv(SECRET_ENV);

            expect(screen.getByRole("heading", {name: "New .env file"})).toBeInTheDocument();
            expect(screen.getByRole("textbox", {name: "Extracted .env preview"})).toHaveValue(MASKED_ENV);

            await userEvent.click(screen.getByRole("button", {name: "Show secret values"}));

            expect(screen.getByRole("textbox", {name: "Extracted .env preview"})).toHaveValue(SECRET_ENV);
            expect(screen.getByRole("button", {name: "Hide secret values"})).toBeInTheDocument();
        });

        it("restores the mask after going Back to step 1 and previewing again", async () => {
            await previewWithEnv(SECRET_ENV);
            await userEvent.click(screen.getByRole("button", {name: "Show secret values"}));

            await userEvent.click(screen.getByRole("button", {name: "Back"}));
            await userEvent.click(screen.getByRole("button", {name: "Preview Changes"}));

            expect(await screen.findByRole("textbox", {name: "Extracted .env preview"})).toHaveValue(MASKED_ENV);
        });

        it("restores the mask after the dialog is closed and reopened", async () => {
            const onClose = vi.fn();
            const previewMigration = vi.fn().mockResolvedValue({diff: emptyDiff, extractedEnv: SECRET_ENV});
            const props = {stack, onClose, onConfirmMigrate: vi.fn(), previewMigration};
            const {rerender} = render(<MigrationWizard {...props} open />);
            await userEvent.click(screen.getByRole("button", {name: "Preview Changes"}));
            await userEvent.click(await screen.findByRole("button", {name: "Show secret values"}));

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
            expect(screen.queryByRole("button", {name: "Show secret values"})).toBeNull();
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
            expect(previewMigration).toHaveBeenLastCalledWith("/host/opt/db/docker-compose.yml", [], {pgdata: false});
        });

        it("keeps the backup choice across Back and forward", async () => {
            await toStep(3);
            await userEvent.click(screen.getByRole("switch", {name: "Back up the old stack first"}));

            await click("Back");
            await click("Choose Backup");

            expect(screen.getByRole("switch", {name: "Back up the old stack first"})).not.toBeChecked();
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
            resolvePreview({diff: emptyDiff, extractedEnv: ""});
            await deferred;

            await waitFor(() => expect(screen.getByRole("heading", {name: "Select Data to Migrate"})).toBeInTheDocument());
            expect(screen.queryByRole("heading", {name: "Review Changes"})).toBeNull();
        });

        it("summarises one volume to copy plus the backup and stop choices", async () => {
            await toStep(4);
            const summary = screen.getByRole("region", {name: "Migration summary"});

            expect(summary).toHaveTextContent("Stack name: db");
            expect(summary).toHaveTextContent("Volumes to copy: 1");
            expect(summary).toHaveTextContent("Backup: Yes");
            expect(summary).toHaveTextContent("Stop old stack: Yes");
            expect(within(summary).queryByText(/Nothing to copy/)).toBeNull();
        });

        it("explains the zero-volume summary and reflects both switches turned off", async () => {
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
            expect(summary).toHaveTextContent("Backup: No");
            expect(summary).toHaveTextContent("Stop old stack: No");
        });

        it("hands off to the parent once with both flags and closes once", async () => {
            const {onClose, onConfirmMigrate} = await toStep(4);

            await click("Confirm & Migrate");

            expect(onConfirmMigrate).toHaveBeenCalledTimes(1);
            expect(onConfirmMigrate).toHaveBeenCalledWith(
                expect.objectContaining({displayName: "db", backup: true, stopOldStack: true}),
            );
            expect(onClose).toHaveBeenCalledTimes(1);
        });
    });
});
