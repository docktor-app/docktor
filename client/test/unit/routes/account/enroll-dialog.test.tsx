import {useState} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {toast} from "sonner";
import {EnrollDialog} from "@/routes/app/account/components/enroll-dialog";

// jsdom has no ResizeObserver; Radix's Checkbox requires one on mount.
if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}

const {enable, verifyTotp} = vi.hoisted(() => ({
    enable: vi.fn(),
    verifyTotp: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
    twoFactor: {enable, verifyTotp},
}));

vi.mock("sonner", () => ({
    toast: {success: vi.fn(), error: vi.fn()},
}));

const SECRET = "JBSWY3DPEHPK3PXP";
const TOTP_URI = `otpauth://totp/Docktor:a?secret=${SECRET}&issuer=Docktor`;
const CODES = Array.from({length: 10}, (_, index) => `code${index}-abcde`);

function renderDialog() {
    const onOpenChange = vi.fn();
    const onEnrolled = vi.fn();
    const view = render(<EnrollDialog open onOpenChange={onOpenChange} onEnrolled={onEnrolled}/>);
    return {onOpenChange, onEnrolled, ...view};
}

async function submitPassword(user: ReturnType<typeof userEvent.setup>, password = "hunter2hunter2") {
    await user.type(screen.getByLabelText("Password"), password);
    await user.click(screen.getByRole("button", {name: "Continue"}));
}

async function reachStep2(user: ReturnType<typeof userEvent.setup>) {
    await submitPassword(user);
    await screen.findByText("Save your recovery codes");
}

async function reachStep3(user: ReturnType<typeof userEvent.setup>) {
    await reachStep2(user);
    await user.click(screen.getByRole("checkbox", {name: "I have saved these recovery codes"}));
    await user.click(screen.getByRole("button", {name: "Continue"}));
    await screen.findByText("Scan the QR code");
}

