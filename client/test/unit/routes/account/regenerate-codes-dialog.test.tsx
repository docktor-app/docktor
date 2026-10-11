import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {toast} from "sonner";
import {RegenerateCodesDialog} from "@/routes/app/account/components/regenerate-codes-dialog";

// jsdom has no ResizeObserver; Radix's Checkbox requires one on mount.
if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}

const {generateBackupCodes} = vi.hoisted(() => ({generateBackupCodes: vi.fn()}));

vi.mock("@/lib/auth-client", () => ({
    twoFactor: {generateBackupCodes},
}));

vi.mock("sonner", () => ({
    toast: {success: vi.fn(), error: vi.fn()},
}));

const CODES = Array.from({length: 10}, (_, index) => `fresh${index}-abcde`);

// Fails the way a better-auth call does: the fetch onError hook sees the response headers.
function failWith(error: Record<string, unknown>, headers: Record<string, string> = {}) {
    generateBackupCodes.mockImplementation(
        async (options: { fetchOptions?: { onError?: (context: unknown) => void } }) => {
            options.fetchOptions?.onError?.({response: {headers: new Headers(headers)}});
            return {data: null, error};
        },
    );
}

function renderDialog() {
    const onOpenChange = vi.fn();
    const onRegenerated = vi.fn();
    const view = render(<RegenerateCodesDialog open onOpenChange={onOpenChange} onRegenerated={onRegenerated}/>);
    return {onOpenChange, onRegenerated, ...view};
}

async function submitPassword(user: ReturnType<typeof userEvent.setup>, password = "hunter2hunter2") {
    await user.type(screen.getByLabelText("Password"), password);
    await user.click(screen.getByRole("button", {name: "Regenerate codes"}));
}

describe("RegenerateCodesDialog", () => {
    beforeEach(() => {
        generateBackupCodes.mockReset().mockResolvedValue({data: {backupCodes: CODES}, error: null});
        vi.mocked(toast.success).mockReset();
    });

    it("explains the consequences and asks for the password", () => {
        renderDialog();

        expect(screen.getByRole("heading", {name: "Regenerate recovery codes"})).toBeInTheDocument();
        expect(
            screen.getByText(
                "Your current recovery codes will stop working immediately, and your other signed-in devices will be signed out. Enter your password to continue.",
            ),
        ).toBeInTheDocument();
        expect(screen.getByLabelText("Password")).toBeInTheDocument();
    });

    it("requires a password before calling the server", async () => {
        const user = userEvent.setup();
        renderDialog();

        await user.click(screen.getByRole("button", {name: "Regenerate codes"}));

        expect(await screen.findByText("Password is required")).toBeInTheDocument();
        expect(generateBackupCodes).not.toHaveBeenCalled();
    });

    it("shows Incorrect password. on the field and stays on step 1", async () => {
        const user = userEvent.setup();
        failWith({status: 400, message: "Invalid password"});
        renderDialog();

        await submitPassword(user);

        expect(await screen.findByText("Incorrect password.")).toBeInTheDocument();
        expect(screen.getByRole("heading", {name: "Regenerate recovery codes"})).toBeInTheDocument();
    });

    it("names the wait on a 429 and keeps the typed password", async () => {
        const user = userEvent.setup();
        failWith({status: 429, message: "Too many requests"}, {"X-Retry-After": "60"});
        const {onOpenChange} = renderDialog();

        await submitPassword(user);

        expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts. Try again in 1 minute.");
        expect(screen.getByLabelText("Password")).toHaveValue("hunter2hunter2");
        expect(onOpenChange).not.toHaveBeenCalled();
    });

    it("shows a generic banner for any other failure", async () => {
        const user = userEvent.setup();
        failWith({status: 500, message: "boom"});
        renderDialog();

        await submitPassword(user);

        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Try again.");
    });

    it("sends the password and shows the 10 new codes on step 2", async () => {
        const user = userEvent.setup();
        renderDialog();

        await submitPassword(user);

        expect(await screen.findByRole("heading", {name: "Save your new recovery codes"})).toBeInTheDocument();
        expect(generateBackupCodes).toHaveBeenCalledWith(expect.objectContaining({password: "hunter2hunter2"}));
        expect(screen.getAllByRole("listitem")).toHaveLength(10);
        expect(screen.getByText("fresh0-abcde")).toBeInTheDocument();
    });

    it("keeps Done disabled until the codes are marked saved, then toasts, reports and closes", async () => {
        const user = userEvent.setup();
        const {onOpenChange, onRegenerated} = renderDialog();
        await submitPassword(user);
        await screen.findByRole("heading", {name: "Save your new recovery codes"});

        expect(screen.getByRole("button", {name: "Done"})).toBeDisabled();
        await user.click(screen.getByRole("checkbox", {name: "I have saved these recovery codes"}));
        await user.click(screen.getByRole("button", {name: "Done"}));

        expect(toast.success).toHaveBeenCalledWith("Recovery codes regenerated.");
        expect(onRegenerated).toHaveBeenCalledTimes(1);
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("does not close on Escape while the new codes are shown", async () => {
        const user = userEvent.setup();
        const {onOpenChange} = renderDialog();
        await submitPassword(user);
        await screen.findByRole("heading", {name: "Save your new recovery codes"});

        await user.keyboard("{Escape}");

        expect(onOpenChange).not.toHaveBeenCalled();
        expect(screen.getByRole("heading", {name: "Save your new recovery codes"})).toBeInTheDocument();
    });

    it("closes through Cancel on step 1", async () => {
        const user = userEvent.setup();
        const {onOpenChange, onRegenerated} = renderDialog();

        await user.click(screen.getByRole("button", {name: "Cancel"}));

        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onRegenerated).not.toHaveBeenCalled();
    });

    it("drops the codes when closed and reopened (restarts at the password step)", async () => {
        const user = userEvent.setup();
        const onOpenChange = vi.fn();
        const view = render(<RegenerateCodesDialog open onOpenChange={onOpenChange} onRegenerated={vi.fn()}/>);
        await submitPassword(user);
        await screen.findByText("fresh0-abcde");

        view.rerender(<RegenerateCodesDialog open={false} onOpenChange={onOpenChange} onRegenerated={vi.fn()}/>);
        await waitFor(() => expect(screen.queryByText("fresh0-abcde")).not.toBeInTheDocument());
        view.rerender(<RegenerateCodesDialog open onOpenChange={onOpenChange} onRegenerated={vi.fn()}/>);

        expect(await screen.findByLabelText("Password")).toHaveValue("");
        expect(screen.queryByText("fresh0-abcde")).not.toBeInTheDocument();
    });
});
