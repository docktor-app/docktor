import {beforeEach, describe, expect, it, vi} from "vitest";
import {getAccountSecurity, setMandatoryTwoFactor} from "@/lib/account-api";
import {apiFetch} from "@/lib/api";

vi.mock("@/lib/api", () => ({
    apiFetch: vi.fn(),
}));

const STATUS = {twoFactorEnabled: true, mandatory: false, enrollmentRequired: false};

describe("account-api", () => {
    beforeEach(() => {
        vi.mocked(apiFetch).mockReset().mockResolvedValue(STATUS);
    });

    it("getAccountSecurity reads GET /api/account/security", async () => {
        await expect(getAccountSecurity()).resolves.toEqual(STATUS);

        expect(apiFetch).toHaveBeenCalledWith("/api/account/security");
    });

    it("setMandatoryTwoFactor PUTs the enabled flag", async () => {
        await expect(setMandatoryTwoFactor(true)).resolves.toEqual(STATUS);

        expect(apiFetch).toHaveBeenCalledWith("/api/account/security/mandatory-2fa", {
            method: "PUT",
            body: JSON.stringify({enabled: true}),
        });
    });

    it("propagates API failures to the caller", async () => {
        vi.mocked(apiFetch).mockRejectedValue(new Error("boom"));

        await expect(getAccountSecurity()).rejects.toThrow("boom");
    });
});
