import {afterEach, describe, expect, it, vi} from "vitest";

// better-auth reads its cookie options once, when lib/auth.ts is imported, so
// every case stubs the environment first and imports a fresh copy of the module.

async function importFreshAuth(env: Record<string, string | undefined>) {
    vi.resetModules();
    // An absent key must read as unset, not inherit the runner's own value.
    vi.stubEnv("BETTER_AUTH_URL", undefined);
    for (const [key, value] of Object.entries(env)) {
        vi.stubEnv(key, value);
    }
    return (await import("../../../src/lib/auth.js")).auth;
}

// Each case re-imports better-auth from scratch, which is slow when the whole
// unit suite runs in parallel, so the default 5 s test timeout is too tight.
describe("auth session cookie configuration (D-15)", {timeout: 30_000}, () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it("keeps Secure off in production when BETTER_AUTH_URL is unset (plain-http LAN installs keep their session)", async () => {
        const auth = await importFreshAuth({NODE_ENV: "production", BETTER_AUTH_SECRET: "test-secret"});

        expect(auth.options.advanced?.useSecureCookies).toBe(false);
    });

    it("keeps Secure off in production for an http BETTER_AUTH_URL", async () => {
        const auth = await importFreshAuth({
            NODE_ENV: "production",
            BETTER_AUTH_SECRET: "test-secret",
            BETTER_AUTH_URL: "http://192.168.1.10:3000",
        });

        expect(auth.options.advanced?.useSecureCookies).toBe(false);
    });

    it("turns Secure on when BETTER_AUTH_URL is https", async () => {
        const auth = await importFreshAuth({
            NODE_ENV: "production",
            BETTER_AUTH_SECRET: "test-secret",
            BETTER_AUTH_URL: "https://docktor.example",
        });

        expect(auth.options.advanced?.useSecureCookies).toBe(true);
    });

    it("decides from the URL, not from NODE_ENV: https under development is Secure too", async () => {
        const auth = await importFreshAuth({
            NODE_ENV: "development",
            BETTER_AUTH_SECRET: "test-secret",
            BETTER_AUTH_URL: "https://docktor.example",
        });

        expect(auth.options.advanced?.useSecureCookies).toBe(true);
    });
});
