import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {act, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter} from "react-router";
import type {AccountSecurityStatus} from "@docktor/shared";
import AccountPage from "@/routes/app/account";
import {SidebarProvider} from "@/components/ui/sidebar";
import {accountSecurityStore} from "@/hooks/use-account-security";
import {getAccountSecurity} from "@/lib/account-api";
import {twoFactor} from "@/lib/auth-client";

// jsdom has no ResizeObserver; Radix's Checkbox (enroll dialog) requires one.
if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}

vi.mock("@/lib/account-api", () => ({
    getAccountSecurity: vi.fn(),
    setMandatoryTwoFactor: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
    twoFactor: {enable: vi.fn(), verifyTotp: vi.fn(), disable: vi.fn(), generateBackupCodes: vi.fn()},
}));

vi.mock("sonner", () => ({
    toast: {success: vi.fn(), error: vi.fn()},
}));

const NOT_ENROLLED: AccountSecurityStatus = {twoFactorEnabled: false, mandatory: false, enrollmentRequired: false};
const ENROLLED: AccountSecurityStatus = {twoFactorEnabled: true, mandatory: false, enrollmentRequired: false};

function renderPage() {
    return render(
        <MemoryRouter>
            <SidebarProvider>
                <AccountPage/>
            </SidebarProvider>
        </MemoryRouter>,
    );
}

