import type {FilesystemSpace} from "../../domain/disk-space.js";

/**
 * Port for the free-space and size measurements behind the migration's disk
 * check (#107, D-08): application code depends on this interface, never on the
 * concrete DiskSpaceProbe, so it stays unit-testable with a plain fake.
 */
export interface DiskSpaceProbePort {
    /**
     * The filesystem a path lives on and what it has free. A path that does not
     * exist yet is answered for its nearest existing ancestor, because that is
     * the filesystem the path will be created on.
     */
    filesystemOf(path: string): Promise<FilesystemSpace>;

    /** Allocated size of a directory in bytes, or null when it cannot be determined. */
    measureDirectoryBytes(path: string): Promise<number | null>;

    /**
     * Allocated size of a Docker volume in bytes, or null when it cannot be
     * determined. Only call it for a volume verified to exist: mounting a
     * missing volume makes Docker create an empty one.
     */
    measureVolumeBytes(volumeName: string): Promise<number | null>;
}
