import {describe, expect, it, vi} from "vitest";
import {runResetTwoFactor} from "../../../src/scripts/reset-two-factor.js";
import {NotFoundError} from "../../../src/lib/errors.js";

function buildDeps(resetTwoFactor: (email: string) => Promise<{userId: string}>) {
    const out = {log: vi.fn(), error: vi.fn()};
    return {deps: {resetTwoFactor: vi.fn(resetTwoFactor), out}, out};
}

describe("runResetTwoFactor (D-09)", () => {
    it("exits 2 with the usage line when no email is given", async () => {
        const {deps, out} = buildDeps(async () => ({userId: "u1"}));

        await expect(runResetTwoFactor([], deps)).resolves.toBe(2);

        expect(out.error).toHaveBeenCalledWith("Usage: node dist/server/scripts/reset-two-factor.js <email>");
        expect(deps.resetTwoFactor).not.toHaveBeenCalled();
    });

    it("exits 2 when more than one argument is given (no other-user override)", async () => {
        const {deps, out} = buildDeps(async () => ({userId: "u1"}));

        await expect(runResetTwoFactor(["a@x", "b@x"], deps)).resolves.toBe(2);

        expect(out.error).toHaveBeenCalledWith("Usage: node dist/server/scripts/reset-two-factor.js <email>");
        expect(deps.resetTwoFactor).not.toHaveBeenCalled();
    });

    it("exits 1 and prints the message for an unknown email", async () => {
        const {deps, out} = buildDeps(async () => {
            throw new NotFoundError('No user with email "nobody@x"');
        });

        await expect(runResetTwoFactor(["nobody@x"], deps)).resolves.toBe(1);

        expect(out.error).toHaveBeenCalledWith('No user with email "nobody@x"');
        expect(out.log).not.toHaveBeenCalled();
    });

    it("exits 1 and prints a message for an unexpected failure", async () => {
        const {deps, out} = buildDeps(async () => {
            throw new Error("connection refused");
        });

        await expect(runResetTwoFactor(["a@x"], deps)).resolves.toBe(1);

        expect(out.error).toHaveBeenCalledWith("Could not reset two-factor authentication: connection refused");
    });

    it("exits 0 and confirms on success", async () => {
        const {deps, out} = buildDeps(async () => ({userId: "u1"}));

        await expect(runResetTwoFactor(["a@x"], deps)).resolves.toBe(0);

        expect(deps.resetTwoFactor).toHaveBeenCalledWith("a@x");
        expect(out.log).toHaveBeenCalledWith(
            "Two-factor authentication was reset for a@x. All of their sessions were signed out.",
        );
    });
});
