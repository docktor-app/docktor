import {beforeEach, describe, expect, it, vi} from "vitest";
import {act, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {TwoFactorStep} from "../../../../../src/routes/auth/components/two-factor-step";
import {docsUrl} from "../../../../../src/lib/docs-links";

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

function deferred(): {promise: Promise<void>; resolve: () => void} {
    let resolve: () => void = () => {};
    const promise = new Promise<void>((res) => {
        resolve = res;
    });
    return {promise, resolve};
}

function renderStep(onSuccess: () => void | Promise<void> = vi.fn()) {
    const onBack = vi.fn();
    const onExpired = vi.fn();
    render(<TwoFactorStep onSuccess={onSuccess} onBack={onBack} onExpired={onExpired}/>);
    return {onBack, onExpired};
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
        const onSuccess = vi.fn();
        renderStep(onSuccess);

        await user.type(screen.getByLabelText("Authentication code"), "123456");
        await user.click(screen.getByRole("button", {name: "Verify"}));

        await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
        expect(verifyTotp).toHaveBeenCalledWith(expect.objectContaining({code: "123456", trustDevice: false}));
    });

    it("keeps Verifying... disabled until a pending onSuccess promise resolves (G-15-14)", async () => {
        const pending = deferred();
        const onSuccess = vi.fn(() => pending.promise);
        const user = userEvent.setup();
        renderStep(onSuccess);

        await user.type(screen.getByLabelText("Authentication code"), "123456");
        await user.click(screen.getByRole("button", {name: "Verify"}));

        await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
        expect(screen.getByRole("button", {name: "Verifying..."})).toBeDisabled();

        await act(async () => {
            pending.resolve();
        });

        expect(await screen.findByRole("button", {name: "Verify"})).toBeEnabled();
        expect(onSuccess).toHaveBeenCalledTimes(1);
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

    it("lays out the code input and Verify button in FormStack / FormActions (UI-05)", () => {
        const {container} = render(<TwoFactorStep onSuccess={vi.fn()} onBack={vi.fn()} onExpired={vi.fn()}/>);

        const stack = container.querySelector('[data-slot="form-stack"]');
        expect(stack).toBeInTheDocument();
        expect(stack).toContainElement(screen.getByLabelText("Authentication code"));

        const actions = screen.getByRole("button", {name: "Verify"}).closest('[data-slot="form-actions"]');
        expect(actions).toBeInTheDocument();
        expect(stack?.lastElementChild).toBe(actions);
        expect(container.querySelector("form")?.className.split(/\s+/)).not.toContain("space-y-4");
    });

    it("calls onBack from the Back to sign in button", async () => {
        const user = userEvent.setup();
        const {onBack} = renderStep();

        await user.click(screen.getByRole("button", {name: "Back to sign in"}));

        expect(onBack).toHaveBeenCalledTimes(1);
    });
});

interface FakeFetchOptions {
    fetchOptions?: { onError?: (context: { response: { headers: Headers } }) => void };
}

/** Mimics better-fetch: the onError callback fires with the response before the call resolves. */
function failWith(error: { status: number; message?: string }, headers: Record<string, string> = {}) {
    return async (args: FakeFetchOptions) => {
        args.fetchOptions?.onError?.({response: {headers: new Headers(headers)}});
        return {data: null, error};
    };
}

async function submitTotp(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
    const input = screen.getByLabelText("Authentication code");
    await user.type(input, "123456");
    await user.click(screen.getByRole("button", {name: "Verify"}));
    return input;
}

