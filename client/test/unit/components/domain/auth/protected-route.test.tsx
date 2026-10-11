import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {act, render, screen, waitFor} from "@testing-library/react";
import {MemoryRouter, Route, Routes} from "react-router";
import type {AccountSecurityStatus} from "@docktor/shared";
import {ProtectedRoute} from "@/components/domain/auth/protected-route";
import {accountSecurityStore} from "@/hooks/use-account-security";
import {getAccountSecurity} from "@/lib/account-api";
import {ENROLLMENT_REQUIRED_EVENT} from "@/lib/api";
import {useSession} from "@/lib/auth-client";

vi.mock("@/lib/account-api", () => ({
    getAccountSecurity: vi.fn(),
    setMandatoryTwoFactor: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
    useSession: vi.fn(),
}));

// FirstRunGate would fetch the setup status; the session-less branch only needs its child.
vi.mock("@/components/domain/auth/first-run-gate", () => ({
    FirstRunGate: ({children}: { children: React.ReactNode }) => <>{children}</>,
}));

const OK: AccountSecurityStatus = {twoFactorEnabled: true, mandatory: false, enrollmentRequired: false};
const MUST_ENROL: AccountSecurityStatus = {twoFactorEnabled: false, mandatory: true, enrollmentRequired: true};

function sessionFor(userId: string) {
    return {data: {session: {id: "s"}, user: {id: userId}}, isPending: false};
}

function mockSession(value: { data: unknown; isPending: boolean }): void {
    // The hook's real return type is a better-auth atom; the component reads data and isPending only.
    vi.mocked(useSession).mockReturnValue(value as unknown as ReturnType<typeof useSession>);
}

function tree(initialPath: string): React.JSX.Element {
    return (
        <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
                <Route
                    path="*"
                    element={
                        <ProtectedRoute>
                            <p>protected content</p>
                        </ProtectedRoute>
                    }
                />
                <Route path="/login" element={<p>login page</p>}/>
            </Routes>
        </MemoryRouter>
    );
}

describe("ProtectedRoute", () => {
    beforeEach(() => {
        accountSecurityStore.reset();
        vi.mocked(getAccountSecurity).mockReset().mockResolvedValue(OK);
        vi.mocked(useSession).mockReset();
        mockSession(sessionFor("user-1"));
    });

    afterEach(() => {
        vi.restoreAllMocks();
        accountSecurityStore.reset();
    });

    it("makes no security status request without a session", () => {
        mockSession({data: null, isPending: false});
        render(tree("/"));

        expect(screen.getByText("login page")).toBeInTheDocument();
        expect(getAccountSecurity).not.toHaveBeenCalled();
    });

    it("shows the loading view while the session resolves", () => {
        mockSession({data: null, isPending: true});
        render(tree("/"));

        expect(screen.getByText("Loading...")).toBeInTheDocument();
        expect(getAccountSecurity).not.toHaveBeenCalled();
    });

    it("shows the loading view while the status loads, then the children", async () => {
        let resolveStatus: (status: AccountSecurityStatus) => void = () => undefined;
        vi.mocked(getAccountSecurity).mockReturnValue(
            new Promise<AccountSecurityStatus>((resolve) => {
                resolveStatus = resolve;
            }),
        );
        render(tree("/"));

        expect(screen.getByText("Loading...")).toBeInTheDocument();
        expect(screen.queryByText("protected content")).not.toBeInTheDocument();

        await act(async () => resolveStatus(OK));

        expect(await screen.findByText("protected content")).toBeInTheDocument();
    });

    it("redirects to /account when enrollment is required and the path is elsewhere", async () => {
        vi.mocked(getAccountSecurity).mockResolvedValue(MUST_ENROL);
        render(
            <MemoryRouter initialEntries={["/"]}>
                <Routes>
                    <Route path="/account" element={<p>account page</p>}/>
                    <Route
                        path="*"
                        element={
                            <ProtectedRoute>
                                <p>protected content</p>
                            </ProtectedRoute>
                        }
                    />
                </Routes>
            </MemoryRouter>,
        );

        expect(await screen.findByText("account page")).toBeInTheDocument();
        expect(screen.queryByText("protected content")).not.toBeInTheDocument();
    });

    it("renders the children on /account even when enrollment is required", async () => {
        vi.mocked(getAccountSecurity).mockResolvedValue(MUST_ENROL);
        render(tree("/account"));

        expect(await screen.findByText("protected content")).toBeInTheDocument();
    });

    it("fails open when the status fetch fails (the server stays authoritative)", async () => {
        vi.mocked(getAccountSecurity).mockRejectedValue(new Error("Network down"));
        render(tree("/"));

        expect(await screen.findByText("protected content")).toBeInTheDocument();
    });

    it("resets the shared status and refetches when another user signs in", async () => {
        const reset = vi.spyOn(accountSecurityStore, "reset");
        const view = render(tree("/"));
        await screen.findByText("protected content");
        expect(getAccountSecurity).toHaveBeenCalledTimes(1);
        expect(reset).not.toHaveBeenCalled();

        mockSession(sessionFor("user-2"));
        view.rerender(tree("/"));

        await waitFor(() => expect(reset).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(getAccountSecurity).toHaveBeenCalledTimes(2));
    });

    it("drops the status on sign-out without refetching", async () => {
        const reset = vi.spyOn(accountSecurityStore, "reset");
        const view = render(tree("/"));
        await screen.findByText("protected content");

        mockSession({data: null, isPending: false});
        view.rerender(tree("/"));

        await waitFor(() => expect(reset).toHaveBeenCalledTimes(1));
        expect(getAccountSecurity).toHaveBeenCalledTimes(1);
    });

    it("refreshes the status when the enrollment-required event fires, and redirects", async () => {
        const view = render(
            <MemoryRouter initialEntries={["/"]}>
                <Routes>
                    <Route path="/account" element={<p>account page</p>}/>
                    <Route
                        path="*"
                        element={
                            <ProtectedRoute>
                                <p>protected content</p>
                            </ProtectedRoute>
                        }
                    />
                </Routes>
            </MemoryRouter>,
        );
        await screen.findByText("protected content");

        vi.mocked(getAccountSecurity).mockResolvedValue(MUST_ENROL);
        act(() => {
            globalThis.dispatchEvent(new CustomEvent(ENROLLMENT_REQUIRED_EVENT));
        });

        expect(await screen.findByText("account page")).toBeInTheDocument();
        expect(getAccountSecurity).toHaveBeenCalledTimes(2);
        view.unmount();
    });

    it("removes the event listener on unmount", async () => {
        const view = render(tree("/"));
        await screen.findByText("protected content");
        view.unmount();

        globalThis.dispatchEvent(new CustomEvent(ENROLLMENT_REQUIRED_EVENT));

        expect(getAccountSecurity).toHaveBeenCalledTimes(1);
    });
});
