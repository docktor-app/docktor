import {isOwnComposeFile} from "../domain/self-stack-paths.js";
import {BadRequestError} from "../lib/errors.js";
import type {SelfStackPort} from "./ports/self-stack-port.js";

/**
 * One shared own-stack detection for every brownfield entry point (scan,
 * adopt, migrate), so the three paths cannot drift (D-03).
 *
 * STK-03/WR-09: Docktor must never adopt or migrate the compose file it runs
 * from; a migrate with `stopOldStack` would run `docker compose stop` on
 * Docktor itself mid-request. Fail-open (D-02): when the own stack cannot be
 * identified (not containerized, label missing, lookup failed) nothing is
 * refused, exactly like the scan filter.
 */

/**
 * The container-visible compose file path(s) of Docktor's own stack, or an
 * empty list when unknown. Defence in depth for D-02: even a faulty
 * SelfStackPort must not fail the caller.
 */
export async function lookupOwnComposeFiles(selfStack: SelfStackPort, caller: string): Promise<readonly string[]> {
    try {
        return await selfStack.composeFilePaths();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[${caller}] self-stack lookup failed, Docktor's own stack cannot be recognised: ${message}`);
        return [];
    }
}

/** Throws a BadRequestError when `composePath` is Docktor's own compose file (WR-09). */
export async function assertNotOwnStack(selfStack: SelfStackPort, composePath: string, caller: string): Promise<void> {
    const ownPaths = await lookupOwnComposeFiles(selfStack, caller);
    if (isOwnComposeFile(composePath, ownPaths)) {
        throw new BadRequestError("This is the stack Docktor itself runs in; it cannot be adopted or migrated.");
    }
}
