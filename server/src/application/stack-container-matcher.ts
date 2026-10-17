import {composeProjectDirectory} from "../domain/compose-labels.js";
import {relateDirectories} from "../domain/directory-identity.js";
import {directoryIdentityResolver} from "../infrastructure/directory-identity-resolver.js";
import type {DirectoryIdentityPort} from "./ports/directory-identity-port.js";

/**
 * Decides whether a container of a stack's compose project is really the
 * stack's own (G-18-22-status). An old copy of a stack left running from
 * another directory under the same project name must not count for the
 * migrated stack: its events, the reconcile and the post-deploy catch-up would
 * otherwise write the new stack's service rows and make it RUNNING.
 */
export class StackContainerMatcher {
    constructor(
        private readonly directories: Pick<DirectoryIdentityPort, "identifyLocal" | "identifyLabel"> = directoryIdentityResolver,
    ) {}

    /**
     * The caller has already matched the container's project label to the
     * stack id. Outcomes:
     * - no compose directory label (legacy container): true, the project rule;
     * - Docktor cannot read its own mounts (host paths cannot be translated): true, the project rule;
     * - otherwise true only when the compose directory is the stack's directory by canonical identity.
     */
    async belongsTo(
        stack: {readonly id: string; readonly hostPath: string},
        labels: Readonly<Record<string, string>> | undefined,
    ): Promise<boolean> {
        const composeDirectory = composeProjectDirectory(labels);
        if (composeDirectory === null) {
            return true;
        }
        const [stackIdentity, containerIdentity] = await Promise.all([
            this.directories.identifyLocal(stack.hostPath),
            this.directories.identifyLabel(composeDirectory),
        ]);
        if (!stackIdentity.mountsKnown || !containerIdentity.mountsKnown) {
            return true;
        }
        return relateDirectories(stackIdentity, containerIdentity) === "same";
    }
}

export const stackContainerMatcher = new StackContainerMatcher();
