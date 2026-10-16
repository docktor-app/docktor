import {findManagingStack} from "../domain/managed-stack-paths.js";
import {ConflictError} from "../lib/errors.js";
import type {StackRepository} from "../repositories/stack-repository.js";

/**
 * One shared "already managed" refusal for adopt and migrate (G-18-2), so a
 * compose file in a directory Docktor manages can never be imported twice,
 * whichever entry point or stale list the request came from.
 */

/** Throws a ConflictError when `composePath` sits in the directory of an existing Docktor stack. */
export async function assertNotManaged(
    stacks: Pick<StackRepository, "listLocations">,
    composePath: string,
): Promise<void> {
    const managing = findManagingStack(composePath, await stacks.listLocations());
    if (managing) {
        throw new ConflictError(
            `This stack is already managed by Docktor as "${managing.displayName}". Open it from the stacks list instead of importing it again.`,
        );
    }
}