describe("EnrollDialog", () => {
    beforeEach(() => {
        enable.mockReset().mockResolvedValue({data: {totpURI: TOTP_URI, backupCodes: CODES}, error: null});
        verifyTotp.mockReset().mockResolvedValue({data: {}, error: null});
        vi.mocked(toast.success).mockReset();
    });

    describe("step 1 (password)", () => {
        it("starts at step 1 with the password field focused", () => {
            renderDialog();

            expect(screen.getByRole("heading", {name: "Set up two-factor authentication"})).toBeInTheDocument();
            expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
            expect(screen.getByLabelText("Password")).toHaveFocus();
        });

        it("requires a password before calling the server", async () => {
            const user = userEvent.setup();
            renderDialog();

            await user.click(screen.getByRole("button", {name: "Continue"}));

            expect(await screen.findByText("Password is required")).toBeInTheDocument();
            expect(enable).not.toHaveBeenCalled();
        });

        it("shows Incorrect password. on the field when the server rejects the password", async () => {
            const user = userEvent.setup();
            enable.mockResolvedValue({data: null, error: {status: 400, code: "INVALID_PASSWORD", message: "Invalid password"}});
            renderDialog();

            await submitPassword(user, "wrong-password");

            expect(await screen.findByText("Incorrect password.")).toBeInTheDocument();
            expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
        });

        it("shows a generic banner for any other failure and stays on step 1", async () => {
            const user = userEvent.setup();
            enable.mockResolvedValue({data: null, error: {status: 500, message: "boom"}});
            renderDialog();

            await submitPassword(user);

            expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Try again.");
            expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
        });

        it("moves to step 2 once the password is accepted", async () => {
            const user = userEvent.setup();
            renderDialog();

            await submitPassword(user);

            expect(enable).toHaveBeenCalledWith({password: "hunter2hunter2"});
            expect(await screen.findByText("Save your recovery codes")).toBeInTheDocument();
            expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
        });
    });

    describe("step 2 (recovery codes)", () => {
        it("renders the 10 codes and gates Continue on the saved checkbox", async () => {
            const user = userEvent.setup();
            renderDialog();
            await reachStep2(user);

            expect(screen.getAllByRole("listitem")).toHaveLength(10);
            expect(screen.getByRole("button", {name: "Continue"})).toBeDisabled();

            await user.click(screen.getByRole("checkbox", {name: "I have saved these recovery codes"}));

            expect(screen.getByRole("button", {name: "Continue"})).toBeEnabled();
        });

        it("closes through Cancel setup without reporting an enrollment", async () => {
            const user = userEvent.setup();
            const {onOpenChange, onEnrolled} = renderDialog();
            await reachStep2(user);

            await user.click(screen.getByRole("button", {name: "Cancel setup"}));

            expect(onOpenChange).toHaveBeenCalledWith(false);
            expect(onEnrolled).not.toHaveBeenCalled();
        });

        it("ignores the Escape key", async () => {
            const user = userEvent.setup();
            const {onOpenChange} = renderDialog();
            await reachStep2(user);

            await user.keyboard("{Escape}");

            expect(onOpenChange).not.toHaveBeenCalled();
            expect(screen.getByText("Save your recovery codes")).toBeInTheDocument();
        });

        it("ignores clicks outside the dialog", async () => {
            // Radix sets pointer-events: none on the body while a modal is open.
            const user = userEvent.setup({pointerEventsCheck: 0});
            const {onOpenChange} = renderDialog();
            await reachStep2(user);
            const overlay = document.querySelector('[data-slot="dialog-overlay"]');
            expect(overlay).not.toBeNull();

            await user.click(overlay as Element); // narrowed above: a missing overlay fails the test first

            expect(onOpenChange).not.toHaveBeenCalled();
            expect(screen.getByText("Save your recovery codes")).toBeInTheDocument();
        });
    });

    describe("step 3 (scan and verify)", () => {
        it("shows the setup key parsed from the totpURI", async () => {
            const user = userEvent.setup();
            renderDialog();
            await reachStep3(user);

            expect(screen.getByText("Step 3 of 3")).toBeInTheDocument();
            expect(screen.getByText(SECRET)).toBeInTheDocument();
            expect(screen.getByText("Can't scan? Enter this key instead")).toBeInTheDocument();
            expect(screen.getByLabelText("Authentication code")).toHaveFocus();
        });

        it("verifies the code, then toasts, reports the enrollment and closes", async () => {
            const user = userEvent.setup();
            const {onEnrolled, onOpenChange} = renderDialog();
            await reachStep3(user);

            await user.type(screen.getByLabelText("Authentication code"), "123456");
            await user.click(screen.getByRole("button", {name: "Verify and enable"}));

            await waitFor(() => expect(onEnrolled).toHaveBeenCalledTimes(1));
            expect(verifyTotp).toHaveBeenCalledWith({code: "123456"});
            expect(toast.success).toHaveBeenCalledWith(
                "Two-factor authentication is on. Your other devices were signed out.",
            );
            expect(onOpenChange).toHaveBeenCalledWith(false);
        });

        it("rejects a short code without calling the server", async () => {
            const user = userEvent.setup();
            renderDialog();
            await reachStep3(user);

            await user.type(screen.getByLabelText("Authentication code"), "123");
            await user.click(screen.getByRole("button", {name: "Verify and enable"}));

            expect(await screen.findByText("Enter the 6-digit code.")).toBeInTheDocument();
            expect(verifyTotp).not.toHaveBeenCalled();
        });

        it("explains an invalid code, clears the input and keeps the dialog open", async () => {
            const user = userEvent.setup();
            verifyTotp.mockResolvedValue({data: null, error: {status: 401, code: "INVALID_CODE", message: "Invalid code"}});
            const {onEnrolled, onOpenChange} = renderDialog();
            await reachStep3(user);

            await user.type(screen.getByLabelText("Authentication code"), "123456");
            await user.click(screen.getByRole("button", {name: "Verify and enable"}));

            expect(await screen.findByRole("alert")).toHaveTextContent(
                "That code didn't work. Check your authenticator app and try again.",
            );
            expect(screen.getByLabelText("Authentication code")).toHaveValue("");
            expect(onEnrolled).not.toHaveBeenCalled();
            expect(onOpenChange).not.toHaveBeenCalled();
        });
    });

    describe("reopening", () => {
        it("restarts at step 1 with an empty password and no codes after Cancel setup", async () => {
            const user = userEvent.setup();
            const onEnrolled = vi.fn();
            function Harness() {
                const [open, setOpen] = useState(true);
                return (
                    <>
                        <button type="button" onClick={() => setOpen(true)}>Reopen</button>
                        <EnrollDialog open={open} onOpenChange={setOpen} onEnrolled={onEnrolled}/>
                    </>
                );
            }
            render(<Harness/>);
            await reachStep2(user);

            await user.click(screen.getByRole("button", {name: "Cancel setup"}));
            await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
            await user.click(screen.getByRole("button", {name: "Reopen"}));

            expect(await screen.findByText("Step 1 of 3")).toBeInTheDocument();
            expect(screen.getByLabelText("Password")).toHaveValue("");
            expect(screen.queryAllByRole("listitem")).toHaveLength(0);
            expect(onEnrolled).not.toHaveBeenCalled();
        });
    });
});
