import {ACCOUNT_SECURITY_ERROR_CODES, type AccountSecurityStatus} from "@docktor/shared";
import {
    canChangeMandatory,
    isEnrollmentRequired,
    parseMandatoryFlag,
    REQUIRE_TWO_FACTOR_SETTING_KEY,
} from "../domain/two-factor-policy.js";
import {ForbiddenError, NotFoundError} from "../lib/errors.js";
import type {AccountSecurityRepository} from "../repositories/account-security-repository.js";
import type {SettingsRepository} from "../repositories/settings-repository.js";

/**
 * #45: the signed-in user's two-factor standing and the instance-wide
 * requirement (D-01/D-02/D-03). The requirement is the Setting row
 * "auth.requireTwoFactor"; there is no role model, any user who has
 * two-factor themselves may change it.
 */
export class AccountSecurityService {
    constructor(
        private readonly settings: Pick<SettingsRepository, "get" | "upsert">,
        private readonly accounts: Pick<AccountSecurityRepository, "isTwoFactorEnabled" | "findUserIdByEmail" | "resetTwoFactor">,
    ) {}

    async getStatus(userId: string): Promise<AccountSecurityStatus> {
        const [twoFactorEnabled, raw] = await Promise.all([
            this.accounts.isTwoFactorEnabled(userId),
            this.settings.get(REQUIRE_TWO_FACTOR_SETTING_KEY),
        ]);
        const mandatory = parseMandatoryFlag(raw);
        return {twoFactorEnabled, mandatory, enrollmentRequired: isEnrollmentRequired({mandatory, twoFactorEnabled})};
    }

    async setMandatory(userId: string, enabled: boolean): Promise<AccountSecurityStatus> {
        const actorHasTwoFactor = await this.accounts.isTwoFactorEnabled(userId);
        if (!canChangeMandatory({actorHasTwoFactor})) {
            throw new ForbiddenError(
                "Turn on two-factor for your own account first.",
                ACCOUNT_SECURITY_ERROR_CODES.TWO_FACTOR_NOT_ENABLED,
            );
        }
        await this.settings.upsert(REQUIRE_TWO_FACTOR_SETTING_KEY, String(enabled));
        return this.getStatus(userId);
    }

    /**
     * D-09: on-box recovery for a user who lost both authenticator and recovery
     * codes. Only reachable from scripts/reset-two-factor.ts (shell access is the
     * authorisation); no HTTP route calls it.
     */
    async resetTwoFactor(email: string): Promise<{userId: string}> {
        const normalized = email.trim().toLowerCase();
        const userId = await this.accounts.findUserIdByEmail(normalized);
        if (userId === null) {
            throw new NotFoundError(`No user with email "${normalized}"`);
        }
        await this.accounts.resetTwoFactor(userId);
        return {userId};
    }
}
