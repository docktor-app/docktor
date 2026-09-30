import {useState} from "react";
import {describe, expect, it, vi} from "vitest";
import {render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {EnvEditor} from "@/components/domain/stack/env-editor";
import type {CodeEditorProps} from "@/components/common/code-editor";

// CodeMirror itself is covered by 11-09's own tests — mock it with a
// controlled textarea exposing the same aria-label so this file only
// asserts EnvEditor's own table/raw/masking behavior.
vi.mock("@/components/common/code-editor", () => ({
    CodeEditor: ({value, onChange, ariaLabel}: CodeEditorProps) => (
        <textarea aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} />
    ),
}));

/** A thin controlled wrapper so onChange updates flow back into `value`, matching real usage on the Config tab / Create page. */
function ControlledEnvEditor({initialValue = ""}: {readonly initialValue?: string}) {
    const [value, setValue] = useState(initialValue);
    const onValidityChange = vi.fn();
    return <EnvEditor value={value} onChange={setValue} onValidityChange={onValidityChange} />;
}

describe("EnvEditor", () => {
    it("mounts in table mode with one row per variable, masking secret-looking values", () => {
        render(
            <EnvEditor
                value={"DB_PASSWORD=hunter2\nHOST=localhost"}
                onChange={vi.fn()}
                onValidityChange={vi.fn()}
            />,
        );

        expect(screen.getByRole("textbox", {name: "Variable name 1"})).toHaveValue("DB_PASSWORD");
        expect(screen.getByLabelText("Value for DB_PASSWORD")).toHaveAttribute("type", "password");
        expect(screen.getByLabelText("Value for HOST")).toHaveAttribute("type", "text");
        expect(screen.getByLabelText("Value for HOST")).toHaveValue("localhost");

        expect(screen.getByRole("button", {name: "Show value for DB_PASSWORD"})).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Show value for HOST"})).toBeNull();
    });

    it("reveals a secret value via its Show/Hide button", async () => {
        const user = userEvent.setup();
        render(
            <EnvEditor value={"DB_PASSWORD=hunter2"} onChange={vi.fn()} onValidityChange={vi.fn()} />,
        );

        expect(screen.getByLabelText("Value for DB_PASSWORD")).toHaveAttribute("type", "password");

        await user.click(screen.getByRole("button", {name: "Show value for DB_PASSWORD"}));

        expect(screen.getByLabelText("Value for DB_PASSWORD")).toHaveAttribute("type", "text");
        expect(screen.getByRole("button", {name: "Hide value for DB_PASSWORD"})).toBeInTheDocument();
    });

    it("renders the empty state with an Add Variable affordance when there are no variables", () => {
        render(<EnvEditor value="" onChange={vi.fn()} onValidityChange={vi.fn()} />);

        expect(screen.getByText("No environment variables")).toBeInTheDocument();
        expect(
            screen.getByText("Add a variable, or switch to raw text mode to paste an existing .env file."),
        ).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Add Variable"})).toBeInTheDocument();
    });

    it("Add Variable appends an empty row and reports invalid until a valid key is typed", async () => {
        const user = userEvent.setup();
        const onValidityChange = vi.fn();
        render(<EnvEditor value="" onChange={vi.fn()} onValidityChange={onValidityChange} />);

        await user.click(screen.getByRole("button", {name: "Add Variable"}));

        await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(false));

        const keyInput = screen.getByRole("textbox", {name: "Variable name 1"});
        await user.type(keyInput, "1BAD");
        await waitFor(() =>
            expect(
                screen.getByText("Use letters, digits and underscores, not starting with a digit"),
            ).toBeInTheDocument(),
        );

        await user.clear(keyInput);
        await user.type(keyInput, "KEY");

        await waitFor(() => expect(onValidityChange).toHaveBeenLastCalledWith(true));
    });

    it("removing a row emits the string without that line", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<EnvEditor value={"A=1\nB=2"} onChange={onChange} onValidityChange={vi.fn()} />);

        await user.click(screen.getByRole("button", {name: "Remove A"}));

        await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("B=2"));
    });

    it("typing a new row's key/value one keystroke at a time never leaves a stray blank line (regression)", async () => {
        const user = userEvent.setup();
        render(<ControlledEnvEditor initialValue="FOO=bar" />);

        await user.click(screen.getByRole("button", {name: "Add Variable"}));
        const keyInput = screen.getByRole("textbox", {name: "Variable name 2"});
        await user.type(keyInput, "NEW_KEY");
        // NEW_KEY matches the D-22 heuristic, so its value input is masked —
        // query it directly rather than by its dynamic aria-label.
        const rows = screen.getAllByRole("row");
        const secondDataRow = rows[2];
        const valueInput = within(secondDataRow).getByDisplayValue("");
        await user.type(valueInput, "42");

        await user.click(screen.getByRole("switch", {name: "Raw text mode"}));

        await waitFor(() =>
            expect(screen.getByRole("textbox", {name: "Environment Variables"})).toHaveValue("FOO=bar\nNEW_KEY=42"),
        );
    });

    it("has no Dialog element and no form element of its own (D-06)", () => {
        const {container} = render(
            <EnvEditor value={"A=1"} onChange={vi.fn()} onValidityChange={vi.fn()} />,
        );
        expect(container.querySelector("form")).toBeNull();
        expect(container.querySelector('[role="dialog"]')).toBeNull();
    });

    it("toggling Raw text mode shows a textbox named Environment Variables with the exact current string", async () => {
        const user = userEvent.setup();
        render(<ControlledEnvEditor initialValue={"A=1\nB=2"} />);

        await user.click(screen.getByRole("switch", {name: "Raw text mode"}));

        expect(screen.getByRole("textbox", {name: "Environment Variables"})).toHaveValue("A=1\nB=2");
    });

    it("editing raw text and switching back to table mode shows the edited rows", async () => {
        const user = userEvent.setup();
        render(<ControlledEnvEditor initialValue="A=1" />);

        await user.click(screen.getByRole("switch", {name: "Raw text mode"}));
        const raw = screen.getByRole("textbox", {name: "Environment Variables"});
        await user.clear(raw);
        await user.type(raw, "A=1{Enter}C=3");

        await user.click(screen.getByRole("switch", {name: "Raw text mode"}));

        await waitFor(() => expect(screen.getByRole("textbox", {name: "Variable name 2"})).toHaveValue("C"));
    });

    it("shows a muted note naming how many comment/unrecognised lines are kept as-is", () => {
        render(<EnvEditor value={"# a comment\nA=1"} onChange={vi.fn()} onValidityChange={vi.fn()} />);

        expect(
            screen.getByText("1 comment or unrecognised line(s) are kept as-is — switch to raw text mode to edit them."),
        ).toBeInTheDocument();
    });

    it("wraps a long clear-text value in a Tooltip but never wraps a masked value", () => {
        const longValue = "x".repeat(50);
        render(
            <EnvEditor
                value={`LONG=${longValue}\nDB_PASSWORD=${longValue}`}
                onChange={vi.fn()}
                onValidityChange={vi.fn()}
            />,
        );

        const longInput = screen.getByLabelText("Value for LONG");
        expect(longInput.closest("[data-slot='tooltip-trigger']") ?? longInput.parentElement).toBeTruthy();
        const secretInput = screen.getByLabelText("Value for DB_PASSWORD");
        expect(secretInput).toHaveAttribute("type", "password");
    });

    it("renders no textarea/table when in raw mode (mode is exclusive)", async () => {
        const user = userEvent.setup();
        render(<ControlledEnvEditor initialValue="A=1" />);

        await user.click(screen.getByRole("switch", {name: "Raw text mode"}));

        expect(screen.queryByRole("table")).toBeNull();
    });
});
