import type {FastifyRequest} from "fastify";
import {ForbiddenError} from "./errors.js";

// CSRF defence for the Fastify routes (#46, D-14). better-auth checks Origin on
// /api/auth/* itself; every other state-changing /api request is checked here.
//
// SameSite=Lax is not enough on its own: it only separates *sites*, and a
// managed stack's web app on another port (or subdomain) of the same host is
// same-site yet cross-origin, so the browser still attaches the session cookie
// to its requests. The Origin header (always sent by browsers on unsafe
// cross-origin requests) closes that gap without a token layer.
//
// /api/setup/* is covered too: a request from the app's own origin always
// passes (selfOrigin), so the wizard keeps working with no configuration.
// Requests carrying neither Origin nor Sec-Fetch-Site (curl, scripts) are
// allowed: non-browser clients have no ambient cookies to abuse.

export const CROSS_ORIGIN_REJECTED_CODE = "CROSS_ORIGIN_REQUEST_REJECTED";

const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);
const API_PREFIX = "/api/";
const AUTH_PREFIX = "/api/auth/";
/** Sec-Fetch-Site values a browser sends for requests the user's own page made. */
const SAME_ORIGIN_FETCH_SITES: ReadonlySet<string> = new Set(["same-origin", "none"]);

export type OriginDecision = "allow" | "reject";

export interface OriginDecisionInput {
    method: string;
    url: string;
    origin: string | undefined;
    secFetchSite: string | undefined;
    trustedOrigins: readonly string[];
    selfOrigin: string;
}

/** Scheme + host + non-default port, lower-cased; null for "null", garbage and opaque origins. */
export function normalizeOrigin(value: string): string | null {
    try {
        const {origin} = new URL(value.trim());
        return origin === "null" ? null : origin;
    } catch {
        return null;
    }
}

function pathOf(url: string): string {
    const queryStart = url.indexOf("?");
    return queryStart === -1 ? url : url.slice(0, queryStart);
}

function isGuardedRequest(method: string, url: string): boolean {
    if (SAFE_METHODS.has(method.toUpperCase())) return false;
    const path = pathOf(url);
    return path.startsWith(API_PREFIX) && !path.startsWith(AUTH_PREFIX);
}

function isTrustedOrigin(origin: string, trustedOrigins: readonly string[], selfOrigin: string): boolean {
    const normalized = normalizeOrigin(origin);
    if (normalized === null) return false;
    return [selfOrigin, ...trustedOrigins].some((trusted) => normalizeOrigin(trusted) === normalized);
}

/** Pure decision: should this request be honoured, given who says they sent it? */
export function decideOrigin(input: OriginDecisionInput): OriginDecision {
    if (!isGuardedRequest(input.method, input.url)) return "allow";

    if (input.origin !== undefined) {
        return isTrustedOrigin(input.origin, input.trustedOrigins, input.selfOrigin) ? "allow" : "reject";
    }
    if (input.secFetchSite !== undefined && !SAME_ORIGIN_FETCH_SITES.has(input.secFetchSite)) {
        return "reject";
    }
    return "allow";
}

/** The slice of a Fastify request the guard reads; keeps the hook unit-testable. */
export type OriginGuardRequest = Pick<FastifyRequest, "method" | "url" | "headers" | "protocol" | "host">;

export interface OriginGuardDeps {
    resolveTrustedOrigins: () => Promise<string[]>;
    /** Origins trusted on top of the resolved ones (the Vite dev server in development). */
    extraTrustedOrigins: readonly string[];
}

function singleHeader(value: string | string[] | undefined): string | undefined {
    return typeof value === "string" ? value : undefined;
}

/**
 * Fastify onRequest hook enforcing decideOrigin. The trusted-origin lookup
 * (a settings read) only happens for guarded requests that carry an Origin.
 */
export function createOriginGuard(deps: OriginGuardDeps): (request: OriginGuardRequest) => Promise<void> {
    return async (request) => {
        if (!isGuardedRequest(request.method, request.url)) return;

        const origin = singleHeader(request.headers.origin);
        const trustedOrigins =
            origin === undefined ? [] : [...(await deps.resolveTrustedOrigins()), ...deps.extraTrustedOrigins];

        const decision = decideOrigin({
            method: request.method,
            url: request.url,
            origin,
            secFetchSite: singleHeader(request.headers["sec-fetch-site"]),
            trustedOrigins,
            selfOrigin: `${request.protocol}://${request.host}`,
        });
        if (decision === "reject") {
            throw new ForbiddenError("Cross-origin request blocked", CROSS_ORIGIN_REJECTED_CODE);
        }
    };
}