describe("AccountPage", () => {
    beforeEach(() => {
        accountSecurityStore.reset();
        vi.mocked(getAccountSecurity).mockReset().mockResolvedValue(NOT_ENROLLED);
    });

    afterEach(() => {
        accountSecurityStore.reset();
    });

    it("renders the page title, description and Security section heading", async () => {
        renderPage();

        expect(screen.getByRole("heading", {name: "Account", level: 1})).toBeInTheDocument();
        expect(screen.getByText("Manage how you sign in to Docktor.")).toBeInTheDocument();
        expect(screen.getByRole("heading", {name: "Security"})).toBeInTheDocument();
        expect(screen.getByText("Protect your account with a second sign-in step.")).toBeInTheDocument();
        await screen.findByText("Not enabled");
    });

    it("shows skeleton rows while the status loads", async () => {
        vi.mocked(getAccountSecurity).mockReturnValue(new Promise(() => undefined));
        renderPage();

        expect(screen.getByTestId("security-skeleton")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Set up two-factor authentication"})).not.toBeInTheDocument();
    });

    it("shows a destructive alert on load failure and Retry refetches", async () => {
        const user = userEvent.setup();
        vi.mocked(getAccountSecurity).mockRejectedValueOnce(new Error("Network down"));
        renderPage();

        expect(
            await screen.findByText(
                "Couldn't load your security settings. Check your connection and try again.",
            ),
        ).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Retry"}));

        expect(await screen.findByText("Not enabled")).toBeInTheDocument();
        expect(getAccountSecurity).toHaveBeenCalledTimes(2);
    });

    it("shows the Not enabled state with the explanation and the setup button", async () => {
        renderPage();

        expect(await screen.findByText("Not enabled")).toBeInTheDocument();
        expect(
            screen.getByText(
                "Add a second step to sign-in using an authenticator app such as 1Password, Aegis, or Google Authenticator.",
            ),
        ).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Set up two-factor authentication"})).toBeInTheDocument();
    });

    it("shows the Enabled state without a setup button", async () => {
        vi.mocked(getAccountSecurity).mockResolvedValue(ENROLLED);
        renderPage();

        expect(await screen.findByText("Enabled")).toBeInTheDocument();
        expect(
            screen.getByText("Your account asks for a code from your authenticator app when you sign in."),
        ).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Set up two-factor authentication"})).not.toBeInTheDocument();
    });

    it("offers Regenerate and Disable when two-factor is enabled and not required", async () => {
        vi.mocked(getAccountSecurity).mockResolvedValue(ENROLLED);
        renderPage();

        expect(await screen.findByRole("button", {name: "Regenerate recovery codes"})).toBeEnabled();
        const disable = screen.getByRole("button", {name: "Disable two-factor"});
        expect(disable).toBeEnabled();
        expect(disable).not.toHaveAttribute("aria-disabled");
    });

    it("blocks Disable with an accessible reason while the requirement is on", async () => {
        vi.mocked(getAccountSecurity).mockResolvedValue({
            twoFactorEnabled: true,
            mandatory: true,
            enrollmentRequired: false,
        });
        renderPage();

        const disable = await screen.findByRole("button", {name: "Disable two-factor"});
        expect(disable).toBeDisabled();
        expect(disable).toHaveAttribute("aria-disabled", "true");
        expect(disable).toHaveAccessibleDescription(
            "Turn off the instance-wide requirement before disabling two-factor on your account.",
        );
        expect(screen.getByRole("button", {name: "Regenerate recovery codes"})).toBeEnabled();
    });

    it("refetches and shows Not enabled after two-factor is disabled", async () => {
        const user = userEvent.setup();
        vi.mocked(getAccountSecurity).mockResolvedValueOnce(ENROLLED).mockResolvedValue(NOT_ENROLLED);
        vi.mocked(twoFactor.disable).mockResolvedValue({data: {status: true}, error: null});
        renderPage();

        await user.click(await screen.findByRole("button", {name: "Disable two-factor"}));
        await user.type(await screen.findByLabelText("Password"), "hunter2hunter2");
        await user.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Disable two-factor"}));

        expect(await screen.findByText("Not enabled")).toBeInTheDocument();
        expect(getAccountSecurity).toHaveBeenCalledTimes(2);
        expect(screen.getByRole("button", {name: "Set up two-factor authentication"})).toBeInTheDocument();
    });

    it("renders the mandatory-two-factor row below the two-factor row", async () => {
        vi.mocked(getAccountSecurity).mockResolvedValue(ENROLLED);
        renderPage();

        expect(await screen.findByRole("switch", {name: "Require two-factor for all users"})).toBeEnabled();
        expect(screen.queryByText("Two-factor authentication is required")).not.toBeInTheDocument();
    });

    describe("when enrollment is required", () => {
        const REQUIRED_NOT_ENROLLED: AccountSecurityStatus = {
            twoFactorEnabled: false,
            mandatory: true,
            enrollmentRequired: true,
        };

        beforeEach(() => {
            vi.mocked(getAccountSecurity).mockResolvedValue(REQUIRED_NOT_ENROLLED);
        });

        it("shows the alert with the Setup required pill", async () => {
            renderPage();

            expect(await screen.findByText("Two-factor authentication is required")).toBeInTheDocument();
            expect(screen.getByText("Setup required")).toBeInTheDocument();
            expect(
                screen.getByText(
                    "This Docktor instance requires every user to use two-factor authentication. Set it up to continue.",
                ),
            ).toBeInTheDocument();
        });

        it("opens the enrollment dialog by itself", async () => {
            renderPage();

            expect(await screen.findByRole("dialog")).toBeInTheDocument();
            expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
        });

        it("leaves the setup button after closing and does not reopen on rerender", async () => {
            const user = userEvent.setup();
            const view = renderPage();
            await screen.findByRole("dialog");

            await user.click(screen.getByRole("button", {name: "Cancel"}));
            await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
            expect(screen.getByRole("button", {name: "Set up two-factor authentication"})).toBeInTheDocument();

            view.rerender(
                <MemoryRouter>
                    <SidebarProvider>
                        <AccountPage/>
                    </SidebarProvider>
                </MemoryRouter>,
            );
            // A status refetch with the same flag must not pop the dialog again either.
            await act(() => accountSecurityStore.refresh());

            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
    });

    it("opens the enrollment dialog from the setup button", async () => {
        const user = userEvent.setup();
        renderPage();

        await user.click(await screen.findByRole("button", {name: "Set up two-factor authentication"}));

        expect(await screen.findByRole("dialog")).toBeInTheDocument();
        expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
        await waitFor(() => expect(screen.getByLabelText("Password")).toBeInTheDocument());
    });
});
