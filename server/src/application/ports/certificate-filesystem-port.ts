import type {CertificateFileContent} from "../../infrastructure/certificate-filesystem.js";

/**
 * Port for the certificate file I/O dependency (D-07). Declared here rather
 * than consumers importing the concrete CertificateFilesystem class, so
 * application services stay unit-testable with a plain fake and the
 * dependency arrow keeps pointing inward (application depends on a port,
 * not on infrastructure/).
 */
export interface CertificateFilesystemPort {
    getCertsDir(): string;

    writeCertificateFiles(baseName: string, content: CertificateFileContent): Promise<void>;

    removeCertificateFiles(baseName: string): Promise<void>;
}

export type {CertificateFileContent};
