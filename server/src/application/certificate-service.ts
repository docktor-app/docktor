import {BadRequestError} from "../lib/errors.js";
import {decrypt, encrypt} from "../lib/crypto.js";
import {certFileBaseName} from "../domain/certificate-naming.js";
import {
    certCoversDomainPattern,
    certificateExpiry,
    parseCertificate,
    validateCertKeyPair,
} from "../domain/certificate-validation.js";
import type {CertificateDto, CertificateRepository} from "../repositories/certificate-repository.js";
import type {CertificateFilesystem} from "../infrastructure/certificate-filesystem.js";

export interface CreateCertificateInput {
    domainPattern: string;
    certificatePem: string;
    privateKeyPem: string;
    caBundlePem?: string | null;
}

export class CertificateService {
    constructor(
        private readonly certRepo: Pick<CertificateRepository, "create" | "toDto" | "delete">,
        private readonly fs: Pick<CertificateFilesystem, "writeCertificateFiles">,
    ) {}

    /**
     * Validates, encrypts, persists, and materialises one certificate
     * (D-12). Order matters: nothing is persisted or written to disk until
     * both validation checks pass. If the file write fails after the row
     * was created, the row is deleted before rethrowing, so the database
     * never claims a certificate that has no file (T-09-36).
     */
    async create(input: CreateCertificateInput): Promise<CertificateDto> {
        const validation = validateCertKeyPair(input.certificatePem, input.privateKeyPem);
        if (!validation.valid) {
            throw new BadRequestError(validation.reason);
        }

        // validateCertKeyPair already proved certificatePem parses; re-parse
        // to obtain the X509Certificate object for the coverage/expiry
        // checks below (parseCertificate is pure and cheap — no I/O).
        const parsed = parseCertificate(input.certificatePem);
        if (!parsed.ok) {
            throw new BadRequestError(parsed.reason);
        }

        if (!certCoversDomainPattern(parsed.cert, input.domainPattern)) {
            throw new BadRequestError(
                `The certificate does not cover the declared domain pattern "${input.domainPattern}"`,
            );
        }

        const expiresAt = certificateExpiry(parsed.cert);

        // The plaintext key is never assigned to a longer-lived variable,
        // logged, or included in an error — it flows straight from the
        // caller's input into encrypt(), and its only other appearance
        // (below) is the single decrypt() call immediately before the file
        // write (T-09-28).
        const row = await this.certRepo.create({
            domainPattern: input.domainPattern,
            privateKey: encrypt(input.privateKeyPem),
            certificate: input.certificatePem,
            caBundle: input.caBundlePem ?? null,
            expiresAt,
        });

        try {
            const baseName = certFileBaseName(input.domainPattern);
            await this.fs.writeCertificateFiles(baseName, {
                certificate: input.certificatePem,
                privateKey: decrypt(row.privateKey),
                caBundle: input.caBundlePem ?? null,
            });
        } catch (err) {
            // Filesystem write failed — the database must never claim a
            // certificate that has no file on disk (T-09-36). Deliberately
            // re-throwing the ORIGINAL error (not a wrapped one) after the
            // rollback, so the caller sees the real cause.
            await this.certRepo.delete(row.id).catch(() => {});
            throw err;
        }

        return this.certRepo.toDto(row);
    }
}
