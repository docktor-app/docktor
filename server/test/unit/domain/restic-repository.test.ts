import path from "node:path";

import {describe, expect, it} from "vitest";

import type {BackupRepoConfig} from "../../../src/application/ports/restic-executor-port.js";
import {resolveResticRepository} from "../../../src/domain/restic-repository.js";
import {BadRequestError} from "../../../src/lib/errors.js";

const STACK = {id: "stack-1", hostPath: "/opt/docktor/stacks/stack-1"};

const S3_CONFIG: BackupRepoConfig = {
    repoType: "s3",
    s3Endpoint: "https://s3.example.com",
    s3Bucket: "docktor-backups",
    s3AccessKey: "AKIAEXAMPLE",
    s3SecretKey: "s3-secret-example",
    password: "restic-pass",
};

const SFTP_KEY = "-----BEGIN OPENSSH PRIVATE KEY-----\nTEST-KEY-BODY\n-----END OPENSSH PRIVATE KEY-----\n";

const SFTP_CONFIG: BackupRepoConfig = {
    repoType: "sftp",
    sftpHost: "nas.example.com",
    sftpUser: "backup",
    sftpKey: SFTP_KEY,
    repoPath: "/srv/restic",
    password: "restic-pass",
};

function messageOf(fn: () => unknown): string {
    try {
        fn();
    } catch (err) {
        if (err instanceof BadRequestError) return err.message;
        throw err;
    }
    throw new Error("expected resolveResticRepository to throw");
}

