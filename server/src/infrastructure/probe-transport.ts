import http from "node:http";
import https from "node:https";
import type {LookupFunction} from "node:net";
import {hostname} from "node:os";
import type Dockerode from "dockerode";
import {healthProbeUrlSchema} from "@docktor/shared";
import {isProbeSuccess, PROBE_DOCKER_CALL_TIMEOUT_MS, type ProbeOutcome} from "../domain/health-probe.js";
import type {DockerodeClientPort} from "../application/ports/dockerode-client-port.js";
import type {
    ProbeObservation,
    ProbeRequest,
    ProbeTransportPort,
} from "../application/ports/probe-transport-port.js";
import {isContainerized} from "../lib/stacks-dir.js";
import {DeadlineExceededError, withDeadline} from "../lib/with-deadline.js";
import {dockerodeClient} from "./dockerode-client.js";

const COMPOSE_PROJECT_LABEL = "com.docker.compose.project";

/**
 * Endpoint alias on every network attachment made for a probe (amended D-05).
 * Docktor's own compose networks never carry it, so the startup sweep can
 * recognise exactly the attachments a crashed run left behind.
 */
export const PROBE_ENDPOINT_ALIAS = "docktor-health-probe";

const NO_ADDRESS: ProbeOutcome = {ok: false, reason: {kind: "no-address"}};
const NETWORK_UNREACHABLE: ProbeOutcome = {ok: false, reason: {kind: "network-unreachable"}};

/** Identifies Docktor's own container; null when Docktor is not running in one. */
export interface SelfContainer {
    containerId(): Promise<string | null>;
}

// Docktor identifies its own container by the hostname Docker assigns it (the
// short container id), as socket-inspector does. Resolved once.
function createDefaultSelf(): SelfContainer {
    let resolved: Promise<string | null> | undefined;
    return {
        containerId: () => (resolved ??= isContainerized().then((containerized) => (containerized ? hostname() : null))),
    };
}

type ProbeDocker = Pick<DockerodeClientPort, "inspectContainer" | "connectNetwork" | "disconnectNetwork">;
type EndpointMap = NonNullable<Dockerode.ContainerInspectInfo["NetworkSettings"]>["Networks"];

class ProbeTimeoutError extends Error {
    constructor() {
        super("probe timed out");
        this.name = "ProbeTimeoutError";
    }
}

/**
 * Picks the address Docktor sends the probe to when it can reach the
 * container's networks directly: the stack's own `<project>_default` network
 * when the container has an address there, else the first network with one.
 * Null when the container has none.
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

interface AddressedNetwork {
    name: string;
    networkId: string | null;
    address: string;
}

interface NetworkChoice {
    network: AddressedNetwork;
    /** False when Docktor already holds this network on its own, so no attach is needed. */
    attach: boolean;
}

function hasProbeAlias(endpoint: {Aliases?: string[] | null}): boolean {
    return endpoint.Aliases?.includes(PROBE_ENDPOINT_ALIAS) ?? false;
}

function addressedNetworks(info: Dockerode.ContainerInspectInfo): AddressedNetwork[] {
    return Object.entries(info.NetworkSettings?.Networks ?? {})
        .filter(([, endpoint]) => Boolean(endpoint.IPAddress))
        .map(([name, endpoint]) => ({name, networkId: endpoint.NetworkID || null, address: endpoint.IPAddress}));
}

// Amended D-05 network choice: a network Docktor already holds (not through a
// probe attachment) needs no attach; else the stack's `<project>_default`;
// else the first network with an address.
function chooseNetwork(
    candidates: ReadonlyArray<AddressedNetwork>,
    selfNetworks: EndpointMap,
    project: string | undefined,
): NetworkChoice | null {
    const shared = candidates.find((candidate) => {
        const held = selfNetworks[candidate.name];
        return held !== undefined && !hasProbeAlias(held);
    });
    if (shared !== undefined) return {network: shared, attach: false};

    const preferred = project === undefined ? undefined : candidates.find((c) => c.name === `${project}_default`);
    const network = preferred ?? candidates[0];
    return network === undefined ? null : {network, attach: true};
}

