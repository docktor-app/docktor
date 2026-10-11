import {describe, expect, it, vi} from "vitest";
import {ForbiddenError} from "../../../src/lib/errors.js";
import {
    CROSS_ORIGIN_REJECTED_CODE,
    createOriginGuard,
    decideOrigin,
    normalizeOrigin,
    type OriginGuardRequest,
} from "../../../src/lib/origin-guard.js";

const TRUSTED = ["https://docktor.example"];
const SELF = "http://localhost";

function decide(overrides: Partial<Parameters<typeof decideOrigin>[0]> = {}): ReturnType<typeof decideOrigin> {
    return decideOrigin({
        method: "POST",
        url: "/api/stacks/x/deploy",
        origin: undefined,
        secFetchSite: undefined,
        trustedOrigins: TRUSTED,
        selfOrigin: SELF,
        ...overrides,
    });
}

describe("normalizeOrigin", () => {
    it.each([
        ["https://docktor.example", "https://docktor.example"],
        ["https://docktor.example/", "https://docktor.example"],
        ["HTTPS://DOCKTOR.EXAMPLE", "https://docktor.example"],
        ["http://localhost:80", "http://localhost"],
        ["https://docktor.example:443", "https://docktor.example"],
        ["http://192.168.1.10:3000", "http://192.168.1.10:3000"],
        ["https://docktor.example/some/path?x=1", "https://docktor.example"],
    ])("normalizes %s to %s", (input, expected) => {
        expect(normalizeOrigin(input)).toBe(expected);
    });

    it.each(["null", "not a url", "", "   "])("returns null for %j", (input) => {
        expect(normalizeOrigin(input)).toBeNull();
    });
});

describe("decideOrigin", () => {
    describe("safe methods", () => {
        it.each(["GET", "HEAD", "OPTIONS", "get"])("allows %s from any origin", (method) => {
            expect(decide({method, origin: "https://evil.example"})).toBe("allow");
        });
    });

    describe("unsafe methods on guarded API paths", () => {
        it.each(["POST", "PUT", "PATCH", "DELETE"])("rejects a hostile origin on %s", (method) => {
            expect(decide({method, origin: "https://evil.example"})).toBe("reject");
        });

        it("allows a trusted origin", () => {
            expect(decide({origin: "https://docktor.example"})).toBe("allow");
        });

        it("allows a trusted origin with a trailing slash", () => {
            expect(decide({origin: "https://docktor.example/"})).toBe("allow");
        });

        it("allows a trusted origin in a different case", () => {
            expect(decide({origin: "HTTPS://DOCKTOR.EXAMPLE"})).toBe("allow");
        });

        it("allows the request's own origin, ignoring an explicit default port", () => {
            expect(decide({origin: "http://localhost:80"})).toBe("allow");
        });

        it("normalizes the configured trusted origins too", () => {
            expect(decide({origin: "https://docktor.example", trustedOrigins: ["HTTPS://Docktor.Example/"]})).toBe("allow");
        });

        it('rejects the opaque origin "null"', () => {
            expect(decide({origin: "null"})).toBe("reject");
        });

        it("rejects a malformed origin", () => {
            expect(decide({origin: "not a url"})).toBe("reject");
        });

        it("rejects an origin that only shares a prefix with a trusted one", () => {
            expect(decide({origin: "https://docktor.example.evil.test"})).toBe("reject");
        });

        it("rejects the same host on another scheme", () => {
            expect(decide({origin: "http://docktor.example"})).toBe("reject");
        });

        it("rejects a sibling port on the same host", () => {
            expect(decide({origin: "http://localhost:8080"})).toBe("reject");
        });
    });

    describe("requests without an Origin header", () => {
        it.each(["cross-site", "same-site"])("rejects Sec-Fetch-Site %s", (secFetchSite) => {
            expect(decide({secFetchSite})).toBe("reject");
        });

        it.each(["same-origin", "none"])("allows Sec-Fetch-Site %s", (secFetchSite) => {
            expect(decide({secFetchSite})).toBe("allow");
        });

        it("allows requests carrying neither header (non-browser clients)", () => {
            expect(decide()).toBe("allow");
        });
    });

    describe("path scoping", () => {
        it("leaves /api/auth/ to better-auth", () => {
            expect(decide({url: "/api/auth/sign-in/email", origin: "https://evil.example"})).toBe("allow");
        });

        it("ignores non-API paths", () => {
            expect(decide({url: "/assets/x", origin: "https://evil.example"})).toBe("allow");
        });

        it("guards the setup wizard routes", () => {
            expect(decide({url: "/api/setup/step1", origin: "https://evil.example"})).toBe("reject");
        });

        it("ignores a query string when matching paths", () => {
            expect(decide({url: "/api/auth/get-session?x=/api/stacks", origin: "https://evil.example"})).toBe("allow");
            expect(decide({url: "/api/stacks?next=/api/auth/", origin: "https://evil.example"})).toBe("reject");
        });
    });
});

