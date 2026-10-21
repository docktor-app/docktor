import type {DirectoryIdentityPort} from "../../src/application/ports/directory-identity-port.js";
import type {OwnMountsPort} from "../../src/application/ports/own-mounts-port.js";
import {DirectoryIdentityResolver} from "../../src/infrastructure/directory-identity-resolver.js";

/**
 * For service tests that must never reach Docker or the real filesystem for
 * identities: a real resolver over a host view (Docktor not containerized)
 * whose realpath returns its input, so identities are plain path comparisons.
 */
export function hostViewDirectories(): DirectoryIdentityPort {
    const hostView: OwnMountsPort = {ownMounts: () => Promise.resolve({kind: "host"})};
    return new DirectoryIdentityResolver(hostView, (p) => Promise.resolve(p));
}
