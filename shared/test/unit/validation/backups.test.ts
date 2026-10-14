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
});
