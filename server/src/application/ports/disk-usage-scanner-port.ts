/**
 * Port for the disk usage measurement behind #27 (D-07: application and job
 * code depend on this interface, never the concrete DiskUsageScanner class,
 * so they stay unit-testable with a plain fake).
 *
 * The concrete adapter lists directories with `fs.readdir` and sizes them
 * with `du`, one invocation per path (see infrastructure/disk-usage-scanner.ts).
 */
export interface DiskUsageScannerPort {
    /**
     * Names of the real subdirectories of `volumesDir`. Symlinks and plain
     * files are excluded. Resolves null when the directory does not exist.
     */
    listVolumeDirectories(volumesDir: string): Promise<string[] | null>;

    /** Allocated size of `path` in bytes, or null when it cannot be determined. */
    measureBytes(path: string): Promise<number | null>;
}
