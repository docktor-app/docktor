import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {SettingsService} from "../../../../src/application/settings-service.js";
import {decrypt} from "../../../../src/lib/crypto.js";

const TEST_ENCRYPTION_KEY = "6f041205371c049506aeecc56ed00a5ff53665015953d7cfa7d0fa9dc3bc5cca";

function createMockSettingsRepository() {
    return {
        findByKey: vi.fn(),
        upsert: vi.fn(),
        upsertEncrypted: vi.fn(),
        findAll: vi.fn(),
        getMany: vi.fn(),
    };
}

describe("SettingsService", () => {
    let service: SettingsService;
    let mockRepo: ReturnType<typeof createMockSettingsRepository>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockRepo = createMockSettingsRepository();
        service = new SettingsService(mockRepo as any);
        process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    });

    afterEach(() => {
        delete process.env.ENCRYPTION_KEY;
    });

    describe("getSetting (SET-01)", () => {
        it("returns null when key not found in repository", async () => {
            mockRepo.findByKey.mockResolvedValue(null);

            const result = await service.getSetting("non-existent-key");

            expect(mockRepo.findByKey).toHaveBeenCalledWith("non-existent-key");
            expect(result).toBeNull();
        });

        it("returns the value string when key is found", async () => {
            mockRepo.findByKey.mockResolvedValue({key: "instanceName", value: "Docktor"});

            const result = await service.getSetting("instanceName");

            expect(result).toBe("Docktor");
        });
    });

    describe("upsertSetting (SET-02)", () => {
        it("calls repository.upsert with key and value", async () => {
            mockRepo.upsert.mockResolvedValue(undefined);

            await service.upsertSetting("instanceName", "My Docktor");

            expect(mockRepo.upsert).toHaveBeenCalledWith("instanceName", "My Docktor");
        });
    });

    describe("updateGeneralSettings (SET-01, SET-02)", () => {
        it("validates and saves instanceName, baseUrl, timezone", async () => {
            mockRepo.upsert.mockResolvedValue(undefined);

            await service.updateGeneralSettings({
                instanceName: "My Server",
                baseUrl: "https://docktor.example.com",
                timezone: "America/New_York",
            });

            expect(mockRepo.upsert).toHaveBeenCalledWith("instanceName", "My Server");
            expect(mockRepo.upsert).toHaveBeenCalledWith("baseUrl", "https://docktor.example.com");
            expect(mockRepo.upsert).toHaveBeenCalledWith("timezone", "America/New_York");
        });

        it("throws on invalid input — empty instanceName", async () => {
            await expect(
                service.updateGeneralSettings({
                    instanceName: "",
                    baseUrl: "https://docktor.example.com",
                    timezone: "UTC",
                }),
            ).rejects.toThrow();

            expect(mockRepo.upsert).not.toHaveBeenCalled();
        });

        it("throws on invalid input — non-URL baseUrl", async () => {
            await expect(
                service.updateGeneralSettings({
                    instanceName: "My Server",
                    baseUrl: "notaurl",
                    timezone: "UTC",
                }),
            ).rejects.toThrow();

            expect(mockRepo.upsert).not.toHaveBeenCalled();
        });
    });

    describe("getProxySettings (PRXY-03)", () => {
        it("returns defaults of empty string / false when neither key is set", async () => {
            mockRepo.getMany.mockResolvedValue({});

            const result = await service.getProxySettings();

            expect(result).toEqual({acmeEmail: "", showInDashboard: false});
        });

        it("returns the stored acmeEmail and showInDashboard: true when the setting value is the string 'true'", async () => {
            mockRepo.getMany.mockResolvedValue({
                "proxy.acmeEmail": "admin@example.com",
                "proxy.showInDashboard": "true",
            });

            const result = await service.getProxySettings();

            expect(result).toEqual({acmeEmail: "admin@example.com", showInDashboard: true});
        });

        it("treats any non-'true' stored value for showInDashboard as false", async () => {
            mockRepo.getMany.mockResolvedValue({
                "proxy.showInDashboard": "yes",
            });

            const result = await service.getProxySettings();

            expect(result.showInDashboard).toBe(false);
        });

        it("requests only the two proxy.* keys from the repository — never falls back to smtp.from, instanceName, baseUrl or any user record", async () => {
            mockRepo.getMany.mockResolvedValue({});

            await service.getProxySettings();

            expect(mockRepo.getMany).toHaveBeenCalledWith(["proxy.acmeEmail", "proxy.showInDashboard"]);
            const requestedKeys = mockRepo.getMany.mock.calls[0][0];
            expect(requestedKeys).not.toContain("smtp.from");
            expect(requestedKeys).not.toContain("instanceName");
            expect(requestedKeys).not.toContain("baseUrl");
        });
    });

    describe("updateProxySettings (PRXY-03)", () => {
        it("upserts only the keys present in the argument", async () => {
            mockRepo.upsert.mockResolvedValue(undefined);

            await service.updateProxySettings({acmeEmail: "admin@example.com"});

            expect(mockRepo.upsert).toHaveBeenCalledWith("proxy.acmeEmail", "admin@example.com");
            expect(mockRepo.upsert).toHaveBeenCalledTimes(1);
        });

        it("stringifies the showInDashboard boolean", async () => {
            mockRepo.upsert.mockResolvedValue(undefined);

            await service.updateProxySettings({showInDashboard: true});

            expect(mockRepo.upsert).toHaveBeenCalledWith("proxy.showInDashboard", "true");
        });

        it("accepts an empty acmeEmail as valid (no registration email, D-09)", async () => {
            mockRepo.upsert.mockResolvedValue(undefined);

            await expect(service.updateProxySettings({acmeEmail: ""})).resolves.not.toThrow();

            expect(mockRepo.upsert).toHaveBeenCalledWith("proxy.acmeEmail", "");
        });

        it("throws BadRequestError for a non-empty, invalid acmeEmail", async () => {
            await expect(
                service.updateProxySettings({acmeEmail: "not-an-email"}),
            ).rejects.toThrow();

            expect(mockRepo.upsert).not.toHaveBeenCalled();
        });
    });

    describe("upsertEncryptedSetting (encrypted-write path)", () => {
        it("encrypts the plaintext before writing and sets the encrypted flag via repo.upsertEncrypted", async () => {
            mockRepo.upsertEncrypted.mockResolvedValue(undefined);

            await service.upsertEncryptedSetting("smtp.password", "super-secret");

            expect(mockRepo.upsertEncrypted).toHaveBeenCalledTimes(1);
            const [key, storedValue] = mockRepo.upsertEncrypted.mock.calls[0];
            expect(key).toBe("smtp.password");
            expect(storedValue).not.toBe("super-secret");
            expect(decrypt(storedValue)).toBe("super-secret");
            // Plain upsert is never used for a secret write
            expect(mockRepo.upsert).not.toHaveBeenCalled();
        });
    });

    describe("saveSmtpConfig (grouped SMTP write)", () => {
        it("writes the five plain fields via repo.upsert, with the encrypted flag unset", async () => {
            mockRepo.upsert.mockResolvedValue(undefined);
            mockRepo.upsertEncrypted.mockResolvedValue(undefined);

            await service.saveSmtpConfig({
                host: "smtp.example.com",
                port: 587,
                encryption: "starttls",
                username: "user",
                password: "",
                from: "noreply@example.com",
            });

            expect(mockRepo.upsert).toHaveBeenCalledWith("smtp.host", "smtp.example.com");
            expect(mockRepo.upsert).toHaveBeenCalledWith("smtp.port", "587");
            expect(mockRepo.upsert).toHaveBeenCalledWith("smtp.encryption", "starttls");
            expect(mockRepo.upsert).toHaveBeenCalledWith("smtp.username", "user");
            expect(mockRepo.upsert).toHaveBeenCalledWith("smtp.from", "noreply@example.com");
        });

        it("does not write the password setting when the password is blank — leaves the stored password untouched", async () => {
            mockRepo.upsert.mockResolvedValue(undefined);

            await service.saveSmtpConfig({
                host: "smtp.example.com",
                port: 587,
                encryption: "starttls",
                username: "user",
                password: "",
                from: "noreply@example.com",
            });

            expect(mockRepo.upsertEncrypted).not.toHaveBeenCalled();
            const upsertedKeys = mockRepo.upsert.mock.calls.map((call) => call[0]);
            expect(upsertedKeys).not.toContain("smtp.password");
        });

        it("encrypts and writes the password via repo.upsertEncrypted when a password is provided", async () => {
            mockRepo.upsert.mockResolvedValue(undefined);
            mockRepo.upsertEncrypted.mockResolvedValue(undefined);

            await service.saveSmtpConfig({
                host: "smtp.example.com",
                port: 587,
                encryption: "starttls",
                username: "user",
                password: "hunter2",
                from: "noreply@example.com",
            });

            expect(mockRepo.upsertEncrypted).toHaveBeenCalledTimes(1);
            const [key, storedValue] = mockRepo.upsertEncrypted.mock.calls[0];
            expect(key).toBe("smtp.password");
            expect(storedValue).not.toBe("hunter2");
            expect(decrypt(storedValue)).toBe("hunter2");
        });
    });

    describe("getMaskedSmtpConfig", () => {
        it("masks the password to a boolean hasPassword flag", async () => {
            mockRepo.getMany.mockResolvedValue({
                "smtp.host": "smtp.example.com",
                "smtp.port": "587",
                "smtp.encryption": "starttls",
                "smtp.username": "user",
                "smtp.password": "encrypted-value",
                "smtp.from": "noreply@example.com",
            });

            const result = await service.getMaskedSmtpConfig();

            expect(result).toEqual({
                host: "smtp.example.com",
                port: 587,
                encryption: "starttls",
                username: "user",
                hasPassword: true,
                from: "noreply@example.com",
            });
        });

        it("returns hasPassword: false and defaults when nothing is stored", async () => {
            mockRepo.getMany.mockResolvedValue({});

            const result = await service.getMaskedSmtpConfig();

            expect(result).toEqual({
                host: "",
                port: 587,
                encryption: "starttls",
                username: "",
                hasPassword: false,
                from: "",
            });
        });
    });

    describe("getNotificationTriggers / updateNotificationTriggers", () => {
        it("returns defaults when nothing is stored", async () => {
            mockRepo.getMany.mockResolvedValue({});

            const result = await service.getNotificationTriggers();

            expect(result).toEqual({
                stackError: true,
                diskWarning: true,
                diskThresholdPercent: 10,
                diskThresholdBytes: 2147483648,
            });
        });

        it("returns stored values", async () => {
            mockRepo.getMany.mockResolvedValue({
                "notify.stackError": "false",
                "notify.diskWarning": "false",
                "disk.thresholdPercent": "20",
                "disk.thresholdBytes": "1000000",
            });

            const result = await service.getNotificationTriggers();

            expect(result).toEqual({
                stackError: false,
                diskWarning: false,
                diskThresholdPercent: 20,
                diskThresholdBytes: 1000000,
            });
        });

        it("upserts only the keys present in the argument", async () => {
            mockRepo.upsert.mockResolvedValue(undefined);

            await service.updateNotificationTriggers({stackError: false});

            expect(mockRepo.upsert).toHaveBeenCalledWith("notify.stackError", "false");
            expect(mockRepo.upsert).toHaveBeenCalledTimes(1);
        });
    });

    describe("saveBackupRepositorySettings (Task 3, 10-10 — T-10-33)", () => {
        const baseInput = {
            repoType: "s3" as const,
            repoPath: null,
            sftpHost: null,
            sftpUser: null,
            sftpKey: null,
            s3Endpoint: "s3.example.com",
            s3Bucket: "my-bucket",
            s3AccessKey: "AKIA...",
            s3SecretKey: null,
            password: null,
        };

        it("writes the non-secret fields via repo.upsert in the route's original order", async () => {
            mockRepo.upsert.mockResolvedValue(undefined);

            await service.saveBackupRepositorySettings(baseInput);

            expect(mockRepo.upsert).toHaveBeenCalledWith("backup.repoType", "s3");
            expect(mockRepo.upsert).toHaveBeenCalledWith("backup.s3Endpoint", "s3.example.com");
            expect(mockRepo.upsert).toHaveBeenCalledWith("backup.s3Bucket", "my-bucket");
            expect(mockRepo.upsert).toHaveBeenCalledWith("backup.s3AccessKey", "AKIA...");
        });

        it("a blank/absent backup repository password leaves the stored password untouched", async () => {
            mockRepo.upsert.mockResolvedValue(undefined);

            await service.saveBackupRepositorySettings({...baseInput, password: ""});

            expect(mockRepo.upsertEncrypted).not.toHaveBeenCalled();
            const upsertedKeys = mockRepo.upsert.mock.calls.map((call) => call[0]);
            expect(upsertedKeys).not.toContain("backup.password");
        });

        it("a blank/absent SFTP key leaves the stored SFTP key untouched", async () => {
            mockRepo.upsert.mockResolvedValue(undefined);

            await service.saveBackupRepositorySettings({...baseInput, sftpKey: ""});

            const encryptedKeys = mockRepo.upsertEncrypted.mock.calls.map((call) => call[0]);
            expect(encryptedKeys).not.toContain("backup.sftpKey");
        });

        it("a blank/absent S3 secret key leaves the stored S3 secret key untouched", async () => {
            mockRepo.upsert.mockResolvedValue(undefined);

            await service.saveBackupRepositorySettings({...baseInput, s3SecretKey: ""});

            const encryptedKeys = mockRepo.upsertEncrypted.mock.calls.map((call) => call[0]);
            expect(encryptedKeys).not.toContain("backup.s3SecretKey");
        });

        it("encrypts and writes the password, SFTP key, and S3 secret key via the shared encrypted-write path when provided", async () => {
            mockRepo.upsert.mockResolvedValue(undefined);
            mockRepo.upsertEncrypted.mockResolvedValue(undefined);

            await service.saveBackupRepositorySettings({
                ...baseInput,
                repoType: "sftp",
                sftpHost: "sftp.example.com",
                sftpUser: "backup-user",
                sftpKey: "-----BEGIN KEY-----",
                s3SecretKey: "s3-secret",
                password: "repo-password",
            });

            expect(mockRepo.upsertEncrypted).toHaveBeenCalledTimes(3);
            const calls = mockRepo.upsertEncrypted.mock.calls;
            const sftpKeyCall = calls.find((c) => c[0] === "backup.sftpKey");
            const s3SecretCall = calls.find((c) => c[0] === "backup.s3SecretKey");
            const passwordCall = calls.find((c) => c[0] === "backup.password");
            expect(sftpKeyCall?.[1]).not.toBe("-----BEGIN KEY-----");
            expect(decrypt(sftpKeyCall?.[1])).toBe("-----BEGIN KEY-----");
            expect(decrypt(s3SecretCall?.[1])).toBe("s3-secret");
            expect(decrypt(passwordCall?.[1])).toBe("repo-password");
        });
    });

    describe("getMaskedBackupRepositorySettings (Task 3, 10-10)", () => {
        it("masks secrets to boolean presence indicators", async () => {
            mockRepo.getMany.mockResolvedValue({
                "backup.repoType": "s3",
                "backup.s3Endpoint": "s3.example.com",
                "backup.s3Bucket": "my-bucket",
                "backup.s3AccessKey": "AKIA...",
                "backup.s3SecretKey": "encrypted-value",
                "backup.password": "encrypted-value",
            });

            const result = await service.getMaskedBackupRepositorySettings();

            expect(result).toEqual({
                repoType: "s3",
                repoPath: null,
                sftpHost: null,
                sftpUser: null,
                hasSftpKey: false,
                s3Endpoint: "s3.example.com",
                s3Bucket: "my-bucket",
                s3AccessKey: "AKIA...",
                hasS3SecretKey: true,
                hasPassword: true,
            });
        });
    });

    describe("getBackupDefaults / updateBackupDefaults (Task 3, 10-10)", () => {
        it("returns null defaults when nothing is stored", async () => {
            mockRepo.getMany.mockResolvedValue({});

            const result = await service.getBackupDefaults();

            expect(result).toEqual({defaultSchedule: null, defaultRetention: null});
        });

        it("parses the stored retention JSON", async () => {
            mockRepo.getMany.mockResolvedValue({
                "backup.defaultSchedule": "0 2 * * *",
                "backup.defaultRetention": JSON.stringify({keepDaily: 7, keepWeekly: 4, keepMonthly: 12}),
            });

            const result = await service.getBackupDefaults();

            expect(result).toEqual({
                defaultSchedule: "0 2 * * *",
                defaultRetention: {keepDaily: 7, keepWeekly: 4, keepMonthly: 12},
            });
        });

        it("upserts only the keys present in the argument", async () => {
            mockRepo.upsert.mockResolvedValue(undefined);

            await service.updateBackupDefaults({defaultSchedule: "0 3 * * *"});

            expect(mockRepo.upsert).toHaveBeenCalledWith("backup.defaultSchedule", "0 3 * * *");
            expect(mockRepo.upsert).toHaveBeenCalledTimes(1);
        });

        it("JSON-stringifies the retention object when writing", async () => {
            mockRepo.upsert.mockResolvedValue(undefined);

            await service.updateBackupDefaults({defaultRetention: {keepDaily: 1, keepWeekly: 1, keepMonthly: 1}});

            expect(mockRepo.upsert).toHaveBeenCalledWith(
                "backup.defaultRetention",
                JSON.stringify({keepDaily: 1, keepWeekly: 1, keepMonthly: 1}),
            );
        });
    });
});
