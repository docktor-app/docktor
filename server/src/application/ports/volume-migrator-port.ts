/**
 * Port for the Docker-named-volume-to-bind-mount migration dependency
 * (D-07). Declared here rather than consumers importing the concrete
 * VolumeMigrator class, so application services stay unit-testable with a
 * plain fake and the dependency arrow keeps pointing inward (application
 * depends on a port, not on infrastructure/).
 */
export interface VolumeMigratorPort {
    /**
     * Whether Docker has a volume of exactly this name. It only inspects: it
     * never creates anything (#101).
     */
    volumeExists(volumeName: string): Promise<boolean>;

    /**
     * Copies the data of the Docker volume `volumeName` (its real name, not the
     * compose key) into `destPath`. A volume that does not exist rejects before
     * anything runs, so an empty volume is never created and copied in its place.
     */
    copyVolumeToBindMount(volumeName: string, destPath: string): Promise<void>;

    /**
     * Copies a directory, file or symlink faithfully (CR-01): ownership when the
     * process is privileged, modes, timestamps and symlinks (verbatim, never
     * dereferenced) survive. A missing destination is created as a copy of the
     * source; an existing destination directory receives the source's contents
     * (merge, never a nested subdirectory named after the source). A missing
     * source or a failed copy rejects with its cause, and an empty destination
     * is never created implicitly.
     */
    copyDirectory(srcPath: string, destPath: string): Promise<void>;

    /**
     * Renames a directory (G-18-7). Rejects when the destination already exists;
     * it never merges into or replaces anything.
     */
    moveDirectory(srcPath: string, destPath: string): Promise<void>;
}
