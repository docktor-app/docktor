import {BadRequestError} from "../lib/errors.js";

/**
 * Pure business rules behind ProxyService.assignDomain and
 * adoptUnmanagedDomains (D-08). No repository, no database client, no
 * filesystem, no Fastify — every function here takes plain data in and
 * returns a decision or throws, leaving every effect (repository reads and
 * writes, the compose sync, the keyed lock, the rollback) in the service
 * that calls it.
 */

/** The subset of a ProxyConfig row these rules need to decide anything. */
export interface ProxyConfigRowLike {
    id: string;
    domain: string;
    internalPort: number;
}

export type DomainAssignmentDecision =
    | {action: "reuse"; existingRowId: string; repointRowIds: string[]}
    | {action: "create"; repointRowIds: []};

/**
 * Decides whether an incoming (domain, internalPort) assignment for one
 * (stackId, serviceName) pair reuses an existing row or creates a new one,
 * and which sibling rows (rows for the same service, a different domain)
 * must be repointed to the requested port — nginx-proxy permits only one
 * VIRTUAL_PORT per container, so every row for a service must share one
 * port.
 *
 * Refuses with the exact BadRequestError message the service raised inline
 * before this extraction when no row matches the requested domain and a
 * sibling row is already proxied on a different port — that message reaches
 * the client and must not drift (phase boundary: no API contract change).
 */
export function decideDomainAssignment(
    existingRowsForService: ProxyConfigRowLike[],
    serviceName: string,
    domain: string,
    internalPort: number,
): DomainAssignmentDecision {
    const existingRow = existingRowsForService.find((row) => row.domain === domain);

    if (existingRow) {
        const repointRowIds = existingRowsForService
            .filter((row) => row.id !== existingRow.id && row.internalPort !== internalPort)
            .map((row) => row.id);
        return {action: "reuse", existingRowId: existingRow.id, repointRowIds};
    }

    const conflictingPort = existingRowsForService.find((row) => row.internalPort !== internalPort);
    if (conflictingPort) {
        throw new BadRequestError(
            `Service "${serviceName}" is already proxied on port ${conflictingPort.internalPort} — all domains for one service must share the same internal port`,
        );
    }

    return {action: "create", repointRowIds: []};
}

export interface CertificateBinding {
    certSource: "acme" | "custom";
    certificateId: string | null;
}

/**
 * Resolves the certificate binding a request implies: an automatic
 * ("acme") source always normalises to a null certificate reference,
 * regardless of any id the caller supplied, while a "custom" source
 * requires an id and refuses with the exact BadRequestError message the
 * service raised inline before this extraction when one is absent.
 * Verifying that a referenced certificate id actually exists stays in the
 * service — that is a repository read, not a rule.
 */
export function resolveCertificateBinding(
    certSource: "acme" | "custom" | undefined,
    certificateId: string | null | undefined,
): CertificateBinding {
    const source = certSource ?? "acme";

    if (source === "custom") {
        if (!certificateId) {
            throw new BadRequestError("certificateId is required when certSource is custom");
        }
        return {certSource: "custom", certificateId};
    }

    return {certSource: "acme", certificateId: null};
}

/**
 * Filters a list of domains discovered in a compose file down to the ones
 * not already present in the given already-assigned set, preserving the
 * input order — the pure part of adoptUnmanagedDomains.
 */
export function filterUnadoptedDomains(discoveredDomains: string[], alreadyAssignedDomains: Set<string>): string[] {
    return discoveredDomains.filter((domain) => !alreadyAssignedDomains.has(domain));
}
