import {describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {ConfigTab} from "@/routes/app/stacks/components/config-tab";
import type {StackConfigFiles} from "@/hooks/use-stack-config-files";
import type {ComposeEditorProps} from "@/components/domain/stack/compose-editor";
import type {EnvEditorProps} from "@/components/domain/stack/env-editor";

// CodeMirror itself is covered by 11-09/11-12's own component tests — mock
// both editors here with minimal controlled stubs exposing the same
// aria-label/callbacks so this file only asserts ConfigTab's wiring to
// `files` (and, for env, the envValid state introduced by 11-12).
vi.mock("@/components/domain/stack/compose-editor", () => ({
    ComposeEditor: ({value, onChange, ariaLabel = "Docker Compose File"}: ComposeEditorProps) => (
        <textarea data-testid="compose-editor-mock" aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} />
    ),
}));

vi.mock("@/components/domain/stack/env-editor", () => ({
    EnvEditor: ({value, onChange, onValidityChange, ariaLabel = "Environment Variables"}: EnvEditorProps) => (
        <div data-testid="env-editor-mock">
            <textarea aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} />
            <button type="button" onClick={() => onValidityChange(false)}>
                Make env invalid
            </button>
            <button type="button" onClick={() => onValidityChange(true)}>
                Make env valid
            </button>
        </div>
    ),
}));

function makeFiles(overrides: Partial<StackConfigFiles> = {}): StackConfigFiles {
    return {
        composeContent: "services:\n  web:\n    image: nginx\n",
        envContent: "FOO=bar",
        composeDirty: false,
        envDirty: false,
        isDirty: false,
        unsavedSummary: null,
        review: null,
        reviewPending: false,
        setComposeContent: vi.fn(),
        setEnvContent: vi.fn(),
        saveCompose: vi.fn(),
        saveEnv: vi.fn(),
        confirmReview: vi.fn(),
        cancelReview: vi.fn(),
        ...overrides,
    };
}