// Every Docker call on the probe path goes through here, so none can hang a
// probe for longer than PROBE_DOCKER_CALL_TIMEOUT_MS. A miss is logged once.
async function bounded<T>(what: string, call: (signal: AbortSignal) => Promise<T>): Promise<T> {
    try {
        return await withDeadline(what, PROBE_DOCKER_CALL_TIMEOUT_MS, call);
    } catch (err) {
        if (err instanceof DeadlineExceededError) {
            console.warn(
                `[ProbeTransport] Docker did not answer the ${what} within ${PROBE_DOCKER_CALL_TIMEOUT_MS / 1000}s; recording a failed probe`,
            );
        }
        throw err;
    }
}

function statusCodeOf(err: unknown): number | undefined {
    return typeof err === "object" && err !== null && "statusCode" in err && typeof err.statusCode === "number"
        ? err.statusCode
        : undefined;
}

// Connecting a container that is already connected fails with HTTP 403; for an
// attach that is exactly the state we wanted.
function isAlreadyConnected(err: unknown): boolean {
    if (statusCodeOf(err) === 403) return true;
    return err instanceof Error && err.message.includes("already exists");
}

interface Attachment {
    count: number;
    ready: Promise<void>;
}

/**
 * Refcounts Docktor's attachment to a network so concurrent probes on one
 * network share a single attachment: connected when the first starts,
 * disconnected when the last finishes. A new attach waits for an in-flight
 * disconnect of the same network, so it cannot be torn down underneath it.
 */
class NetworkAttachments {
    private readonly active = new Map<string, Attachment>();
    private readonly detaching = new Map<string, Promise<void>>();

    constructor(private readonly docker: Pick<DockerodeClientPort, "connectNetwork" | "disconnectNetwork">) {}

    /** Runs `run` while attached. Rejects, without running it, only when the connect failed. */
    async with<T>(networkId: string, selfId: string, run: () => Promise<T>): Promise<T> {
        await this.acquire(networkId, selfId);
        try {
            return await run();
        } finally {
            await this.release(networkId, selfId);
        }
    }

    private acquire(networkId: string, selfId: string): Promise<void> {
        const existing = this.active.get(networkId);
        if (existing !== undefined) {
            existing.count++;
            return existing.ready;
        }

        const attachment: Attachment = {
            count: 1,
            ready: this.connect(networkId, selfId).catch((err: unknown) => {
                // Forget a failed attach at once so the next probe retries it.
                if (this.active.get(networkId) === attachment) this.active.delete(networkId);
                throw err;
            }),
        };
        this.active.set(networkId, attachment);
        return attachment.ready;
    }

    private async connect(networkId: string, selfId: string): Promise<void> {
        await this.detaching.get(networkId);
        try {
            await this.docker.connectNetwork(networkId, selfId, [PROBE_ENDPOINT_ALIAS]);
        } catch (err) {
            if (!isAlreadyConnected(err)) throw err;
        }
    }

    private async release(networkId: string, selfId: string): Promise<void> {
        const attachment = this.active.get(networkId);
        if (attachment === undefined) return;
        attachment.count--;
        if (attachment.count > 0) return;

        this.active.delete(networkId);
        const disconnected = this.disconnect(networkId, selfId);
        this.detaching.set(networkId, disconnected);
        try {
            await disconnected;
        } finally {
            if (this.detaching.get(networkId) === disconnected) this.detaching.delete(networkId);
        }
    }

