import {describe, expect, it, vi} from "vitest";
import {AccountSecurityService} from "../../../src/application/account-security-service.js";
import {ForbiddenError, NotFoundError} from "../../../src/lib/errors.js";

function buildService({twoFactorEnabled, setting}: {twoFactorEnabled: boolean; setting: string | null}) {
    let stored = setting;
    const settings = {
        get: vi.fn(async () => stored),
        upsert: vi.fn(async (_key: string, value: string) => {
            stored = value;
        }),
    };
    const accounts = {
        isTwoFactorEnabled: vi.fn(async () => twoFactorEnabled),
        findUserIdByEmail: vi.fn(async (email: string): Promise<string | null> => (email === "admin@example.com" ? "u-admin" : null)),
        resetTwoFactor: vi.fn(async (_userId: string): Promise<void> => undefined),
    };
    return {service: new AccountSecurityService(settings, accounts), settings, accounts};
}

describe("AccountSecurityService.getStatus", () => {
    it("reports enrollment required for a user without two-factor under the requirement", async () => {
        const {service, settings} = buildService({twoFactorEnabled: false, setting: "true"});

        await expect(service.getStatus("u1")).resolves.toEqual({
            twoFactorEnabled: false,
            mandatory: true,
            enrollmentRequired: true,
        });
        expect(settings.get).toHaveBeenCalledWith("auth.requireTwoFactor");
    });

    it("treats a missing setting row as off", async () => {
        const {service} = buildService({twoFactorEnabled: false, setting: null});

        await expect(service.getStatus("u1")).resolves.toEqual({
            twoFactorEnabled: false,
            mandatory: false,
            enrollmentRequired: false,
        });
    });

    it("reports no enrollment required once the user has two-factor", async () => {
        const {service} = buildService({twoFactorEnabled: true, setting: "true"});

        await expect(service.getStatus("u1")).resolves.toMatchObject({mandatory: true, enrollmentRequired: false});
    });
});

describe("AccountSecurityService.setMandatory", () => {
    it("refuses turning the requirement on for a user without two-factor", async () => {
        const {service, settings} = buildService({twoFactorEnabled: false, setting: null});

        const failure = await service.setMandatory("u1", true).catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(ForbiddenError);
        expect(failure).toMatchObject({code: "TWO_FACTOR_NOT_ENABLED"});
        expect(settings.upsert).not.toHaveBeenCalled();
    });

    it("refuses lifting the requirement for a user mid-forced-enrollment", async () => {
        const {service, settings} = buildService({twoFactorEnabled: false, setting: "true"});

        await expect(service.setMandatory("u1", false)).rejects.toMatchObject({code: "TWO_FACTOR_NOT_ENABLED"});
        expect(settings.upsert).not.toHaveBeenCalled();
    });

    it("stores the flag and returns the new status for a user with two-factor", async () => {
        const {service, settings} = buildService({twoFactorEnabled: true, setting: null});

        const status = await service.setMandatory("u1", true);

        expect(settings.upsert).toHaveBeenCalledWith("auth.requireTwoFactor", "true");
        expect(status).toEqual({twoFactorEnabled: true, mandatory: true, enrollmentRequired: false});
    });

    it("turns the requirement off again", async () => {
        const {service, settings} = buildService({twoFactorEnabled: true, setting: "true"});

        const status = await service.setMandatory("u1", false);

        expect(settings.upsert).toHaveBeenCalledWith("auth.requireTwoFactor", "false");
        expect(status.mandatory).toBe(false);
    });
});

describe("AccountSecurityService.resetTwoFactor (D-09)", () => {
    it("looks the user up by trimmed, lower-cased email and resets exactly once", async () => {
        const {service, accounts} = buildService({twoFactorEnabled: true, setting: null});

        await expect(service.resetTwoFactor("Admin@Example.com ")).resolves.toEqual({userId: "u-admin"});

        expect(accounts.findUserIdByEmail).toHaveBeenCalledWith("admin@example.com");
        expect(accounts.resetTwoFactor).toHaveBeenCalledTimes(1);
        expect(accounts.resetTwoFactor).toHaveBeenCalledWith("u-admin");
    });

    it("rejects with NotFoundError for an unknown email and resets nothing", async () => {
        const {service, accounts} = buildService({twoFactorEnabled: true, setting: null});

        const failure = await service.resetTwoFactor("nobody@example.com").catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(NotFoundError);
        expect(failure).toMatchObject({message: 'No user with email "nobody@example.com"'});
        expect(accounts.resetTwoFactor).not.toHaveBeenCalled();
    });
});