describe("ConfigTab", () => {
    it("renders both section headings", () => {
        render(<ConfigTab files={makeFiles()} stackName="My App" />);
        expect(screen.getByRole("heading", {name: "Compose File"})).toBeVisible();
        expect(screen.getByRole("heading", {name: "Environment Variables"})).toBeVisible();
    });

    it("renders the two named textboxes with their content", () => {
        render(<ConfigTab files={makeFiles()} stackName="My App" />);
        expect(screen.getByRole("textbox", {name: "Docker Compose File"})).toHaveValue(
            "services:\n  web:\n    image: nginx\n",
        );
        expect(screen.getByRole("textbox", {name: "Environment Variables"})).toHaveValue("FOO=bar");
    });

    it("disables both Save buttons until the matching file is dirty", () => {
        render(<ConfigTab files={makeFiles({composeDirty: false, envDirty: false})} stackName="My App" />);
        expect(screen.getByRole("button", {name: "Save compose file"})).toBeDisabled();
        expect(screen.getByRole("button", {name: "Save environment variables"})).toBeDisabled();
    });

    it("enables Save compose file once composeDirty is true and calls saveCompose on click", async () => {
        const files = makeFiles({composeDirty: true});
        render(<ConfigTab files={files} stackName="My App" />);
        const button = screen.getByRole("button", {name: "Save compose file"});
        expect(button).toBeEnabled();

        await userEvent.click(button);
        expect(files.saveCompose).toHaveBeenCalledTimes(1);
    });

    it("enables Save environment variables once envDirty is true (editor valid by default) and calls saveEnv on click", async () => {
        const files = makeFiles({envDirty: true});
        render(<ConfigTab files={files} stackName="My App" />);
        const button = screen.getByRole("button", {name: "Save environment variables"});
        expect(button).toBeEnabled();

        await userEvent.click(button);
        expect(files.saveEnv).toHaveBeenCalledTimes(1);
    });

    it("keeps Save environment variables disabled when the editor reports invalid, even though envDirty is true", async () => {
        const files = makeFiles({envDirty: true});
        render(<ConfigTab files={files} stackName="My App" />);
        const button = screen.getByRole("button", {name: "Save environment variables"});
        expect(button).toBeEnabled();

        await userEvent.click(screen.getByRole("button", {name: "Make env invalid"}));
        expect(button).toBeDisabled();

        await userEvent.click(screen.getByRole("button", {name: "Make env valid"}));
        expect(button).toBeEnabled();
    });

    it("disables both Save buttons while reviewPending is true, even if dirty", () => {
        const files = makeFiles({composeDirty: true, envDirty: true, reviewPending: true});
        render(<ConfigTab files={files} stackName="My App" />);
        expect(screen.getByRole("button", {name: "Save compose file"})).toBeDisabled();
        expect(screen.getByRole("button", {name: "Save environment variables"})).toBeDisabled();
    });

    it("calls setComposeContent when the compose textbox changes", async () => {
        const files = makeFiles();
        render(<ConfigTab files={files} stackName="My App" />);
        const textarea = screen.getByRole("textbox", {name: "Docker Compose File"});

        await userEvent.type(textarea, "x");
        expect(files.setComposeContent).toHaveBeenCalled();
    });

    it("calls setEnvContent when the environment textbox changes", async () => {
        const files = makeFiles();
        render(<ConfigTab files={files} stackName="My App" />);
        const textarea = screen.getByRole("textbox", {name: "Environment Variables"});

        await userEvent.type(textarea, "x");
        expect(files.setEnvContent).toHaveBeenCalled();
    });

    it("renders no Card component (D-03)", () => {
        const {container} = render(<ConfigTab files={makeFiles()} stackName="My App" />);
        expect(container.querySelector('[data-slot="card"]')).toBeNull();
    });

    it("renders the Compose File section via ComposeEditor, not a plain textarea (D-18)", () => {
        render(<ConfigTab files={makeFiles()} stackName="My App" />);
        expect(screen.getByTestId("compose-editor-mock")).toBeInTheDocument();
    });

    it("renders the Environment section via EnvEditor, not a plain textarea (D-20/D-21)", () => {
        render(<ConfigTab files={makeFiles()} stackName="My App" />);
        expect(screen.getByTestId("env-editor-mock")).toBeInTheDocument();
    });

    describe("Issue #18/D-01/D-03: DiffConfirmDialog wiring", () => {
        const sampleDiff = {
            added: 1,
            removed: 0,
            hunks: [
                {
                    oldStart: 1,
                    oldLines: 0,
                    newStart: 1,
                    newLines: 1,
                    lines: [{kind: "added" as const, text: "new line", oldLine: null, newLine: 1}],
                },
            ],
        };

        it("opens the dialog with the compose diff when files.review.file is compose", () => {
            const files = makeFiles({
                review: {file: "compose", preview: {hasChanges: true, confirmationRequired: true, compose: sampleDiff, env: null}},
            });
            render(<ConfigTab files={files} stackName="My App" />);

            expect(screen.getByRole("alertdialog")).toBeVisible();
            expect(screen.getByText("Review changes to My App")).toBeVisible();
            expect(screen.getByText("new line")).toBeVisible();
        });

        it("opens the dialog with the env diff and env title when files.review.file is env", () => {
            const files = makeFiles({
                review: {file: "env", preview: {hasChanges: true, confirmationRequired: true, compose: null, env: sampleDiff}},
            });
            render(<ConfigTab files={files} stackName="My App" />);

            expect(screen.getByText("Review changes to My App's environment")).toBeVisible();
        });

        it("is closed when files.review is null", () => {
            render(<ConfigTab files={makeFiles({review: null})} stackName="My App" />);
            expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
        });

        it("wires Confirm & Apply / Keep Editing to confirmReview/cancelReview", async () => {
            const files = makeFiles({
                review: {file: "compose", preview: {hasChanges: true, confirmationRequired: true, compose: sampleDiff, env: null}},
            });
            render(<ConfigTab files={files} stackName="My App" />);

            await userEvent.click(screen.getByRole("button", {name: "Confirm & Apply"}));
            expect(files.confirmReview).toHaveBeenCalledTimes(1);

            await userEvent.click(screen.getByRole("button", {name: "Keep Editing"}));
            expect(files.cancelReview).toHaveBeenCalledTimes(1);
        });
    });
});
