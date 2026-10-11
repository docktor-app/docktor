import {prisma} from "../lib/db.js";

// better-auth's twoFactor plugin stores a trusted-device marker as a
// Verification row: identifier "trust-device-<token>", value = the user id.
const TRUST_DEVICE_IDENTIFIER_PREFIX = "trust-device-";

export class AccountSecurityRepository {
    /** True only when the user exists and has completed two-factor enrollment. */
    async isTwoFactorEnabled(userId: string): Promise<boolean> {
        const user = await prisma.user.findUnique({
            where: {id: userId},
            select: {twoFactorEnabled: true},
        });
        return user?.twoFactorEnabled === true;
    }

    /** Removes every trusted-device record of the user; returns how many were deleted. */
    async deleteTrustDeviceRecords(userId: string): Promise<number> {
        const result = await prisma.verification.deleteMany({
            where: {identifier: {startsWith: TRUST_DEVICE_IDENTIFIER_PREFIX}, value: userId},
        });
        return result.count;
    }
}

export const accountSecurityRepository = new AccountSecurityRepository();
