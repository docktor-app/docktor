import fs from "node:fs/promises";
import path from "node:path";
import {localDirectoryIdentity, type DirectoryIdentity} from "../domain/directory-identity.js";
import type {DirectoryIdentityPort} from "../application/ports/directory-identity-port.js";
import type {OwnMountsPort} from "../application/ports/own-mounts-port.js";
import {dockerSelfStack} from "./docker-self-stack.js";

/**
 * Resolves directory identities from the real filesystem (`fs.realpath`, which
 * follows symlinks) and Docktor's own bind mounts (container path to host
 * path). Nothing here is rejected: a path that does not exist yet, or one
 * `realpath` cannot read, is identified by its plain spelling.
 */
export class DirectoryIdentityResolver implements DirectoryIdentityPort {
    constructor(
        private readonly ownMounts: OwnMountsPort = dockerSelfStack,
        private readonly realpath: (p: string) => Promise<string> = (p) => fs.realpath(p),
    ) {}

    async identifyLocal(directory: string): Promise<DirectoryIdentity> {
        const spelling = path.resolve(directory);
        const view = await this.ownMounts.ownMounts();
        const resolved = await this.realpath(spelling).catch(() => null);
        return localDirectoryIdentity(resolved === null ? [spelling] : [spelling, resolved], view);
    }
}

export const directoryIdentityResolver = new DirectoryIdentityResolver();
