import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {TwoFactorStep} from "../../../../../src/routes/auth/components/two-factor-step";

// jsdom has no ResizeObserver; Radix's Checkbox (via @radix-ui/react-use-size)
// requires one to measure the control on mount.
if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}

const {verifyTotp, verifyBackupCode} = vi.hoisted(() => ({
    verifyTotp: vi.fn(),
    verifyBackupCode: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
    twoFactor: {verifyTotp, verifyBackupCode},
}));

function renderStep() {
    const onSuccess = vi.fn();
    const onBack = vi.fn();
    const onExpired = vi.fn();
    render(<TwoFactorStep onSuccess={onSuccess} onBack={onBack} onExpired={onExpired}/>);
    return {onSuccess, onBack, onExpired};
}

describe("TwoFactorStep (authenticator code)", () => {
    beforeEach(() => {
        verifyTotp.mockReset().mockResolvedValue({data: {}, error: null});
        verifyBackupCode.mockReset().mockResolvedValue({data: {}, error: null});
    });

    it("renders the title, description and an Authentication code input", () => {
        renderStep();

        expect(screen.getByText("Two-factor authentication")).toBeInTheDocument();
        expect(screen.getByText("Enter the 6-digit code from your authenticator app.")).toBeInTheDocument();
        expect(screen.getByLabelText("Authentication code")).toBeInTheDocument();
    });

    it("configures the code input for one-time codes and focuses it on mount", () => {
        renderStep();

        const input = screen.getByLabelText("Authentication code");
        expect(input).toHaveAttribute("inputmode", "numeric");
        expect(input).toHaveAttribute("autocomplete", "one-time-code");
        expect(input).toHaveAttribute("maxlength", "6");
        expect(input).toHaveFocus();
    });

    it("drops non-digit characters while typing", async () => {
        const user = userEvent.setup();
        renderStep();

        const input = screen.getByLabelText("Authentication code");
        await user.type(input, "12a3-4");

        expect(input).toHaveValue("1234");
    });

    it("verifies the code with trustDevice false by default and calls onSuccess once", async () => {
        const user = userEvent.setup();
        const {onSuccess} = renderStep();

        await user.type(screen.getByLabelText("Authentication code"), "123456");
        await user.click(screen.getByRole("button", {name: "Verify"}));

        await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
        expect(verifyTotp).toHaveBeenCalledWith(expect.objectContaining({code: "123456", trustDevice: false}));
    });

    it("shows the trust checkbox unchecked with its helper text and sends trustDevice true when checked", async () => {
        const user = userEvent.setup();
        renderStep();

        const checkbox = screen.getByRole("checkbox", {name: "Trust this device for 30 days"});
        expect(checkbox).not.toBeChecked();
        expect(screen.getByText("You won't be asked for a code on this browser.")).toBeInTheDocument();

        await user.click(checkbox);
        await user.type(screen.getByLabelText("Authentication code"), "654321");
        await user.click(screen.getByRole("button", {name: "Verify"}));

        await waitFor(() => expect(verifyTotp).toHaveBeenCalled());
        expect(verifyTotp).toHaveBeenCalledWith(expect.objectContaining({code: "654321", trustDevice: true}));
    });

    it("rejects a short code with a field message and does not call the server", async () => {
        const user = userEvent.setup();
        renderStep();

        await user.type(screen.getByLabelText("Authentication code"), "12345");
        await user.click(screen.getByRole("button", {name: "Verify"}));

        expect(await screen.findByText("Enter the 6-digit code.")).toBeInTheDocument();
        expect(verifyTotp).not.toHaveBeenCalled();
    });

    it("calls onBack from the Back to sign in button", async () => {
        const user = userEvent.setup();
        const {onBack} = renderStep();

        await user.click(screen.getByRole("button", {name: "Back to sign in"}));

        expect(onBack).toHaveBeenCalledTimes(1);
    });
});
