import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter} from "react-router";
import {SignupForm} from "../../../../../src/routes/auth/components/signup-form";

const {signUpEmail, navigate} = vi.hoisted(() => ({
    signUpEmail: vi.fn(),
    navigate: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
    signUp: {email: signUpEmail},
}));

vi.mock("react-router", async () => {
    const actual = await vi.importActual("react-router");
    return {
        ...actual,
        useNavigate: () => navigate,
    };
});

function renderSignupForm(): HTMLElement {
    const {container} = render(
        <MemoryRouter>
            <SignupForm />
        </MemoryRouter>,
    );
    return container;
}

describe("SignupForm", () => {
    beforeEach(() => {
        signUpEmail.mockReset().mockResolvedValue({data: {user: {id: "u1"}}, error: null});
        navigate.mockReset();
    });

    it("lays out fields in FormStack with the submit last in FormActions (UI-05)", () => {
        const container = renderSignupForm();

        const stack = container.querySelector('[data-slot="form-stack"]');
        expect(stack).toBeInTheDocument();
        expect(stack).toContainElement(screen.getByLabelText("Name"));
        expect(stack).toContainElement(screen.getByLabelText("Email"));
        expect(stack).toContainElement(screen.getByLabelText("Password"));

        const actions = screen.getByRole("button", {name: "Sign up"}).closest('[data-slot="form-actions"]');
        expect(actions).toBeInTheDocument();
        expect(stack?.lastElementChild).toBe(actions);
        expect(container.querySelector("form")?.className.split(/\s+/)).not.toContain("space-y-4");
    });

    it("shows validation messages and does not sign up on an empty submit", async () => {
        const user = userEvent.setup();
        renderSignupForm();

        await user.click(screen.getByRole("button", {name: "Sign up"}));

        expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
        expect(signUpEmail).not.toHaveBeenCalled();
    });
});