function fakeRequest(overrides: Partial<OriginGuardRequest> = {}): OriginGuardRequest {
    return {
        method: "POST",
        url: "/api/stacks/x/deploy",
        headers: {},
        protocol: "http",
        host: "localhost",
        ...overrides,
    };
}

describe("createOriginGuard", () => {
    function buildGuard(trusted: string[] = TRUSTED, extra: readonly string[] = []) {
        const resolveTrustedOrigins = vi.fn(() => Promise.resolve(trusted));
        return {guard: createOriginGuard({resolveTrustedOrigins, extraTrustedOrigins: extra}), resolveTrustedOrigins};
    }

    it("does not look up trusted origins for a GET request", async () => {
        const {guard, resolveTrustedOrigins} = buildGuard();

        await guard(fakeRequest({method: "GET", headers: {origin: "https://evil.example"}}));

        expect(resolveTrustedOrigins).not.toHaveBeenCalled();
    });

    it("does not look up trusted origins for /api/auth/ or non-API paths", async () => {
        const {guard, resolveTrustedOrigins} = buildGuard();

        await guard(fakeRequest({url: "/api/auth/sign-out", headers: {origin: "https://evil.example"}}));
        await guard(fakeRequest({url: "/assets/app.js", headers: {origin: "https://evil.example"}}));

        expect(resolveTrustedOrigins).not.toHaveBeenCalled();
    });

    it("does not look up trusted origins when no Origin header is present", async () => {
        const {guard, resolveTrustedOrigins} = buildGuard();

        await guard(fakeRequest());

        expect(resolveTrustedOrigins).not.toHaveBeenCalled();
    });

    it("throws a 403 ForbiddenError with the stable code for a hostile origin", async () => {
        const {guard} = buildGuard();

        const failure = await guard(fakeRequest({headers: {origin: "https://evil.example"}})).catch((e: unknown) => e);

        expect(failure).toBeInstanceOf(ForbiddenError);
        expect(failure).toMatchObject({
            message: "Cross-origin request blocked",
            statusCode: 403,
            code: CROSS_ORIGIN_REJECTED_CODE,
        });
        expect(CROSS_ORIGIN_REJECTED_CODE).toBe("CROSS_ORIGIN_REQUEST_REJECTED");
    });

    it("allows a trusted origin", async () => {
        const {guard} = buildGuard();

        await expect(guard(fakeRequest({headers: {origin: "https://docktor.example"}}))).resolves.toBeUndefined();
    });

    it("allows the request's own origin built from protocol and host", async () => {
        const {guard} = buildGuard();

        await expect(
            guard(fakeRequest({protocol: "https", host: "box.lan:8443", headers: {origin: "https://box.lan:8443"}})),
        ).resolves.toBeUndefined();
    });

    it("allows the extra trusted origins (development client)", async () => {
        const {guard} = buildGuard([], ["http://localhost:5173"]);

        await expect(guard(fakeRequest({headers: {origin: "http://localhost:5173"}}))).resolves.toBeUndefined();
    });

    it("rejects the development client origin when it is not configured as extra", async () => {
        const {guard} = buildGuard([], []);

        await expect(guard(fakeRequest({headers: {origin: "http://localhost:5173"}}))).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("rejects Sec-Fetch-Site same-site without an Origin header", async () => {
        const {guard} = buildGuard();

        await expect(guard(fakeRequest({headers: {"sec-fetch-site": "same-site"}}))).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("allows Sec-Fetch-Site same-origin without an Origin header", async () => {
        const {guard} = buildGuard();

        await expect(guard(fakeRequest({headers: {"sec-fetch-site": "same-origin"}}))).resolves.toBeUndefined();
    });
});
