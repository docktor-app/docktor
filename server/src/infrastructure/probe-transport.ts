import http from "node:http";
import https from "node:https";
import type {LookupFunction} from "node:net";
import type Dockerode from "dockerode";
import {healthProbeUrlSchema} from "@docktor/shared";
import {isProbeSuccess, type ProbeOutcome} from "../domain/health-probe.js";
import type {DockerodeClientPort} from "../application/ports/dockerode-client-port.js";
import type {
    ProbeObservation,
    ProbeRequest,
    ProbeTransportPort,
} from "../application/ports/probe-transport-port.js";
import {dockerodeClient} from "./dockerode-client.js";

const COMPOSE_PROJECT_LABEL = "com.docker.compose.project";

class ProbeTimeoutError extends Error {
    constructor() {
        super("probe timed out");
        this.name = "ProbeTimeoutError";
    }
}

/**
 * Picks the address Docktor sends the probe to: the stack's own
 * `<project>_default` network when the container has an address there, else
 * the first network with one. Null when the container has none.
 */
export function selectTargetAddress(info: Dockerode.ContainerInspectInfo): string | null {
    const networks = info.NetworkSettings?.Networks ?? {};
    const project = info.Config?.Labels?.[COMPOSE_PROJECT_LABEL];

    const preferred = project === undefined ? undefined : networks[`${project}_default`]?.IPAddress;
    if (preferred) {
        return preferred;
    }
    for (const network of Object.values(networks)) {
        if (network.IPAddress) {
            return network.IPAddress;
        }
    }
    return null;
}

// Answers every lookup with the pinned address (both the `all: true` and the
// single-address shape Node uses), so the probe host name is never resolved
// through DNS. An IP-literal host skips lookup entirely, which is why the
// connect target is also set explicitly in buildRequestOptions.
function pinnedLookup(address: string): LookupFunction {
    const family = address.includes(":") ? 6 : 4;
    return (_hostname, options, callback) => {
        if (options.all) {
            callback(null, [{address, family}]);
        } else {
            callback(null, address, family);
        }
    };
}

function errorCode(err: unknown): string | undefined {
    return typeof err === "object" && err !== null && "code" in err && typeof err.code === "string"
        ? err.code
        : undefined;
}

function classifyError(err: unknown, timeoutMs: number): ProbeOutcome {
    if (err instanceof ProbeTimeoutError) {
        return {ok: false, reason: {kind: "timeout", seconds: Math.ceil(timeoutMs / 1000)}};
    }
    const code = errorCode(err);
    if (code === "ECONNREFUSED" || code === "ECONNRESET") {
        return {ok: false, reason: {kind: "refused"}};
    }
    return {ok: false, reason: {kind: "network-unreachable"}};
}

function buildRequestOptions(
    target: URL,
    address: string,
    timeoutMs: number,
): http.RequestOptions & https.RequestOptions {
    const isHttps = target.protocol === "https:";
    return {
        method: "GET",
        // Connect to the container itself; the Host header keeps the name the
        // compose file used (e.g. `localhost:8080`), so name-based routing in
        // the app behaves as it would for a request from inside the container.
        hostname: address,
        port: target.port === "" ? (isHttps ? 443 : 80) : Number(target.port),
        path: `${target.pathname}${target.search}`,
        headers: {host: target.host, "user-agent": "Docktor-HealthProbe"},
        timeout: timeoutMs,
        agent: false,
        lookup: pinnedLookup(address),
        // A container IP never matches the certificate, so verification would
        // always fail. This is a liveness check: no credentials or body are
        // sent and the response body is discarded (RESEARCH A6, T-14-39).
        ...(isHttps && {rejectUnauthorized: false}),
    };
}

function requestOnce(target: URL, address: string, timeoutMs: number): Promise<ProbeOutcome> {
    const transport = target.protocol === "https:" ? https : http;

    return new Promise<ProbeOutcome>((resolve) => {
        let settled = false;
        const finish = (outcome: ProbeOutcome): void => {
            if (!settled) {
                settled = true;
                resolve(outcome);
            }
        };

        try {
            const req = transport.request(buildRequestOptions(target, address, timeoutMs), (res) => {
                const status = res.statusCode ?? 0;
                // Redirects are not followed, so a 3xx is seen as such (D-02). The
                // body is never read or stored (T-14-37).
                res.resume();
                finish(isProbeSuccess(status) ? {ok: true, status} : {ok: false, reason: {kind: "http-status", status}});
            });

            // The socket timeout only fires on an idle socket; the deadline also
            // bounds a server that keeps sending.
            const deadline = setTimeout(() => req.destroy(new ProbeTimeoutError()), timeoutMs);
            req.on("close", () => clearTimeout(deadline));
            req.on("timeout", () => req.destroy(new ProbeTimeoutError()));
            req.on("error", (err) => finish(classifyError(err, timeoutMs)));
            req.end();
        } catch (err) {
            // request() throws synchronously for options Node rejects outright.
            finish(classifyError(err, timeoutMs));
        }
    });
}

/**
 * Issues the HTTP probe from compose's `x-docktor.health-probe` (#23, D-02).
 *
 * The URL comes from a hand-editable compose file, so it is re-validated with
 * the shared schema before anything else (T-14-36): only localhost,
 * 127.0.0.1 and [::1] over http/https without userinfo are probed, and the
 * name is never resolved. The request goes to the inspected container's own
 * network address instead.
 */
export class ProbeTransport implements ProbeTransportPort {
    constructor(private readonly docker: Pick<DockerodeClientPort, "inspectContainer">) {}

    async probe(request: ProbeRequest): Promise<ProbeObservation> {
        const validation = healthProbeUrlSchema.safeParse(request.url);
        if (!validation.success) {
            const message = validation.error.issues[0]?.message ?? "Enter a valid http:// or https:// URL.";
            return {containerStartedAt: null, outcome: {ok: false, reason: {kind: "invalid-config", message}}};
        }

        let info: Dockerode.ContainerInspectInfo;
        try {
            info = await this.docker.inspectContainer(request.containerId);
        } catch {
            return {containerStartedAt: null, outcome: {ok: false, reason: {kind: "no-address"}}};
        }

        const containerStartedAt = info.State?.StartedAt ?? null;
        const address = selectTargetAddress(info);
        if (address === null) {
            return {containerStartedAt, outcome: {ok: false, reason: {kind: "no-address"}}};
        }

        const outcome = await requestOnce(new URL(validation.data), address, request.timeoutMs);
        return {containerStartedAt, outcome};
    }
}

export const probeTransport = new ProbeTransport(dockerodeClient);