    // A failed disconnect never changes the probe's outcome; the alias marker
    // lets the startup sweep reclaim the attachment.
    private async disconnect(networkId: string, selfId: string): Promise<void> {
        try {
            await this.docker.disconnectNetwork(networkId, selfId);
        } catch (err) {
            console.warn(`[ProbeTransport] failed to disconnect from network ${networkId}; the startup sweep will remove it:`, err);
        }
    }
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
    return NETWORK_UNREACHABLE;
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
 *
 * Reachability (amended D-05): Docker does not route between bridge
 * networks, so when Docktor runs in a container and shares no network with
 * the target it joins the target's network for the duration of the request
 * only. Concurrent probes on one network share one attachment. Outside a
 * container (`yarn dev`) the container address is requested directly.
 */
export class ProbeTransport implements ProbeTransportPort {
    private readonly attachments: NetworkAttachments;

    constructor(
        private readonly docker: ProbeDocker,
        private readonly self: SelfContainer = createDefaultSelf(),
    ) {
        this.attachments = new NetworkAttachments(docker);
    }

    async probe(request: ProbeRequest): Promise<ProbeObservation> {
        const validation = healthProbeUrlSchema.safeParse(request.url);
        if (!validation.success) {
            const message = validation.error.issues[0]?.message ?? "Enter a valid http:// or https:// URL.";
            return {containerStartedAt: null, outcome: {ok: false, reason: {kind: "invalid-config", message}}};
        }

        let info: Dockerode.ContainerInspectInfo;
        try {
            info = await bounded(`inspect of container "${request.containerId}"`, () =>
                this.docker.inspectContainer(request.containerId),
            );
        } catch (err) {
            // Fail-closed (D-02, D-08): a daemon that does not answer is a failed probe.
            return {containerStartedAt: null, outcome: err instanceof DeadlineExceededError ? NETWORK_UNREACHABLE : NO_ADDRESS};
        }

        const target = new URL(validation.data);
        const outcome = await this.withReachableAddress(info, (address) => requestOnce(target, address, request.timeoutMs));
        return {containerStartedAt: info.State?.StartedAt ?? null, outcome};
    }

    async sweepStaleAttachments(): Promise<number> {
        try {
            const selfId = await this.self.containerId();
            if (selfId === null) return 0;

            const info = await this.docker.inspectContainer(selfId);
            let removed = 0;
            for (const [name, endpoint] of Object.entries(info.NetworkSettings?.Networks ?? {})) {
                if (!hasProbeAlias(endpoint) || !endpoint.NetworkID) continue;
                try {
                    await this.docker.disconnectNetwork(endpoint.NetworkID, selfId);
                    removed++;
                } catch (err) {
                    console.warn(`[ProbeTransport] could not remove the stale probe attachment to network "${name}":`, err);
                }
            }
            return removed;
        } catch (err) {
            console.warn("[ProbeTransport] stale probe attachment sweep failed:", err);
            return 0;
        }
    }

    // Runs `request` against an address Docktor can reach, attaching to the
    // target's network for the duration when it has to (amended D-05).
    private async withReachableAddress(
        info: Dockerode.ContainerInspectInfo,
        request: (address: string) => Promise<ProbeOutcome>,
    ): Promise<ProbeOutcome> {
        const selfId = await this.self.containerId();
        if (selfId === null) {
            const address = selectTargetAddress(info);
            return address === null ? NO_ADDRESS : request(address);
        }

        const candidates = addressedNetworks(info);
        if (candidates.length === 0) return NO_ADDRESS;

        let selfInfo: Dockerode.ContainerInspectInfo;
        try {
            selfInfo = await this.docker.inspectContainer(selfId);
        } catch {
            return NETWORK_UNREACHABLE;
        }

        const choice = chooseNetwork(
            candidates,
            selfInfo.NetworkSettings?.Networks ?? {},
            info.Config?.Labels?.[COMPOSE_PROJECT_LABEL],
        );
        if (choice === null) return NO_ADDRESS;
        if (!choice.attach) return request(choice.network.address);
        if (choice.network.networkId === null) return NETWORK_UNREACHABLE;

        try {
            // `request` never rejects, so a rejection here is the connect failing.
            return await this.attachments.with(choice.network.networkId, selfId, () => request(choice.network.address));
        } catch {
            return NETWORK_UNREACHABLE;
        }
    }
}

export const probeTransport = new ProbeTransport(dockerodeClient);
