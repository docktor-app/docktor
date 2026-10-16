import {toComparablePath} from "./self-stack-paths.js";

/**
 * Pure rules for recognising compose files that Docktor already manages
 * (G-18-2): a scanned stack must not be adopted or migrated a second time.
 *
 * Docktor keeps one stack per directory and stores that directory as the
 * stack's `hostPath` (container-visible: Docktor-created and migrated stacks
 * live in the stacks directory, adopted stacks keep the scanned directory).
 * A compose file is therefore managed when its directory equals a stack's
 * `hostPath`; a sibling compose file in a managed directory counts as managed
 * too. Comparison is exact and case-sensitive, like the Linux container the
 * scan runs in.
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

function stripTrailingSeparators(comparablePath: string): string {
    let end = comparablePath.length;
    while (end > 1 && comparablePath[end - 1] === "/") {
        end--;
    }
    return comparablePath.slice(0, end);
}

function directoryOf(comparablePath: string): string {
    const lastSeparator = comparablePath.lastIndexOf("/");
    if (lastSeparator < 0) {
        return "";
    }
    return lastSeparator === 0 ? "/" : comparablePath.slice(0, lastSeparator);
}

/** The managed stack whose directory contains `composePath`, or null. */
export function findManagingStack(
    composePath: string,
    managed: readonly ManagedStackLocation[],
): ManagedStackRef | null {
    const directory = directoryOf(toComparablePath(composePath));
    const match = managed.find(
        (stack) => stripTrailingSeparators(toComparablePath(stack.hostPath)) === directory,
    );
    return match ? {id: match.id, displayName: match.displayName} : null;
}

/** Adds `managedStack` (the managing stack or null) to every row, keeping order and all other fields. */
export function annotateManagedStacks<T extends {readonly path: string}>(
    rows: readonly T[],
    managed: readonly ManagedStackLocation[],
): Array<T & {managedStack: ManagedStackRef | null}> {
    return rows.map((row) => ({...row, managedStack: findManagingStack(row.path, managed)}));
}
