import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {act, fireEvent, render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {toast} from "sonner";
import {RecoveryCodesPanel} from "@/components/domain/auth/recovery-codes-panel";

// jsdom has no ResizeObserver; Radix's Checkbox requires one on mount.
if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}

vi.mock("sonner", () => ({
    toast: {success: vi.fn(), error: vi.fn()},
}));

const CODES = Array.from({length: 10}, (_, index) => `code${index}-abcde`);
const COPY_FAILED = "Couldn't copy. Select the codes and copy them manually.";

function renderPanel(props?: Partial<React.ComponentProps<typeof RecoveryCodesPanel>>) {
    return render(<RecoveryCodesPanel codes={CODES} saved={false} onSavedChange={vi.fn()} {...props}/>);
}

function setClipboard(value: unknown) {
    Object.defineProperty(navigator, "clipboard", {value, configurable: true});
}

describe("RecoveryCodesPanel", () => {
    beforeEach(() => {
        vi.mocked(toast.error).mockReset();
    });

    it("renders the shown-once notice", () => {
        renderPanel();

        expect(
            screen.getByText(/You will not see these codes again\. Each one works once\./),
        ).toBeInTheDocument();
    });

    it("lists exactly the 10 codes as list items in a two-column mono grid", () => {
        renderPanel();

        const items = screen.getAllByRole("listitem");
        expect(items).toHaveLength(10);
        expect(items.map((item) => item.textContent)).toEqual(CODES);
        expect(items[0]).toHaveClass("font-mono");
        expect(screen.getByRole("list")).toHaveClass("grid-cols-2");
    });

    it("reflects the saved prop on the checkbox", () => {
        const {rerender} = renderPanel();
        expect(screen.getByRole("checkbox", {name: "I have saved these recovery codes"})).not.toBeChecked();

        rerender(<RecoveryCodesPanel codes={CODES} saved onSavedChange={vi.fn()}/>);

        expect(screen.getByRole("checkbox", {name: "I have saved these recovery codes"})).toBeChecked();
    });

    it("reports checkbox changes through onSavedChange", async () => {
        const user = userEvent.setup();
        const onSavedChange = vi.fn();
        renderPanel({onSavedChange});

        await user.click(screen.getByRole("checkbox", {name: "I have saved these recovery codes"}));

        expect(onSavedChange).toHaveBeenCalledWith(true);
    });

    describe("Copy codes", () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        it("writes the codes joined by newlines, shows Copied, and reverts after 2 seconds", async () => {
            // fireEvent rather than user-event: user-event's own timers deadlock under fake timers.
            vi.useFakeTimers();
            const writeText = vi.fn().mockResolvedValue(undefined);
            renderPanel();
            setClipboard({writeText});

            await act(async () => {
                fireEvent.click(screen.getByRole("button", {name: "Copy codes"}));
            });

            expect(writeText).toHaveBeenCalledWith(CODES.join("\n"));
            expect(screen.getByRole("button", {name: "Copied"})).toBeInTheDocument();

            act(() => {
                vi.advanceTimersByTime(1999);
            });
            expect(screen.getByRole("button", {name: "Copied"})).toBeInTheDocument();

            act(() => {
                vi.advanceTimersByTime(1);
            });
            expect(screen.getByRole("button", {name: "Copy codes"})).toBeInTheDocument();
        });

        it("toasts instead of throwing when the clipboard API is missing", async () => {
            const user = userEvent.setup();
            renderPanel();
            setClipboard(undefined);

            await user.click(screen.getByRole("button", {name: "Copy codes"}));

            expect(toast.error).toHaveBeenCalledWith(COPY_FAILED);
            expect(screen.getByRole("button", {name: "Copy codes"})).toBeInTheDocument();
        });

        it("toasts instead of throwing when writeText rejects", async () => {
            const user = userEvent.setup();
            renderPanel();
            setClipboard({writeText: vi.fn().mockRejectedValue(new Error("denied"))});

            await user.click(screen.getByRole("button", {name: "Copy codes"}));

            expect(toast.error).toHaveBeenCalledWith(COPY_FAILED);
            expect(screen.queryByRole("button", {name: "Copied"})).not.toBeInTheDocument();
        });

        it("leaves the codes as selectable text when copying fails", async () => {
            const user = userEvent.setup();
            renderPanel();
            setClipboard(undefined);

            await user.click(screen.getByRole("button", {name: "Copy codes"}));

            expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(CODES);
        });
    });

    describe("Download .txt", () => {
        let blobs: Blob[];
        let downloads: string[];

        beforeEach(() => {
            blobs = [];
            downloads = [];
            URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
                blobs.push(blob as Blob); // the component only ever passes a Blob
                return "blob:mock";
            });
            URL.revokeObjectURL = vi.fn();
            vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
                downloads.push(this.download);
            });
        });

        afterEach(() => {
            vi.restoreAllMocks();
            vi.useRealTimers();
        });

        it("downloads docktor-recovery-codes.txt with the title, date and one code per line", async () => {
            vi.useFakeTimers({toFake: ["Date"]});
            vi.setSystemTime(new Date(2026, 9, 10, 12, 0, 0));
            const user = userEvent.setup();
            renderPanel();

            await user.click(screen.getByRole("button", {name: "Download .txt"}));

            expect(downloads).toEqual(["docktor-recovery-codes.txt"]);
            expect(blobs).toHaveLength(1);
            expect(blobs[0].type).toBe("text/plain");
            expect(await blobs[0].text()).toBe(
                `Docktor recovery codes\nGenerated 2026-10-10. Each code works once.\n\n${CODES.join("\n")}\n`,
            );
        });

        it("revokes the object URL after the click", async () => {
            const user = userEvent.setup();
            renderPanel();

            await user.click(screen.getByRole("button", {name: "Download .txt"}));

            expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
        });
    });
});
