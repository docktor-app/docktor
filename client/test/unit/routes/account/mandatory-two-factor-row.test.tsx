import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {toast} from "sonner";
import type {AccountSecurityStatus} from "@docktor/shared";
import {MandatoryTwoFactorRow} from "@/routes/app/account/components/mandatory-two-factor-row";
import {setMandatoryTwoFactor} from "@/lib/account-api";
import {ApiError} from "@/lib/api";

vi.mock("@/lib/account-api", () => ({
    getAccountSecurity: vi.fn(),
    setMandatoryTwoFactor: vi.fn(),
}));

vi.mock("sonner", () => ({
    toast: {success: vi.fn(), error: vi.fn()},
}));

const NO_2FA: AccountSecurityStatus = {twoFactorEnabled: false, mandatory: false, enrollmentRequired: false};
const WITH_2FA: AccountSecurityStatus = {twoFactorEnabled: true, mandatory: false, enrollmentRequired: false};
const REQUIRED: AccountSecurityStatus = {twoFactorEnabled: true, mandatory: true, enrollmentRequired: false};

const LABEL = "Require two-factor for all users";
const HELPER = "Turn on two-factor for your own account first. This keeps you from locking yourself out.";
const FAILURE = "Couldn't update the setting. Try again.";

function renderRow(status: AccountSecurityStatus) {
    const onStatusChange = vi.fn();
    const view = render(<MandatoryTwoFactorRow status={status} onStatusChange={onStatusChange}/>);
    return {onStatusChange, ...view};
}

describe("MandatoryTwoFactorRow", () => {
    beforeEach(() => {
        vi.mocked(setMandatoryTwoFactor).mockReset();
        vi.mocked(toast.success).mockReset();
        vi.mocked(toast.error).mockReset();
    });

    it("disables the Switch and shows the helper when the caller has no two-factor", () => {
        renderRow(NO_2FA);

        const toggle = screen.getByRole("switch", {name: LABEL});
        expect(toggle).toBeDisabled();
        expect(screen.getByText(HELPER)).toBeInTheDocument();
        expect(
            screen.getByText("Anyone without two-factor authentication must set it up before they can use Docktor."),
        ).toBeInTheDocument();
        // The visible body text describes the control for assistive tech.
        const describedBy = toggle.getAttribute("aria-describedby") ?? "";
        expect(describedBy).not.toBe("");
        const description = describedBy
            .split(" ")
            .map((id) => document.getElementById(id)?.textContent ?? "")
            .join(" ");
        expect(description).toContain("Anyone without two-factor authentication");
    });

    it("hides the helper and enables the Switch when the caller has two-factor", () => {
        renderRow(WITH_2FA);

        expect(screen.getByRole("switch", {name: LABEL})).toBeEnabled();
        expect(screen.queryByText(HELPER)).not.toBeInTheDocument();
        expect(screen.queryByText("Required for all users")).not.toBeInTheDocument();
    });

    it("opens the confirmation instead of calling the API when turning it on", async () => {
        const user = userEvent.setup();
        renderRow(WITH_2FA);

        await user.click(screen.getByRole("switch", {name: LABEL}));

        expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
        expect(screen.getByText("Require two-factor authentication?")).toBeInTheDocument();
        expect(
            screen.getByText(
                "Every user without two-factor authentication will be asked to set it up the next time they sign in or load Docktor. You keep access because yours is already enabled.",
            ),
        ).toBeInTheDocument();
        expect(setMandatoryTwoFactor).not.toHaveBeenCalled();
    });

    it("leaves the setting off and calls nothing when the confirmation is cancelled", async () => {
        const user = userEvent.setup();
        const {onStatusChange} = renderRow(WITH_2FA);

        await user.click(screen.getByRole("switch", {name: LABEL}));
        await user.click(await screen.findByRole("button", {name: "Cancel"}));

        await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
        expect(setMandatoryTwoFactor).not.toHaveBeenCalled();
        expect(onStatusChange).not.toHaveBeenCalled();
        expect(screen.getByRole("switch", {name: LABEL})).not.toBeChecked();
    });

    it("turns it on after confirmation, flips only when the server answers, and toasts", async () => {
        const user = userEvent.setup();
        let resolveRequest: (status: AccountSecurityStatus) => void = () => undefined;
        vi.mocked(setMandatoryTwoFactor).mockReturnValue(
            new Promise<AccountSecurityStatus>((resolve) => {
                resolveRequest = resolve;
            }),
        );
        const {onStatusChange} = renderRow(WITH_2FA);

        await user.click(screen.getByRole("switch", {name: LABEL}));
        await user.click(await screen.findByRole("button", {name: "Require two-factor"}));

        expect(setMandatoryTwoFactor).toHaveBeenCalledWith(true);
        // Pessimistic: still off and locked while the request is pending.
        await waitFor(() => expect(screen.getByRole("switch", {name: LABEL})).toBeDisabled());
        expect(screen.getByRole("switch", {name: LABEL})).not.toBeChecked();
        expect(onStatusChange).not.toHaveBeenCalled();

        resolveRequest(REQUIRED);

        await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith(REQUIRED));
        expect(toast.success).toHaveBeenCalledWith("Two-factor is now required for all users.");
        await waitFor(() => expect(screen.getByRole("switch", {name: LABEL})).toBeEnabled());
    });

    it("shows the blue pill and the checked Switch while the requirement is on", () => {
        renderRow(REQUIRED);

        expect(screen.getByText("Required for all users")).toBeInTheDocument();
        expect(screen.getByRole("switch", {name: LABEL})).toBeChecked();
    });

    it("turns it off at once without a dialog", async () => {
        const user = userEvent.setup();
        vi.mocked(setMandatoryTwoFactor).mockResolvedValue(WITH_2FA);
        const {onStatusChange} = renderRow(REQUIRED);

        await user.click(screen.getByRole("switch", {name: LABEL}));

        expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
        expect(setMandatoryTwoFactor).toHaveBeenCalledWith(false);
        await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith(WITH_2FA));
        expect(toast.success).toHaveBeenCalledWith("Two-factor is no longer required.");
    });

    it("toasts the generic failure and keeps the previous state on a network error", async () => {
        const user = userEvent.setup();
        vi.mocked(setMandatoryTwoFactor).mockRejectedValue(new Error("Network down"));
        const {onStatusChange} = renderRow(REQUIRED);

        await user.click(screen.getByRole("switch", {name: LABEL}));

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith(FAILURE));
        expect(onStatusChange).not.toHaveBeenCalled();
        expect(screen.getByRole("switch", {name: LABEL})).toBeChecked();
    });

    it("appends the server message for a 4xx ApiError", async () => {
        const user = userEvent.setup();
        vi.mocked(setMandatoryTwoFactor).mockRejectedValue(new ApiError("Enable two-factor first.", 403));
        renderRow(REQUIRED);

        await user.click(screen.getByRole("switch", {name: LABEL}));

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith(`${FAILURE} Enable two-factor first.`));
    });

    it("does not append the message of a 5xx ApiError", async () => {
        const user = userEvent.setup();
        vi.mocked(setMandatoryTwoFactor).mockRejectedValue(new ApiError("Internal detail", 500));
        renderRow(REQUIRED);

        await user.click(screen.getByRole("switch", {name: LABEL}));

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith(FAILURE));
    });
});
