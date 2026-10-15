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

function renderWizard(previewMigration: PreviewFn, onClose = vi.fn()) {
    render(
        <MigrationWizard
            stack={stack}
            open
            onClose={onClose}
            onConfirmMigrate={vi.fn()}
            previewMigration={previewMigration}
        />,
    );
    return {onClose};
}

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
});
