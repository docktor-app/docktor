import {z} from "zod";

// --- Settings: backup repository configuration ---
export const backupRepoTypeSchema = z.enum(["local", "sftp", "s3"]);
export type BackupRepoType = z.infer<typeof backupRepoTypeSchema>;

// These values become ssh arguments on the server: no whitespace, quotes, "@", ":" or
// leading dash may pass, or they could inject ssh options or corrupt the repository
// location. Shared so the form shows the same error the server would raise.
export const SFTP_HOST_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/;
export const SFTP_USER_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;

export const backupSettingsSchema = z.object({
    repoType: backupRepoTypeSchema,
    repoPath: z.string().nullable().optional(),        // local
    sftpHost: z.string().nullable().optional(),         // sftp
    sftpUser: z.string().nullable().optional(),         // sftp
    sftpPort: z.number().int().min(1).max(65535).nullable().optional(), // sftp (null clears, absent keeps; default 22)
    sftpKey: z.string().nullable().optional(),          // sftp (private key PEM)
    s3Endpoint: z.string().nullable().optional(),       // s3
    s3Bucket: z.string().nullable().optional(),         // s3
    s3AccessKey: z.string().nullable().optional(),      // s3
    s3SecretKey: z.string().nullable().optional(),      // s3 (encrypted)
    password: z.string().nullable().optional(),  // optional when updating (only encrypt/save when user enters a new password)
}).superRefine((data, ctx) => {
    // Local backups are stored in stack-local directories; repoPath is not used.
    // Secrets (sftpKey, s3SecretKey, password) are optional here: a blank value on update keeps the stored one.
    if (data.repoType === "sftp") {
        const host = data.sftpHost?.trim();
        if (!host) ctx.addIssue({code: z.ZodIssueCode.custom, message: "SFTP host is required", path: ["sftpHost"]});
        else if (!SFTP_HOST_PATTERN.test(host)) ctx.addIssue({code: z.ZodIssueCode.custom, message: `SFTP host "${host}" is not a valid host name`, path: ["sftpHost"]});
        const user = data.sftpUser?.trim();
        if (!user) ctx.addIssue({code: z.ZodIssueCode.custom, message: "SFTP username is required", path: ["sftpUser"]});
        else if (!SFTP_USER_PATTERN.test(user)) ctx.addIssue({code: z.ZodIssueCode.custom, message: `SFTP user "${user}" is not a valid user name`, path: ["sftpUser"]});
    }
    if (data.repoType === "s3") {
        if (!data.s3Bucket?.trim()) ctx.addIssue({code: z.ZodIssueCode.custom, message: "Bucket name is required", path: ["s3Bucket"]});
        if (!data.s3AccessKey?.trim()) ctx.addIssue({code: z.ZodIssueCode.custom, message: "Access key is required", path: ["s3AccessKey"]});
    }
});
export type BackupSettingsInput = z.infer<typeof backupSettingsSchema>;

// --- Settings: global default schedule + retention ---
export const retentionPolicySchema = z.object({
    keepDaily: z.coerce.number().int().min(0).default(7),
    keepWeekly: z.coerce.number().int().min(0).default(4),
    keepMonthly: z.coerce.number().int().min(0).default(12),
});
export type RetentionPolicy = z.infer<typeof retentionPolicySchema>;

export const backupDefaultsSchema = z.object({
    defaultSchedule: z.string().optional(),  // cron expression, validated server-side with node-cron
    defaultRetention: retentionPolicySchema.optional(),
});
export type BackupDefaultsInput = z.infer<typeof backupDefaultsSchema>;

// --- Stack-level backup config ---
export const stackBackupConfigSchema = z.object({
    useGlobalSchedule: z.boolean().default(true),
    schedule: z.string().nullable().optional(),          // cron override
    useGlobalRetention: z.boolean().default(true),
    retention: retentionPolicySchema.nullable().optional(),
    preHook: z.string().nullable().optional(),           // shell command
    postHook: z.string().nullable().optional(),          // shell command
});
export type StackBackupConfigInput = z.infer<typeof stackBackupConfigSchema>;

// --- Trigger manual backup ---
export const triggerBackupSchema = z.object({
    stackId: z.string().min(1),
});
export type TriggerBackupInput = z.infer<typeof triggerBackupSchema>;

// --- Restore from snapshot ---
export const restoreSnapshotSchema = z.object({
    snapshotId: z.string().min(1, "Snapshot ID is required"),
});
export type RestoreSnapshotInput = z.infer<typeof restoreSnapshotSchema>;
