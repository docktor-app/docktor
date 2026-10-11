import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter} from "react-router";
import type {AccountSecurityStatus} from "@docktor/shared";
import AccountPage from "@/routes/app/account";
import {SidebarProvider} from "@/components/ui/sidebar";
import {accountSecurityStore} from "@/hooks/use-account-security";
import {getAccountSecurity} from "@/lib/account-api";

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
    twoFactor: {enable: vi.fn(), verifyTotp: vi.fn()},
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

    it("opens the enrollment dialog from the setup button", async () => {
        const user = userEvent.setup();
        renderPage();

        await user.click(await screen.findByRole("button", {name: "Set up two-factor authentication"}));

        expect(await screen.findByRole("dialog")).toBeInTheDocument();
        expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
        await waitFor(() => expect(screen.getByLabelText("Password")).toBeInTheDocument());
    });
});