describe("TwoFactorStep (errors)", () => {
    beforeEach(() => {
        verifyTotp.mockReset();
        verifyBackupCode.mockReset();
    });

    it("explains an invalid authenticator code and clears the input", async () => {
        verifyTotp.mockImplementation(failWith({status: 401, message: "Invalid code"}));
        const user = userEvent.setup();
        renderStep();

        const input = await submitTotp(user);

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "That code didn't work. Check your authenticator app and try again.",
        );
        expect(input).toHaveValue("");
    });

    it("shows the wait time from X-Retry-After on a 429 and keeps the typed code", async () => {
        verifyTotp.mockImplementation(failWith({status: 429, message: "Too many requests"}, {"X-Retry-After": "30"}));
        const user = userEvent.setup();
        renderStep();

        const input = await submitTotp(user);

        expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts. Try again in 1 minute.");
        expect(input).toHaveValue("123456");
        expect(verifyTotp).toHaveBeenCalledTimes(1);
    });

    it("falls back to the generic 429 message without the header", async () => {
        verifyTotp.mockImplementation(failWith({status: 429}));
        const user = userEvent.setup();
        renderStep();

        await submitTotp(user);

        expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts. Try again in a few minutes.");
    });

    it("calls onExpired when the pending sign-in cookie is gone", async () => {
        verifyTotp.mockImplementation(failWith({status: 401, message: "Invalid two factor cookie"}));
        const user = userEvent.setup();
        const onSuccess = vi.fn();
        const {onExpired} = renderStep(onSuccess);

        await submitTotp(user);

        await waitFor(() => expect(onExpired).toHaveBeenCalledTimes(1));
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it("shows a generic message for an unexpected failure", async () => {
        verifyTotp.mockImplementation(failWith({status: 500}));
        const user = userEvent.setup();
        renderStep();

        await submitTotp(user);

        expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Try again.");
    });
});

describe("TwoFactorStep (recovery code)", () => {
    beforeEach(() => {
        verifyTotp.mockReset().mockResolvedValue({data: {}, error: null});
        verifyBackupCode.mockReset().mockResolvedValue({data: {}, error: null});
    });

    async function openRecoveryMode(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
        await user.click(screen.getByRole("button", {name: "Use a recovery code"}));
        return screen.findByLabelText("Recovery code");
    }

    it("switches to a focused recovery input with its own copy and attributes", async () => {
        const user = userEvent.setup();
        renderStep();

        const input = await openRecoveryMode(user);

        expect(screen.getByText("Enter one of your recovery codes. Each code works once.")).toBeInTheDocument();
        expect(input).toHaveAttribute("placeholder", "xxxxx-xxxxx");
        expect(input).toHaveAttribute("autocomplete", "off");
        expect(input).toHaveAttribute("spellcheck", "false");
        expect(input).toHaveFocus();
    });

    it("links the lost-everything hint to the docs section, in recovery mode only", async () => {
        const user = userEvent.setup();
        renderStep();

        const linkName = "Resetting two-factor authentication";
        expect(screen.queryByRole("link", {name: linkName})).not.toBeInTheDocument();

        await openRecoveryMode(user);
        const link = screen.getByRole("link", {name: linkName});
        expect(link).toHaveAttribute("href", docsUrl("reference/deployment", "resetting-two-factor-authentication"));
        expect(link).toHaveAttribute("target", "_blank");
        expect(link.getAttribute("rel")).toContain("noopener");
        expect(link.getAttribute("rel")).toContain("noreferrer");

        await user.click(screen.getByRole("button", {name: "Use authenticator app instead"}));
        expect(await screen.findByLabelText("Authentication code")).toBeInTheDocument();
        expect(screen.queryByRole("link", {name: linkName})).not.toBeInTheDocument();
    });

    it("trims the code, keeps its case and carries the trust choice over", async () => {
        const user = userEvent.setup();
        const onSuccess = vi.fn();
        renderStep(onSuccess);

        await user.click(screen.getByRole("checkbox", {name: "Trust this device for 30 days"}));
        const input = await openRecoveryMode(user);
        expect(screen.getByRole("checkbox", {name: "Trust this device for 30 days"})).toBeChecked();

        await user.type(input, " ab12C-d34Ef ");
        await user.click(screen.getByRole("button", {name: "Verify"}));

        await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
        expect(verifyBackupCode).toHaveBeenCalledWith(
            expect.objectContaining({code: "ab12C-d34Ef", trustDevice: true}),
        );
        expect(verifyTotp).not.toHaveBeenCalled();
    });

    it("keeps Verifying... disabled for a recovery code until onSuccess resolves (G-15-14)", async () => {
        const pending = deferred();
        const onSuccess = vi.fn(() => pending.promise);
        const user = userEvent.setup();
        renderStep(onSuccess);

        const input = await openRecoveryMode(user);
        await user.type(input, "aaaaa-bbbbb");
        await user.click(screen.getByRole("button", {name: "Verify"}));

        await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
        expect(screen.getByRole("button", {name: "Verifying..."})).toBeDisabled();

        await act(async () => {
            pending.resolve();
        });

        expect(await screen.findByRole("button", {name: "Verify"})).toBeEnabled();
    });

    it("requires a recovery code", async () => {
        const user = userEvent.setup();
        renderStep();

        await openRecoveryMode(user);
        await user.click(screen.getByRole("button", {name: "Verify"}));

        expect(await screen.findByText("Enter a recovery code.")).toBeInTheDocument();
        expect(verifyBackupCode).not.toHaveBeenCalled();
    });

    it("explains an invalid or already used recovery code", async () => {
        verifyBackupCode.mockImplementation(failWith({status: 401, message: "Invalid backup code"}));
        const user = userEvent.setup();
        renderStep();

        const input = await openRecoveryMode(user);
        await user.type(input, "aaaaa-bbbbb");
        await user.click(screen.getByRole("button", {name: "Verify"}));

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "That recovery code isn't valid or was already used.",
        );
        expect(input).toHaveValue("");
    });

    it("shows the rate-limit message in recovery mode and keeps the code", async () => {
        verifyBackupCode.mockImplementation(failWith({status: 429}, {"X-Retry-After": "600"}));
        const user = userEvent.setup();
        renderStep();

        const input = await openRecoveryMode(user);
        await user.type(input, "aaaaa-bbbbb");
        await user.click(screen.getByRole("button", {name: "Verify"}));

        expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts. Try again in 10 minutes.");
        expect(input).toHaveValue("aaaaa-bbbbb");
    });
});
