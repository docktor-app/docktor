import type {DiscoveredStack, ScanResult} from "@docktor/shared";

/**
 * Port for the host-filesystem brownfield-import scanner dependency (D-07).
 * Declared here rather than consumers importing the concrete
 * BrownfieldScanner class, so application services stay unit-testable with
 * a plain fake and the dependency arrow keeps pointing inward (application
 * depends on a port, not on infrastructure/).
 */
export interface BrownfieldScannerPort {
    scan(directories: string[]): Promise<DirectoryScanResult>;
}

/**
 * What the filesystem scanner finds. It knows nothing about Docktor's stack
 * records, so `managedStack` is added later by OnboardingService.scan (G-18-2).
 */
export type ScannedStack = Omit<DiscoveredStack, "managedStack">;

export type DirectoryScanResult = Omit<ScanResult, "stacks"> & {stacks: ScannedStack[]};

export type {ScanResult};
