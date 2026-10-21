import {relateDirectories, type DirectoryIdentity} from "./directory-identity.js";
import {toComparablePath} from "./self-stack-paths.js";

/**
 * Pure rules for recognising compose files that Docktor already manages
 * (G-18-2): a scanned stack must not be adopted or migrated a second time.
 *
 * Docktor keeps one stack per directory and stores that directory as the
 * stack's `hostPath`. A compose file is therefore managed when its directory
 * IS the directory of a stack; a sibling compose file in a managed directory
 * counts as managed too. "Is" is decided over directory identities, not text
 * (review WR-10): the scan reaches a managed stack through the read-only
 * `/host` view or a symlink, and those spellings name the same directory.
 */

/** Where an existing Docktor stack lives. */
export interface ManagedStackLocation {
    readonly id: string;
    readonly displayName: string;
    readonly hostPath: string;
}

/** The identity of the stack managing a directory, as shown to the user. */
export interface ManagedStackRef {
    readonly id: string;
    readonly displayName: string;
}

/** A managed stack together with the identity of its directory. */
export interface IdentifiedManagedStack extends ManagedStackRef {
    readonly identity: DirectoryIdentity;
}

/** The directory part of a compose file path: "/" for a root file, "" for a bare file name. */
export function composeDirectoryOf(composePath: string): string {
    const comparablePath = toComparablePath(composePath);
    const lastSeparator = comparablePath.lastIndexOf("/");
    if (lastSeparator < 0) {
        return "";
    }
    return lastSeparator === 0 ? "/" : comparablePath.slice(0, lastSeparator);
}

/** The first managed stack whose directory is `directory`, or null. */
export function findManagingStack(
    directory: DirectoryIdentity,
    managed: readonly IdentifiedManagedStack[],
): ManagedStackRef | null {
    const match = managed.find((stack) => relateDirectories(directory, stack.identity) === "same");
    return match ? {id: match.id, displayName: match.displayName} : null;
}
