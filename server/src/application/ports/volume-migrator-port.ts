/**
 * Port for the Docker-named-volume-to-bind-mount migration dependency
 * (D-07). Declared here rather than consumers importing the concrete
 * VolumeMigrator class, so application services stay unit-testable with a
 * plain fake and the dependency arrow keeps pointing inward (application
 * depends on a port, not on infrastructure/).
 */
export interface VolumeMigratorPort {
    copyVolumeToBindMount(volumeName: string, destPath: string): Promise<void>;

    copyDirectory(srcPath: string, destPath: string): Promise<void>;
}
