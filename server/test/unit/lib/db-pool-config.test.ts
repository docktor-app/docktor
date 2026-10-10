import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {
    buildPoolConfig,
    DB_CONNECTION_TIMEOUT_MS,
    DB_KEEPALIVE_INITIAL_DELAY_MS,
} from "../../../src/lib/db-pool-config.js";

const {PrismaPgMock, PrismaClientMock} = vi.hoisted(() => ({
    PrismaPgMock: vi.fn(),
    PrismaClientMock: vi.fn(),
}));

vi.mock("@prisma/adapter-pg", () => ({PrismaPg: PrismaPgMock}));
vi.mock("../../../src/generated/prisma/client.js", () => ({PrismaClient: PrismaClientMock}));

const CONNECTION_STRING = "postgresql://u:p@db:5432/docktor";

describe("buildPoolConfig", () => {
    it("keeps established connections open, probes dead peers and bounds a connect", () => {
        const config = buildPoolConfig(CONNECTION_STRING);

        expect(config).toEqual({
            connectionString: CONNECTION_STRING,
            idleTimeoutMillis: 0,
            keepAlive: true,
            keepAliveInitialDelayMillis: DB_KEEPALIVE_INITIAL_DELAY_MS,
            connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
        });
        expect(DB_KEEPALIVE_INITIAL_DELAY_MS).toBe(10_000);
        expect(DB_CONNECTION_TIMEOUT_MS).toBe(10_000);
        expect(config).not.toHaveProperty("max");
    });
});

describe("lib/db.ts pool wiring", () => {
    const originalUrl = process.env.DATABASE_URL;

    beforeEach(() => {
        vi.resetModules();
        PrismaPgMock.mockReset();
        PrismaClientMock.mockReset();
    });

    afterEach(() => {
        if (originalUrl === undefined) {
            delete process.env.DATABASE_URL;
        } else {
            process.env.DATABASE_URL = originalUrl;
        }
    });

    it("builds the adapter from buildPoolConfig(DATABASE_URL) on first use", async () => {
        process.env.DATABASE_URL = CONNECTION_STRING;
        const {prisma} = await import("../../../src/lib/db.js");
        expect(PrismaPgMock).not.toHaveBeenCalled();

        void (prisma as unknown as Record<string, unknown>).anything;

        expect(PrismaPgMock).toHaveBeenCalledExactlyOnceWith(buildPoolConfig(CONNECTION_STRING));
        expect(PrismaClientMock).toHaveBeenCalledTimes(1);
    });

    it("still throws the existing message when DATABASE_URL is missing", async () => {
        delete process.env.DATABASE_URL;
        const {prisma} = await import("../../../src/lib/db.js");

        expect(() => (prisma as unknown as Record<string, unknown>).anything).toThrow(
            "DATABASE_URL environment variable is required",
        );
        expect(PrismaPgMock).not.toHaveBeenCalled();
    });
});
