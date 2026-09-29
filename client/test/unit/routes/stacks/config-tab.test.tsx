import {describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {ConfigTab} from "@/routes/app/stacks/components/config-tab";
import type {StackConfigFiles} from "@/hooks/use-stack-config-files";
import type {ComposeEditorProps} from "@/components/domain/stack/compose-editor";

// CodeMirror itself is covered by 11-09 Task 2's own tests
// (yaml-syntax-linter.test.ts, code-editor.test.tsx) — mock ComposeEditor
// here with a minimal controlled textarea exposing the same aria-label so
// this file only asserts ConfigTab's wiring to `files`.
vi.mock("@/components/domain/stack/compose-editor", () => ({
    ComposeEditor: ({value, onChange, ariaLabel = "Docker Compose File"}: ComposeEditorProps) => (
        <textarea data-testid="compose-editor-mock" aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} />
    ),
}));

function makeFiles(overrides: Partial<StackConfigFiles> = {}): StackConfigFiles {
    return {
        composeContent: "services:\n  web:\n    image: nginx\n",
        envContent: "FOO=bar",
        composeDirty: false,
        envDirty: false,
        isDirty: false,
        setComposeContent: vi.fn(),
        setEnvContent: vi.fn(),
        saveCompose: vi.fn(),
        saveEnv: vi.fn(),
        ...overrides,
    };
}

describe("ConfigTab", () => {
    it("renders both section headings", () => {
        render(<ConfigTab files={makeFiles()} />);
        expect(screen.getByRole("heading", {name: "Compose File"})).toBeVisible();
        expect(screen.getByRole("heading", {name: "Environment Variables"})).toBeVisible();
    });

    it("renders the two named textboxes with their content", () => {
        render(<ConfigTab files={makeFiles()} />);
        expect(screen.getByRole("textbox", {name: "Docker Compose File"})).toHaveValue(
            "services:\n  web:\n    image: nginx\n",
        );
        expect(screen.getByRole("textbox", {name: "Environment Variables"})).toHaveValue("FOO=bar");
    });

    it("disables both Save buttons until the matching file is dirty", () => {
        render(<ConfigTab files={makeFiles({composeDirty: false, envDirty: false})} />);
        expect(screen.getByRole("button", {name: "Save compose file"})).toBeDisabled();
        expect(screen.getByRole("button", {name: "Save environment variables"})).toBeDisabled();
    });

    it("enables Save compose file once composeDirty is true and calls saveCompose on click", async () => {
        const files = makeFiles({composeDirty: true});
        render(<ConfigTab files={files} />);
        const button = screen.getByRole("button", {name: "Save compose file"});
        expect(button).toBeEnabled();

        await userEvent.click(button);
        expect(files.saveCompose).toHaveBeenCalledTimes(1);
    });

    it("enables Save environment variables once envDirty is true and calls saveEnv on click", async () => {
        const files = makeFiles({envDirty: true});
        render(<ConfigTab files={files} />);
        const button = screen.getByRole("button", {name: "Save environment variables"});
        expect(button).toBeEnabled();

        await userEvent.click(button);
        expect(files.saveEnv).toHaveBeenCalledTimes(1);
    });

    it("calls setComposeContent when the compose textbox changes", async () => {
        const files = makeFiles();
        render(<ConfigTab files={files} />);
        const textarea = screen.getByRole("textbox", {name: "Docker Compose File"});

        await userEvent.type(textarea, "x");
        expect(files.setComposeContent).toHaveBeenCalled();
    });

    it("calls setEnvContent when the environment textbox changes", async () => {
        const files = makeFiles();
        render(<ConfigTab files={files} />);
        const textarea = screen.getByRole("textbox", {name: "Environment Variables"});

        await userEvent.type(textarea, "x");
        expect(files.setEnvContent).toHaveBeenCalled();
    });

    it("renders no Card component (D-03)", () => {
        const {container} = render(<ConfigTab files={makeFiles()} />);
        expect(container.querySelector('[data-slot="card"]')).toBeNull();
    });

    it("renders the Compose File section via ComposeEditor, not a plain textarea (D-18)", () => {
        render(<ConfigTab files={makeFiles()} />);
        expect(screen.getByTestId("compose-editor-mock")).toBeInTheDocument();
    });

    it("keeps the Environment section on a plain textarea (11-12 owns replacing it)", () => {
        render(<ConfigTab files={makeFiles()} />);
        const envBox = screen.getByRole("textbox", {name: "Environment Variables"});
        expect(envBox.tagName).toBe("TEXTAREA");
        expect(envBox).not.toHaveAttribute("data-testid", "compose-editor-mock");
    });
});
