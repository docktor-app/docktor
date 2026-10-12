import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";

// Contract test against the REAL better-auth client (no vi.mock of it). better-auth
// captures the global fetch when the client is created, so the stub must be installed
// before "@/lib/auth-client" is first evaluated.

const mockUser = {id: "user-1", name: "Tester", email: "tester@example.com"};
const mockSession = {session: {id: "sess-1", userId: "user-1"}, user: mockUser};

let signedIn = false;
let sessionFetchFails = false;

function requestPath(input: RequestInfo | URL): string {
    if (typeof input === "string") return new URL(input, "http://localhost").pathname;
    if (input instanceof URL) return input.pathname;
    return new URL(input.url, "http://localhost").pathname;
}

function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: {"content-type": "application/json"},
    });
}

const fetchStub = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    const path = requestPath(input);
    if (path.endsWith("/get-session")) {
        if (sessionFetchFails) throw new TypeError("Failed to fetch");
        return jsonResponse(signedIn ? mockSession : null);
    }
    if (path.endsWith("/sign-in/email") || path.endsWith("/two-factor/verify-totp")) {
        signedIn = true;
        return jsonResponse({token: "t", user: mockUser});
    }
    throw new Error(`Unexpected request in auth-client contract test: ${path}`);
});

let authClient: typeof import("@/lib/auth-client")["authClient"];
let signIn: typeof import("@/lib/auth-client")["signIn"];
let twoFactor: typeof import("@/lib/auth-client")["twoFactor"];
let refreshSession: typeof import("@/lib/auth-client")["refreshSession"];

function readSessionStore(): unknown {
    return authClient.$store.atoms.session.get();
}

const signInCalls: ReadonlyArray<readonly [string, () => Promise<unknown>]> = [
    ["signIn.email", () => signIn.email({email: "tester@example.com", password: "hunter2hunter2"})],
    ["twoFactor.verifyTotp", () => twoFactor.verifyTotp({code: "123456"})],
];

describe("auth-client refreshSession (G-15-14)", () => {
    beforeAll(async () => {
        vi.stubGlobal("fetch", fetchStub);
        ({authClient, signIn, twoFactor, refreshSession} = await import("@/lib/auth-client"));
    });

    afterAll(() => {
        vi.unstubAllGlobals();
    });

    beforeEach(async () => {
        signedIn = false;
        sessionFetchFails = false;
        // Prime the stale signed-out value left behind by a signed-out visit to a protected route.
        await refreshSession();
    });

    it.each(signInCalls)(
        "the store is still signed out when %s resolves, and signed in right after refreshSession()",
        async (_name, call) => {
            expect(readSessionStore()).toMatchObject({data: null, isPending: false});

            await call();
            expect(readSessionStore()).toMatchObject({data: null, isPending: false});

            await refreshSession();
            expect(readSessionStore()).toMatchObject({
                data: {user: {id: mockUser.id}},
                isPending: false,
            });
        },
    );

    it("resolves and leaves the store signed out when the session request fails", async () => {
        sessionFetchFails = true;

        await expect(refreshSession()).resolves.toBeUndefined();

        expect(readSessionStore()).toMatchObject({data: null});
    });
});
