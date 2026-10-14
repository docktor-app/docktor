import path from "node:path";

// Imported from the port's re-export (not infrastructure/restic-executor.js
// directly) so this stays a domain -> application/ports/ type-only edge
// rather than a domain -> infrastructure/ edge the layering fitness rule
// (test/unit/architecture/layering.test.ts) forbids. Same edge as
// backup-retention-policy.ts.
import type {BackupRepoConfig} from "../application/ports/restic-executor-port.js";
import {SFTP_HOST_PATTERN, SFTP_USER_PATTERN} from "@docktor/shared";

import {BadRequestError} from "../lib/errors.js";

/**
 * Pure resolver from the configured backup repository plus a stack to the
 * restic repository that stack's backups live in.
 *
 * Layout (D-01): remote repositories are one restic repository PER STACK,
 * `<repoPath>/<stackId>` for SFTP and `<bucket>/<stackId>` for S3. That
 * mirrors the one-repository-per-stack local layout (`<hostPath>/backups`),
 * so retention, restore and snapshot listing stay stack-scoped without tag
 * filtering. The `local` type is unchanged (D-02): snapshots written before
 * remote repositories were honoured stay listed and restorable.
 *
 * Hard-fail rule (D-05): a remote type NEVER falls back to the stack-local
 * path. An incomplete or undecryptable remote configuration throws a
 * BadRequestError naming the missing fields; the silent fallback to the local
 * path is exactly the bug of issue #68. Messages list field labels only,
 * never secret values.
 */

export interface SftpConnection {
    readonly host: string;
    readonly user: string;
    readonly privateKey: string;
    /** ssh port; absent means the ssh default (22). */
    readonly port?: number;
}

export type ResticRepositoryTarget =
    | {readonly kind: "local"; readonly repository: string; readonly env: Readonly<Record<string, string>>}
    | {readonly kind: "s3"; readonly repository: string; readonly env: Readonly<Record<string, string>>}
    | {
        readonly kind: "sftp";
        readonly repository: string;
        readonly env: Readonly<Record<string, string>>;
        readonly sftp: SftpConnection;
    };

export interface BackupStackLocation {
    readonly id: string;
    readonly hostPath?: string | null;
}

/** A stored port is text; blank or malformed means "not set". */
export function parseStoredPort(raw: string | undefined): number | null {
    const port = Number.parseInt(raw ?? "", 10);
    return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

export const DEFAULT_S3_ENDPOINT = "s3.amazonaws.com";
export const DEFAULT_SFTP_REPO_PATH = "/backups";

// slugify output is a subset: no dots and no slashes, so a stack id can never
// address another stack's sub-repository through path traversal.
const REMOTE_STACK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const LEADING_SLASHES = /^\/+/;
const TRAILING_SLASHES = /\/+$/;

export function resolveResticRepository(config: BackupRepoConfig, stack: BackupStackLocation): ResticRepositoryTarget {
    switch (config.repoType) {
        case "s3":
            return resolveS3(config, stack);
        case "sftp":
            return resolveSftp(config, stack);
        case "local":
            return resolveLocal(config, stack);
    }
}

function resolveLocal(config: BackupRepoConfig, stack: BackupStackLocation): ResticRepositoryTarget {
    const repository = stack.hostPath ? path.resolve(stack.hostPath, "backups") : (config.repoPath ?? "").trim();
    if (repository === "") {
        throw new BadRequestError("Local backup repository path is not configured");
    }
    return {
        kind: "local",
        repository,
        env: {RESTIC_REPOSITORY: repository, RESTIC_PASSWORD: config.password},
    };
}

function resolveS3(config: BackupRepoConfig, stack: BackupStackLocation): ResticRepositoryTarget {
    const bucket = (config.s3Bucket ?? "").trim();
    const accessKey = (config.s3AccessKey ?? "").trim();
    assertConfigured("S3", [
        ["S3 bucket", bucket !== ""],
        ["S3 access key", accessKey !== ""],
        ["S3 secret key", isPresent(config.s3SecretKey)],
        ["repository password", config.password !== ""],
    ]);
    assertRemoteStackId(stack.id);

    const endpoint = (config.s3Endpoint ?? "").trim().replace(TRAILING_SLASHES, "");
    const base = endpoint === "" ? DEFAULT_S3_ENDPOINT : endpoint;
    const repository = `s3:${base}/${bucket.replace(LEADING_SLASHES, "").replace(TRAILING_SLASHES, "")}/${stack.id}`;
    return {
        kind: "s3",
        repository,
        env: {
            RESTIC_REPOSITORY: repository,
            RESTIC_PASSWORD: config.password,
            AWS_ACCESS_KEY_ID: accessKey,
            // Exactly as decrypted: secrets are never trimmed or altered.
            AWS_SECRET_ACCESS_KEY: config.s3SecretKey ?? "",
        },
    };
}

function resolveSftp(config: BackupRepoConfig, stack: BackupStackLocation): ResticRepositoryTarget {
    const host = (config.sftpHost ?? "").trim();
    const user = (config.sftpUser ?? "").trim();
    assertConfigured("SFTP", [
        ["SFTP host", host !== ""],
        ["SFTP user", user !== ""],
        ["SFTP private key", isPresent(config.sftpKey)],
        ["repository password", config.password !== ""],
    ]);
    if (!SFTP_HOST_PATTERN.test(host)) {
        throw new BadRequestError(`SFTP host "${host}" is not a valid host name`);
    }
    if (!SFTP_USER_PATTERN.test(user)) {
        throw new BadRequestError(`SFTP user "${user}" is not a valid user name`);
    }
    assertRemoteStackId(stack.id);

    const configuredPath = (config.repoPath ?? "").trim();
    const basePath = (configuredPath === "" ? DEFAULT_SFTP_REPO_PATH : configuredPath).replace(TRAILING_SLASHES, "");
    const repository = `sftp:${user}@${host}:${basePath}/${stack.id}`;
    return {
        kind: "sftp",
        repository,
        // The private key travels only in `sftp`, never in the process env.
        env: {RESTIC_REPOSITORY: repository, RESTIC_PASSWORD: config.password},
        sftp: {host, user, privateKey: config.sftpKey ?? "", ...(config.sftpPort === undefined ? {} : {port: config.sftpPort})},
    };
}

/** A decrypted secret is usable when it is a non-blank string. */
function isPresent(value: string | undefined): boolean {
    return value !== undefined && value.trim() !== "";
}

function assertConfigured(label: string, checks: ReadonlyArray<readonly [field: string, present: boolean]>): void {
    const missing = checks.filter(([, present]) => !present).map(([field]) => field);
    if (missing.length > 0) {
        throw new BadRequestError(
            `${label} backup repository is not fully configured: missing ${missing.join(", ")}. ` +
                "Values that cannot be decrypted count as missing; re-enter them in Settings > Backup.",
        );
    }
}

function assertRemoteStackId(stackId: string): void {
    if (!REMOTE_STACK_ID_PATTERN.test(stackId)) {
        throw new BadRequestError(`Stack id "${stackId}" cannot be used as a remote backup repository path`);
    }
}
