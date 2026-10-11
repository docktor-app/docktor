import {describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {RecoveryCodesPanel} from "@/components/domain/auth/recovery-codes-panel";

// jsdom has no ResizeObserver; Radix's Checkbox requires one on mount.
if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}

const CODES = Array.from({length: 10}, (_, index) => `code${index}-abcde`);

describe("RecoveryCodesPanel", () => {
    it("renders the shown-once notice", () => {
        render(<RecoveryCodesPanel codes={CODES} saved={false} onSavedChange={vi.fn()}/>);

        expect(
            screen.getByText(/You will not see these codes again\. Each one works once\./),
        ).toBeInTheDocument();
    });

    it("lists exactly the 10 codes as list items in a two-column mono grid", () => {
        render(<RecoveryCodesPanel codes={CODES} saved={false} onSavedChange={vi.fn()}/>);

        const items = screen.getAllByRole("listitem");
        expect(items).toHaveLength(10);
        expect(items.map((item) => item.textContent)).toEqual(CODES);
        expect(items[0]).toHaveClass("font-mono");
        expect(screen.getByRole("list")).toHaveClass("grid-cols-2");
    });

    it("reflects the saved prop on the checkbox", () => {
        const {rerender} = render(<RecoveryCodesPanel codes={CODES} saved={false} onSavedChange={vi.fn()}/>);
        expect(screen.getByRole("checkbox", {name: "I have saved these recovery codes"})).not.toBeChecked();

        rerender(<RecoveryCodesPanel codes={CODES} saved onSavedChange={vi.fn()}/>);

        expect(screen.getByRole("checkbox", {name: "I have saved these recovery codes"})).toBeChecked();
    });

    it("reports checkbox changes through onSavedChange", async () => {
        const user = userEvent.setup();
        const onSavedChange = vi.fn();
        render(<RecoveryCodesPanel codes={CODES} saved={false} onSavedChange={onSavedChange}/>);

        await user.click(screen.getByRole("checkbox", {name: "I have saved these recovery codes"}));

        expect(onSavedChange).toHaveBeenCalledWith(true);
    });
});
