import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import type {FastifyInstance} from "fastify";
import {buildApp} from "../../src/app.js";
import {cleanDatabase, createTestUser, getApp, getPrisma, startContainer, stopContainer} from "./setup.js";

// The limiter configuration is read when lib/auth.ts is first imported, i.e.
// before any beforeAll runs, so the opt-in has to be set while the hoisted
// code executes (Pitfall 13: it is off by default under NODE_ENV=test).
vi.hoisted(() => {
    process.env.DOCKTOR_AUTH_RATE_LIMIT = "on";
});

describe("Auth rate limiting (#46)", () => {
    let app: FastifyInstance;
    let email: string;
    let password: string;

    beforeAll(async () => {
        await startContainer();
        app = await getApp();
    }, 60_000);

    afterAll(async () => {
        delete process.env.DOCKTOR_AUTH_RATE_LIMIT;
        // try/finally: stopContainer() must run even if cleanDatabase() throws.
        try {
            await cleanDatabase();
        } finally {
            await stopContainer();
        }
    });

    beforeEach(async () => {
        // cleanDatabase() also clears the RateLimit rows, so every test starts with empty counters.
        await cleanDatabase();
        const user = await createTestUser();
        email = user.email;
        password = user.password;
    });

    function signIn(target: FastifyInstance, pass: string, headers: Record<string, string> = {}) {
        return target.inject({
            method: "POST",
            url: "/api/auth/sign-in/email",
            headers,
            payload: {email, password: pass},
        });
    }

    it("answers 429 with X-Retry-After on the sixth sign-in and persists the counter", async () => {
        for (let attempt = 1; attempt <= 5; attempt++) {
            const res = await signIn(app, "wrong-password");
            expect(res.statusCode).toBe(401);
        }

        const blocked = await signIn(app, "wrong-password");
        expect(blocked.statusCode).toBe(429);

        const retryAfter = Number(blocked.headers["x-retry-after"]);
        expect(Number.isInteger(retryAfter)).toBe(true);
        expect(retryAfter).toBeGreaterThanOrEqual(1);
        expect(retryAfter).toBeLessThanOrEqual(900);

        const setCookie = blocked.headers["set-cookie"];
        const cookies = Array.isArray(setCookie) ? setCookie : [setCookie ?? ""];
        expect(cookies.some((c) => c.includes("session_token"))).toBe(false);

        const rows = await getPrisma().rateLimit.findMany();
        const signInRow = rows.find((r) => r.key.includes("/sign-in/email"));
        expect(signInRow?.count).toBe(5);
    });

    it("keeps counting when X-Forwarded-For and a forged client-IP header change on every attempt", async () => {
        for (let attempt = 1; attempt <= 5; attempt++) {
            const spoofed = `198.51.100.${attempt}`;
            const res = await signIn(app, "wrong-password", {
                "x-forwarded-for": spoofed,
                "x-docktor-client-ip": spoofed,
            });
            expect(res.statusCode).toBe(401);
        }

        const blocked = await signIn(app, "wrong-password", {
            "x-forwarded-for": "198.51.100.99",
            "x-docktor-client-ip": "198.51.100.99",
        });
        expect(blocked.statusCode).toBe(429);
    });

    it("separates clients behind one proxy when TRUST_PROXY=1", async () => {
        process.env.TRUST_PROXY = "1";
        const proxied = await buildApp();
        try {
            await proxied.ready();

            for (let attempt = 1; attempt <= 5; attempt++) {
                const res = await signIn(proxied, "wrong-password", {"x-forwarded-for": "203.0.113.7"});
                expect(res.statusCode).toBe(401);
            }

            const otherClient = await signIn(proxied, "wrong-password", {"x-forwarded-for": "203.0.113.8"});
            expect(otherClient.statusCode).toBe(401);

            const sameClient = await signIn(proxied, "wrong-password", {"x-forwarded-for": "203.0.113.7"});
            expect(sameClient.statusCode).toBe(429);
        } finally {
            delete process.env.TRUST_PROXY;
            await proxied.close();
        }
    });

    it("counts successful sign-ins against the same budget", async () => {
        for (let attempt = 1; attempt <= 5; attempt++) {
            const res = await signIn(app, password);
            expect(res.statusCode).toBe(200);
        }

        const blocked = await signIn(app, password);
        expect(blocked.statusCode).toBe(429);
    });
});
