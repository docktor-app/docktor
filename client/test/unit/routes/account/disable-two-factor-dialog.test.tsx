import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {toast} from "sonner";
import {DisableTwoFactorDialog} from "@/routes/app/account/components/disable-two-factor-dialog";

const {disable} = vi.hoisted(() => ({disable: vi.fn()}));

vi.mock("@/lib/auth-client", () => ({
    twoFactor: {disable},
}));

vi.mock("sonner", () => ({
    toast: {success: vi.fn(), error: vi.fn()},
}));

// Fails the way a better-auth call does: the fetch onError hook sees the response headers.
function failWith(error: Record<string, unknown>, headers: Record<string, string> = {}) {
    disable.mockImplementation(async (options: { fetchOptions?: { onError?: (context: unknown) => void } }) => {
        options.fetchOptions?.onError?.({response: {headers: new Headers(headers)}});
        return {data: null, error};
    });
}

function renderDialog() {
    const onOpenChange = vi.fn();
    const onDisabled = vi.fn();
    const view = render(<DisableTwoFactorDialog open onOpenChange={onOpenChange} onDisabled={onDisabled}/>);
    return {onOpenChange, onDisabled, ...view};
}

async function submitPassword(user: ReturnType<typeof userEvent.setup>, password = "hunter2hunter2") {
    await user.type(screen.getByLabelText("Password"), password);
    await user.click(screen.getByRole("button", {name: "Disable two-factor"}));
}

describe("DisableTwoFactorDialog", () => {
    beforeEach(() => {
        disable.mockReset().mockResolvedValue({data: {status: true}, error: null});
        vi.mocked(toast.success).mockReset();
    });

    it("shows the destructive confirmation copy and a Password field", () => {
        renderDialog();

        expect(screen.getByRole("heading", {name: "Disable two-factor authentication"})).toBeInTheDocument();
        expect(
            screen.getByText(
                "Your account will be protected by your password only, and your other signed-in devices will be signed out. Enter your password to confirm.",
            ),
        ).toBeInTheDocument();
        expect(screen.getByLabelText("Password")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Disable two-factor"})).toHaveClass("bg-destructive");
    });

    it("requires a password before calling the server", async () => {
        const user = userEvent.setup();
        renderDialog();

        await user.click(screen.getByRole("button", {name: "Disable two-factor"}));

        expect(await screen.findByText("Password is required")).toBeInTheDocument();
        expect(disable).not.toHaveBeenCalled();
    });

    it("disables two-factor, toasts that other devices were signed out, and closes", async () => {
        const user = userEvent.setup();
        const {onDisabled, onOpenChange} = renderDialog();

        await submitPassword(user);

        await vi.waitFor(() => expect(onDisabled).toHaveBeenCalledTimes(1));
        expect(disable).toHaveBeenCalledWith(expect.objectContaining({password: "hunter2hunter2"}));
        expect(toast.success).toHaveBeenCalledWith(
            "Two-factor authentication is off. Your other devices were signed out.",
        );
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("shows Incorrect password. on the field and stays open", async () => {
        const user = userEvent.setup();
        failWith({status: 400, message: "Invalid password"});
        const {onDisabled, onOpenChange} = renderDialog();

        await submitPassword(user);

        expect(await screen.findByText("Incorrect password.")).toBeInTheDocument();
        expect(onDisabled).not.toHaveBeenCalled();
        expect(onOpenChange).not.toHaveBeenCalled();
    });

    it("names the wait on a 429", async () => {
        const user = userEvent.setup();
        failWith({status: 429, message: "Too many requests"}, {"X-Retry-After": "300"});
        renderDialog();

        await submitPassword(user);

        expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts. Try again in 5 minutes.");
    });

    it("shows the server's explanation for a 403 and stays open", async () => {
        const user = userEvent.setup();
        failWith({
            status: 403,
            message: "Turn off the instance-wide two-factor requirement before disabling two-factor on your account.",
        });
        const {onDisabled, onOpenChange} = renderDialog();

        await submitPassword(user);

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Turn off the instance-wide two-factor requirement before disabling two-factor on your account.",
        );
        expect(onDisabled).not.toHaveBeenCalled();
        expect(onOpenChange).not.toHaveBeenCalled();
    });

    it("shows a generic banner for any other failure", async () => {
        const user = userEvent.setup();
        failWith({status: 500, message: "boom"});
        renderDialog();

        await submitPassword(user);

        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Try again.");
    });

    it("closes through Cancel without calling the server", async () => {
        const user = userEvent.setup();
        const {onOpenChange} = renderDialog();

        await user.click(screen.getByRole("button", {name: "Cancel"}));

        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(disable).not.toHaveBeenCalled();
    });
});
