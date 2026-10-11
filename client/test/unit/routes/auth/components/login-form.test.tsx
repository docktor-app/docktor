import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter} from "react-router";
import {LoginForm} from "../../../../../src/routes/auth/components/login-form";

// jsdom has no ResizeObserver; Radix's Checkbox (via @radix-ui/react-use-size)
// requires one to measure the control on mount.
if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
}

const {signInEmail, verifyTotp, verifyBackupCode, navigate} = vi.hoisted(() => ({
    signInEmail: vi.fn(),
    verifyTotp: vi.fn(),
    verifyBackupCode: vi.fn(),
    navigate: vi.fn(),
}));

// Mock auth-client
vi.mock("@/lib/auth-client", () => ({
    signIn: {email: signInEmail},
    twoFactor: {verifyTotp, verifyBackupCode},
    useSession: vi.fn().mockReturnValue({data: null, isPending: false}),
}));

// Mock react-router navigate
vi.mock("react-router", async () => {
    const actual = await vi.importActual("react-router");
    return {
        ...actual,
        useNavigate: () => navigate,
    };
});

function renderLoginForm() {
    const {container} = render(
        <MemoryRouter>
            <LoginForm />
        </MemoryRouter>,
    );
    return within(container);
}

async function submitCredentials(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(/email/i), "admin@example.com");
    await user.type(screen.getByLabelText(/password/i), "hunter2hunter2");
    await user.click(screen.getByRole("button", {name: /sign in/i}));
}

describe("LoginForm", () => {
    beforeEach(() => {
        signInEmail.mockReset().mockResolvedValue({data: {user: {id: "u1"}}, error: null});
        verifyTotp.mockReset().mockResolvedValue({data: {}, error: null});
        verifyBackupCode.mockReset().mockResolvedValue({data: {}, error: null});
        navigate.mockReset();
    });

    it("renders email and password fields", () => {
        const view = renderLoginForm();

        expect(view.getByLabelText(/email/i)).toBeInTheDocument();
        expect(view.getByLabelText(/password/i)).toBeInTheDocument();
    });

    it("renders the sign in button", () => {
        const view = renderLoginForm();

        expect(view.getByRole("button", {name: /sign in/i})).toBeInTheDocument();
    });

    it("renders a link to sign up", () => {
        const view = renderLoginForm();

        expect(view.getByText(/sign up/i)).toBeInTheDocument();
    });

    it("shows validation errors on empty submit", async () => {
        const user = userEvent.setup();
        const view = renderLoginForm();

        await user.click(view.getByRole("button", {name: /sign in/i}));

        // Wait for validation messages to appear
        expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
    });

    it("navigates to the dashboard when sign-in needs no second step", async () => {
        const user = userEvent.setup();
        renderLoginForm();

        await submitCredentials(user);

        await waitFor(() => expect(navigate).toHaveBeenCalledWith("/"));
        expect(screen.queryByText("Two-factor authentication")).not.toBeInTheDocument();
    });

    describe("two-factor second step", () => {
        beforeEach(() => {
            signInEmail.mockResolvedValue({data: {twoFactorRedirect: true}, error: null});
        });

        it("swaps to the code screen on twoFactorRedirect without navigating", async () => {
            const user = userEvent.setup();
            renderLoginForm();

            await submitCredentials(user);

            expect(await screen.findByText("Two-factor authentication")).toBeInTheDocument();
            expect(screen.getByLabelText("Authentication code")).toBeInTheDocument();
            expect(navigate).not.toHaveBeenCalled();
        });

        it("navigates to the dashboard after a correct code", async () => {
            const user = userEvent.setup();
            renderLoginForm();

            await submitCredentials(user);
            await user.type(await screen.findByLabelText("Authentication code"), "123456");
            await user.click(screen.getByRole("button", {name: "Verify"}));

            await waitFor(() => expect(navigate).toHaveBeenCalledWith("/"));
        });

        it("returns to an empty password step from Back to sign in", async () => {
            const user = userEvent.setup();
            renderLoginForm();

            await submitCredentials(user);
            await user.click(await screen.findByRole("button", {name: "Back to sign in"}));

            expect(await screen.findByText("Sign in to Docktor")).toBeInTheDocument();
            expect(screen.getByLabelText(/email/i)).toHaveValue("");
            expect(screen.getByLabelText(/password/i)).toHaveValue("");
        });

        it("returns to the password step with a banner when the pending sign-in expired", async () => {
            verifyTotp.mockResolvedValue({data: null, error: {status: 401, message: "Invalid two factor cookie"}});
            const user = userEvent.setup();
            renderLoginForm();

            await submitCredentials(user);
            await user.type(await screen.findByLabelText("Authentication code"), "123456");
            await user.click(screen.getByRole("button", {name: "Verify"}));

            expect(await screen.findByText("Sign in to Docktor")).toBeInTheDocument();
            expect(screen.getByRole("alert")).toHaveTextContent("Your sign-in timed out. Sign in again.");
            expect(screen.getByLabelText(/password/i)).toHaveValue("");
            expect(navigate).not.toHaveBeenCalled();
        });
    });

    describe("password step errors", () => {
        it("shows the wait time from X-Retry-After on a 429 and keeps Sign in enabled", async () => {
            signInEmail.mockImplementation(async (args: {
                fetchOptions?: { onError?: (context: { response: { headers: Headers } }) => void };
            }) => {
                args.fetchOptions?.onError?.({response: {headers: new Headers({"X-Retry-After": "600"})}});
                return {data: null, error: {status: 429, message: "Too many requests"}};
            });
            const user = userEvent.setup();
            renderLoginForm();

            await submitCredentials(user);

            expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts. Try again in 10 minutes.");
            expect(screen.getByRole("button", {name: /sign in/i})).toBeEnabled();
        });

        it("keeps the server message for other failures", async () => {
            signInEmail.mockResolvedValue({data: null, error: {status: 401, message: "Invalid email or password"}});
            const user = userEvent.setup();
            renderLoginForm();

            await submitCredentials(user);

            expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
        });
    });
});
