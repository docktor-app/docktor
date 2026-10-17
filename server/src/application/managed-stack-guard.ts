import {
    composeDirectoryOf,
    findManagingStack,
    type IdentifiedManagedStack,
    type ManagedStackRef,
} from "../domain/managed-stack-paths.js";
import {ConflictError} from "../lib/errors.js";
import type {StackRepository} from "../repositories/stack-repository.js";
import type {DirectoryIdentityPort} from "./ports/directory-identity-port.js";

/**
 * One shared "already managed" refusal for adopt and migrate (G-18-2), so a
 * compose file in a directory Docktor manages can never be imported twice,
 * whichever entry point or stale list the request came from. Directories are
 * compared by identity, so the /host view and symlinks of a managed directory
 * are recognised too (review WR-10).
 */

/** Every Docktor stack with the identity of its directory. */
export async function identifyManagedStacks(
    stacks: Pick<StackRepository, "listLocations">,
    directories: Pick<DirectoryIdentityPort, "identifyLocal">,
): Promise<IdentifiedManagedStack[]> {
    const locations = await stacks.listLocations();
    return Promise.all(
        locations.map(async ({id, displayName, hostPath}) => ({
            id,
            displayName,
            identity: await directories.identifyLocal(hostPath),
        })),
    );
}

/** The managed stack whose directory contains `composePath`, or null. */
export async function managingStackOf(
    composePath: string,
    managed: readonly IdentifiedManagedStack[],
    directories: Pick<DirectoryIdentityPort, "identifyLocal">,
): Promise<ManagedStackRef | null> {
    const directory = composeDirectoryOf(composePath);
    // A bare file name has no directory to compare; never guess the working directory.
    if (directory === "" || managed.length === 0) {
        return null;
    }
    return findManagingStack(await directories.identifyLocal(directory), managed);
}

/** Throws a ConflictError when `composePath` sits in the directory of an existing Docktor stack. */
export async function assertNotManaged(
    stacks: Pick<StackRepository, "listLocations">,
    directories: Pick<DirectoryIdentityPort, "identifyLocal">,
    composePath: string,
): Promise<void> {
    const managed = await identifyManagedStacks(stacks, directories);
    const managing = await managingStackOf(composePath, managed, directories);
    if (managing) {
        throw new ConflictError(
            `This stack is already managed by Docktor as "${managing.displayName}". Open it from the stacks list instead of importing it again.`,
        );
    }
}
