import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {toast} from "sonner";
import {MigrationWizard} from "@/routes/setup/components/migration-wizard";
import type {DiscoveredStack, MigrationPreview} from "@/lib/brownfield-types";
import type {UnifiedDiff} from "@/lib/stacks-api";

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
});
