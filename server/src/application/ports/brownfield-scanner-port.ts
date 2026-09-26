import type {ScanResult} from "../../infrastructure/brownfield-scanner.js";

/**
 * Port for the host-filesystem brownfield-import scanner dependency (D-07).
 * Declared here rather than consumers importing the concrete
 * BrownfieldScanner class, so application services stay unit-testable with
 * a plain fake and the dependency arrow keeps pointing inward (application
 * depends on a port, not on infrastructure/).
 */
export interface BrownfieldScannerPort {
    scan(directories: string[]): Promise<ScanResult>;
}

export type {ScanResult};