describe("resolveResticRepository()", () => {
    describe("local (D-02, BKP-02)", () => {
        it("uses <hostPath>/backups and ignores the configured repoPath", () => {
            const expected = path.resolve("/opt/docktor/stacks/myapp", "backups");

            const target = resolveResticRepository(
                {repoType: "local", repoPath: "/elsewhere", password: "pw"},
                {id: "myapp", hostPath: "/opt/docktor/stacks/myapp"},
            );

            expect(target.kind).toBe("local");
            expect(target.repository).toBe(expected);
            expect(target.env).toEqual({RESTIC_REPOSITORY: expected, RESTIC_PASSWORD: "pw"});
        });

        it("handles Windows absolute paths without doubling the drive letter", () => {
            const windowsPath = "C:\\Users\\D070307\\workspace\\docktor\\server\\dev-data\\stacks\\memos";

            const target = resolveResticRepository({repoType: "local", password: "test"}, {id: "memos", hostPath: windowsPath});

            expect(target.repository).toBe(path.resolve(windowsPath, "backups"));
            expect(target.repository).not.toContain("C:\\C\\");
        });

        it("falls back to the configured repoPath when the stack has no hostPath", () => {
            const config: BackupRepoConfig = {repoType: "local", repoPath: "/backups", password: "pw"};

            expect(resolveResticRepository(config, {id: "s", hostPath: undefined}).repository).toBe("/backups");
            expect(resolveResticRepository(config, {id: "s", hostPath: null}).repository).toBe("/backups");
        });

        it("does not validate the stack id", () => {
            const target = resolveResticRepository({repoType: "local", password: "pw"}, {id: "../other", hostPath: "/x"});

            expect(target.repository).toBe(path.resolve("/x", "backups"));
        });
    });

    describe("s3 (D-01, BKP-01)", () => {
        it("targets <endpoint>/<bucket>/<stackId> with the AWS credentials from settings", () => {
            const target = resolveResticRepository(S3_CONFIG, STACK);

            expect(target.kind).toBe("s3");
            expect(target.repository).toBe("s3:https://s3.example.com/docktor-backups/stack-1");
            expect(target.env).toEqual({
                RESTIC_REPOSITORY: "s3:https://s3.example.com/docktor-backups/stack-1",
                RESTIC_PASSWORD: "restic-pass",
                AWS_ACCESS_KEY_ID: "AKIAEXAMPLE",
                AWS_SECRET_ACCESS_KEY: "s3-secret-example",
            });
        });

        it("defaults the endpoint to s3.amazonaws.com when absent or blank", () => {
            const expected = "s3:s3.amazonaws.com/docktor-backups/stack-1";

            expect(resolveResticRepository({...S3_CONFIG, s3Endpoint: undefined}, STACK).repository).toBe(expected);
            expect(resolveResticRepository({...S3_CONFIG, s3Endpoint: "   "}, STACK).repository).toBe(expected);
        });

        it("does not produce doubled slashes", () => {
            const target = resolveResticRepository(
                {...S3_CONFIG, s3Endpoint: "https://s3.example.com/", s3Bucket: "/docktor-backups/"},
                STACK,
            );

            expect(target.repository).toBe("s3:https://s3.example.com/docktor-backups/stack-1");
        });

        it("never targets the stack-local path", () => {
            const target = resolveResticRepository(S3_CONFIG, STACK);

            expect(target.repository).not.toBe(path.resolve(STACK.hostPath, "backups"));
            expect(target.repository.startsWith(STACK.hostPath)).toBe(false);
        });

        it("hard-fails naming the missing bucket (D-05)", () => {
            expect(() => resolveResticRepository({...S3_CONFIG, s3Bucket: undefined}, STACK)).toThrow(BadRequestError);
            expect(messageOf(() => resolveResticRepository({...S3_CONFIG, s3Bucket: undefined}, STACK))).toContain(
                "missing S3 bucket",
            );
        });

        it("hard-fails naming every missing credential without leaking secret values", () => {
            const message = messageOf(() =>
                resolveResticRepository({...S3_CONFIG, s3AccessKey: undefined, s3SecretKey: undefined}, STACK),
            );

            expect(message).toContain("missing S3 access key, S3 secret key");
            expect(message).not.toContain("s3-secret-example");
        });

        it("hard-fails when the repository password is empty (e.g. failed to decrypt)", () => {
            const message = messageOf(() => resolveResticRepository({...S3_CONFIG, password: ""}, STACK));

            expect(message).toContain("repository password");
            expect(message).not.toContain("s3-secret-example");
        });

        it("rejects stack ids that could address another stack's repository", () => {
            expect(() => resolveResticRepository(S3_CONFIG, {id: "../other-stack", hostPath: "/x"})).toThrow(BadRequestError);
            expect(() => resolveResticRepository(S3_CONFIG, {id: "a/b", hostPath: "/x"})).toThrow(BadRequestError);
        });
    });

    describe("local without any location (IN-01)", () => {
        it("fails with a clear message instead of handing restic an empty repository", () => {
            const config: BackupRepoConfig = {repoType: "local", password: "pw"};

            expect(() => resolveResticRepository(config, {id: "s", hostPath: undefined})).toThrow(
                /Local backup repository path is not configured/,
            );
        });
    });

    describe("sftp port (IN-02)", () => {
        it("carries a configured port on the connection, not in the repository string", () => {
            const target = resolveResticRepository({...SFTP_CONFIG, sftpPort: 2222}, STACK);

            if (target.kind !== "sftp") throw new Error("expected sftp target");
            expect(target.sftp.port).toBe(2222);
            expect(target.repository).toBe("sftp:backup@nas.example.com:/srv/restic/stack-1");
        });

        it("leaves the port unset when none is configured", () => {
            const target = resolveResticRepository(SFTP_CONFIG, STACK);

            if (target.kind !== "sftp") throw new Error("expected sftp target");
            expect(target.sftp.port).toBeUndefined();
        });

        it("rejects a user name containing @, which would break the repository location", () => {
            expect(() => resolveResticRepository({...SFTP_CONFIG, sftpUser: "a@b"}, STACK)).toThrow(BadRequestError);
        });
    });

    describe("sftp (D-01, BKP-01)", () => {
        it("targets <user>@<host>:<repoPath>/<stackId> and keeps the key out of env", () => {
            const target = resolveResticRepository(SFTP_CONFIG, STACK);

            expect(target.kind).toBe("sftp");
            expect(target.repository).toBe("sftp:backup@nas.example.com:/srv/restic/stack-1");
            expect(target.env).toEqual({
                RESTIC_REPOSITORY: "sftp:backup@nas.example.com:/srv/restic/stack-1",
                RESTIC_PASSWORD: "restic-pass",
            });
            if (target.kind !== "sftp") throw new Error("expected sftp target");
            expect(target.sftp).toEqual({host: "nas.example.com", user: "backup", privateKey: SFTP_KEY});
            expect(JSON.stringify(target.env)).not.toContain("TEST-KEY-BODY");
        });

        it("defaults, trims and preserves relative repository paths", () => {
            expect(resolveResticRepository({...SFTP_CONFIG, repoPath: undefined}, STACK).repository).toBe(
                "sftp:backup@nas.example.com:/backups/stack-1",
            );
            expect(resolveResticRepository({...SFTP_CONFIG, repoPath: "/srv/restic/"}, STACK).repository).toBe(
                "sftp:backup@nas.example.com:/srv/restic/stack-1",
            );
            expect(resolveResticRepository({...SFTP_CONFIG, repoPath: "restic"}, STACK).repository).toBe(
                "sftp:backup@nas.example.com:restic/stack-1",
            );
        });

        it("hard-fails naming the missing host and key (D-05)", () => {
            const message = messageOf(() =>
                resolveResticRepository({...SFTP_CONFIG, sftpHost: undefined, sftpKey: undefined}, STACK),
            );

            expect(message).toContain("missing SFTP host, SFTP private key");
            expect(message).not.toContain("TEST-KEY-BODY");
        });

        it("hard-fails naming the missing user", () => {
            expect(messageOf(() => resolveResticRepository({...SFTP_CONFIG, sftpUser: undefined}, STACK))).toContain(
                "SFTP user",
            );
        });

        it("rejects host and user values that would become ssh options", () => {
            for (const sftpHost of ["nas.example.com -oProxyCommand=sh", "-oProxyCommand=sh"]) {
                expect(() => resolveResticRepository({...SFTP_CONFIG, sftpHost}, STACK)).toThrow(BadRequestError);
            }
            expect(() => resolveResticRepository({...SFTP_CONFIG, sftpUser: "-l root"}, STACK)).toThrow(BadRequestError);
        });

        it("rejects stack ids that could address another stack's repository", () => {
            expect(() => resolveResticRepository(SFTP_CONFIG, {id: "../other-stack", hostPath: "/x"})).toThrow(BadRequestError);
            expect(() => resolveResticRepository(SFTP_CONFIG, {id: "a/b", hostPath: "/x"})).toThrow(BadRequestError);
        });
    });
});
