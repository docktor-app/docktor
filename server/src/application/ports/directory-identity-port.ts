import type {DirectoryIdentity} from "../../domain/directory-identity.js";

/**
 * Port for telling which directory a path names (G-18-22-inplace). One folder
 * has several spellings inside Docktor's container (the read-only `/host` view,
 * the same-path stacks mount, symlinks); the identity captures all of them so
 * services compare directories, not strings. Declared here so application
 * services stay unit-testable with a plain fake.
 */
export interface DirectoryIdentityPort {
    /**
     * A directory named by a path as Docktor itself sees it: a scanned path, a
     * stack's `hostPath`, a stacks-folder target. The directory need not exist.
     * Never rejects.
     */
    identifyLocal(directory: string): Promise<DirectoryIdentity>;

    /**
     * A directory named by a compose label (`com.docker.compose.project.working_dir`,
     * or the directory of a `config_files` entry): a host path, or a container
     * path when Docktor's own compose CLI created the container. Never rejects.
     */
    identifyLabel(directory: string): Promise<DirectoryIdentity>;
}

export type {DirectoryIdentity};
