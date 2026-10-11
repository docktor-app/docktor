import {prisma} from "../lib/db.js";

// better-auth's twoFactor plugin stores a trusted-device marker as a
// Verification row: identifier "trust-device-<token>", value = the user id.
const TRUST_DEVICE_IDENTIFIER_PREFIX = "trust-device-";

// ...and a pending sign-in challenge as identifier "2fa-<token>", value = user id.
const PENDING_TWO_FACTOR_IDENTIFIER_PREFIX = "2fa-";

export class AccountSecurityRepository {
    /** Looks a user up by (already normalised) email; null when there is none. */
    async findUserIdByEmail(email: string): Promise<string | null> {
        const user = await prisma.user.findUnique({where: {email}, select: {id: true}});
        return user?.id ?? null;
    }

    /**
     * D-09: removes the user's second factor in one transaction: the TwoFactor
     * rows, the enabled flag, every session, and the trusted-device and
     * pending-challenge records, so nothing issued under the old factor survives.
     */
    async resetTwoFactor(userId: string): Promise<void> {
        await prisma.$transaction([
            prisma.twoFactor.deleteMany({where: {userId}}),
            prisma.user.update({where: {id: userId}, data: {twoFactorEnabled: false}}),
            prisma.session.deleteMany({where: {userId}}),
            prisma.verification.deleteMany({
                where: {
                    value: userId,
                    OR: [
                        {identifier: {startsWith: TRUST_DEVICE_IDENTIFIER_PREFIX}},
                        {identifier: {startsWith: PENDING_TWO_FACTOR_IDENTIFIER_PREFIX}},
                    ],
                },
            }),
        ]);
    }

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
