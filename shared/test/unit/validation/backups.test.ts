import {describe, expect, it} from "vitest";
import {backupSettingsSchema} from "../../../src/validation/backups";

describe("backupSettingsSchema", () => {
    it("accepts an S3 update that leaves the stored secret key untouched", () => {
        const result = backupSettingsSchema.safeParse({
            repoType: "s3",
            s3Bucket: "docktor",
            s3AccessKey: "AKIA",
            s3SecretKey: null,
        });
        expect(result.success).toBe(true);
    });

    it("still requires bucket and access key for S3", () => {
        const result = backupSettingsSchema.safeParse({repoType: "s3", s3Bucket: "", s3AccessKey: ""});
        expect(result.success).toBe(false);
        expect(result.error?.issues.map((i) => i.path[0])).toEqual(["s3Bucket", "s3AccessKey"]);
    });

    it("requires host and username for SFTP", () => {
        const result = backupSettingsSchema.safeParse({repoType: "sftp", sftpHost: " ", sftpUser: ""});
        expect(result.success).toBe(false);
        expect(result.error?.issues.map((i) => i.path[0])).toEqual(["sftpHost", "sftpUser"]);
    });

    it("accepts a valid SFTP port and rejects an out-of-range one", () => {
        const base = {repoType: "sftp", sftpHost: "nas.example.com", sftpUser: "backup"};

        expect(backupSettingsSchema.safeParse({...base, sftpPort: 2222}).success).toBe(true);
        expect(backupSettingsSchema.safeParse({...base, sftpPort: null}).success).toBe(true);
        expect(backupSettingsSchema.safeParse({...base, sftpPort: 0}).success).toBe(false);
        expect(backupSettingsSchema.safeParse({...base, sftpPort: 70000}).success).toBe(false);
        expect(backupSettingsSchema.safeParse({...base, sftpPort: 22.5}).success).toBe(false);
    });

    it("rejects an SFTP host or user the server would refuse, so the form can show it inline", () => {
        const result = backupSettingsSchema.safeParse({repoType: "sftp", sftpHost: "nas.example.com:22", sftpUser: "a@b"});

        expect(result.success).toBe(false);
        expect(result.error?.issues.map((i) => i.path[0])).toEqual(["sftpHost", "sftpUser"]);
    });
});
