import {z} from "zod"
import {BadRequestError} from "../lib/errors.js"
import {decrypt, encrypt} from "../lib/crypto.js"
import type {SettingsRepository} from "../repositories/settings-repository.js"
import type {SmtpConfig} from "./notification-service.js"
import type {BackupSettingsInput, RetentionPolicy} from "@docktor/shared"

// Mirrors SETTING_KEYS from settings-repository — inlined to avoid loading db.ts at module level
const SETTING_KEYS = {
    INSTANCE_NAME: "instanceName",
    BASE_URL: "baseUrl",
    TIMEZONE: "timezone",
} as const

const PROXY_SETTING_KEYS = {
    ACME_EMAIL: "proxy.acmeEmail",
    SHOW_IN_DASHBOARD: "proxy.showInDashboard",
} as const

export interface GeneralSettings {
    instanceName: string
    baseUrl: string
    timezone: string
}

export interface ProxySettings {
    acmeEmail: string
    showInDashboard: boolean
}

export interface SmtpConfigWrite {
    host: string
    port: number
    encryption: "none" | "starttls" | "ssl"
    username: string
    password: string
    from: string
}

export interface MaskedSmtpConfig {
    host: string
    port: number
    encryption: "none" | "starttls" | "ssl"
    username: string
    hasPassword: boolean
    from: string
}

export interface NotificationTriggers {
    stackError: boolean
    diskWarning: boolean
    diskThresholdPercent: number
    diskThresholdBytes: number
}

export interface MaskedBackupRepositorySettings {
    repoType: string | null
    repoPath: string | null
    sftpHost: string | null
    sftpUser: string | null
    hasSftpKey: boolean
    s3Endpoint: string | null
    s3Bucket: string | null
    s3AccessKey: string | null
    hasS3SecretKey: boolean
    hasPassword: boolean
}

export interface BackupDefaultsView {
    defaultSchedule: string | null
    defaultRetention: RetentionPolicy | null
}

const DEFAULTS: GeneralSettings = {
    instanceName: "Docktor",
    baseUrl: "",
    timezone: "UTC",
}

export class SettingsService {
    constructor(private readonly repo: SettingsRepository) {}

    async getSetting(key: string): Promise<string | null> {
        const record = await this.repo.findByKey(key)
        return record?.value ?? null
    }

    async getMany(keys: string[]): Promise<Record<string, string>> {
        return this.repo.getMany(keys)
    }

    async upsertSetting(key: string, value: string): Promise<void> {
        await this.repo.upsert(key, value)
    }

    // Encrypts a plaintext value and stores it with the encrypted flag set —
    // the single encrypted-write path (matches getSmtpConfig()'s decrypt side).
    async upsertEncryptedSetting(key: string, plaintext: string): Promise<void> {
        const encrypted = encrypt(plaintext)
        await this.repo.upsertEncrypted(key, encrypted)
    }

    async getMaskedSmtpConfig(): Promise<MaskedSmtpConfig> {
        const keys = ["smtp.host", "smtp.port", "smtp.encryption", "smtp.username", "smtp.password", "smtp.from"]
        const values = await this.repo.getMany(keys)
        return {
            host: values["smtp.host"] ?? "",
            port: Number(values["smtp.port"] ?? "587"),
            encryption: (values["smtp.encryption"] ?? "starttls") as MaskedSmtpConfig["encryption"],
            username: values["smtp.username"] ?? "",
            hasPassword: !!values["smtp.password"],
            from: values["smtp.from"] ?? "",
        }
    }

    // Saves the SMTP form as one grouped write. A blank/absent password
    // leaves the stored password untouched rather than overwriting it with
    // an empty value (past defect class: "SMTP `from` saved before password
    // encryption to avoid silent save failures" — the plain fields are
    // written first, the password only when non-empty).
    async saveSmtpConfig(data: SmtpConfigWrite): Promise<void> {
        await this.repo.upsert("smtp.host", data.host)
        await this.repo.upsert("smtp.port", String(data.port))
        await this.repo.upsert("smtp.encryption", data.encryption)
        await this.repo.upsert("smtp.username", data.username)
        await this.repo.upsert("smtp.from", data.from)
        if (data.password) {
            await this.upsertEncryptedSetting("smtp.password", data.password)
        }
    }

    async getNotificationTriggers(): Promise<NotificationTriggers> {
        const values = await this.repo.getMany([
            "notify.stackError",
            "notify.diskWarning",
            "disk.thresholdPercent",
            "disk.thresholdBytes",
        ])
        return {
            stackError: values["notify.stackError"] !== "false",
            diskWarning: values["notify.diskWarning"] !== "false",
            diskThresholdPercent: Number(values["disk.thresholdPercent"] ?? "10"),
            diskThresholdBytes: Number(values["disk.thresholdBytes"] ?? "2147483648"),
        }
    }

    async updateNotificationTriggers(data: Partial<NotificationTriggers>): Promise<void> {
        if (data.stackError !== undefined) {
            await this.repo.upsert("notify.stackError", String(data.stackError))
        }
        if (data.diskWarning !== undefined) {
            await this.repo.upsert("notify.diskWarning", String(data.diskWarning))
        }
        if (data.diskThresholdPercent !== undefined) {
            await this.repo.upsert("disk.thresholdPercent", String(data.diskThresholdPercent))
        }
        if (data.diskThresholdBytes !== undefined) {
            await this.repo.upsert("disk.thresholdBytes", String(data.diskThresholdBytes))
        }
    }

    async getSmtpConfig(): Promise<SmtpConfig | null> {
        const keys = [
            "smtp.host", "smtp.port", "smtp.encryption", "smtp.username",
            "smtp.password", "smtp.from",
        ]
        const values: Record<string, string> = {}
        for (const key of keys) {
            const val = await this.getSetting(key)
            if (val) values[key] = val
        }

        if (!values["smtp.host"] || !values["smtp.from"]) {
            return null
        }

        let password = values["smtp.password"] ?? ""
        if (password) {
            try {
                password = decrypt(password)
            } catch {
                console.error("[SettingsService] failed to decrypt SMTP password")
                return null
            }
        }

        const encryption = (values["smtp.encryption"] ?? "starttls") as SmtpConfig["encryption"]

        return {
            host: values["smtp.host"],
            port: Number(values["smtp.port"] ?? "587"),
            encryption,
            username: values["smtp.username"] ?? "",
            password,
            from: values["smtp.from"],
        }
    }

    async getGeneralSettings(): Promise<GeneralSettings> {
        const records = (await this.repo.findAll()) ?? []
        const map: Record<string, string> = {}
        for (const r of records) {
            map[r.key] = r.value
        }

        return {
            instanceName: map[SETTING_KEYS.INSTANCE_NAME] ?? DEFAULTS.instanceName,
            baseUrl: map[SETTING_KEYS.BASE_URL] ?? DEFAULTS.baseUrl,
            timezone: map[SETTING_KEYS.TIMEZONE] ?? DEFAULTS.timezone,
        }
    }

    async updateGeneralSettings(data: Partial<GeneralSettings>): Promise<GeneralSettings> {
        if (data.instanceName !== undefined) {
            if (!data.instanceName.trim()) {
                throw new BadRequestError("Instance name must not be empty")
            }
        }

        if (data.baseUrl !== undefined && data.baseUrl !== "") {
            const urlResult = z.string().url().safeParse(data.baseUrl)
            if (!urlResult.success) {
                throw new BadRequestError("Base URL must be a valid URL")
            }
        }

        if (data.timezone !== undefined) {
            const validTimezones = Intl.supportedValuesOf("timeZone")
            if (!validTimezones.includes(data.timezone)) {
                throw new BadRequestError(`Timezone "${data.timezone}" is not a valid IANA timezone`)
            }
        }

        const updates: Array<{key: string; value: string}> = []

        if (data.instanceName !== undefined) {
            updates.push({key: SETTING_KEYS.INSTANCE_NAME, value: data.instanceName})
        }
        if (data.baseUrl !== undefined) {
            updates.push({key: SETTING_KEYS.BASE_URL, value: data.baseUrl})
        }
        if (data.timezone !== undefined) {
            updates.push({key: SETTING_KEYS.TIMEZONE, value: data.timezone})
        }

        await Promise.all(updates.map(({key, value}) => this.repo.upsert(key, value)))

        // Fetch current settings and merge with updates
        const current = await this.getGeneralSettings()
        return {
            instanceName: data.instanceName ?? current.instanceName,
            baseUrl: data.baseUrl ?? current.baseUrl,
            timezone: data.timezone ?? current.timezone,
        }
    }

    /**
     * Reads only the two proxy.* keys — never falls back to smtp.from,
     * instanceName, baseUrl or any user record (T-06-18's mitigation: the
     * ACME registration email must be a value the user entered for that
     * purpose, never derived from another stored address).
     */
    async getProxySettings(): Promise<ProxySettings> {
        const values = await this.repo.getMany([
            PROXY_SETTING_KEYS.ACME_EMAIL,
            PROXY_SETTING_KEYS.SHOW_IN_DASHBOARD,
        ])
        return {
            acmeEmail: values[PROXY_SETTING_KEYS.ACME_EMAIL] ?? "",
            showInDashboard: values[PROXY_SETTING_KEYS.SHOW_IN_DASHBOARD] === "true",
        }
    }

    /**
     * Upserts only the keys present in the argument. An empty acmeEmail is
     * valid (D-09 — no registration email required); a non-empty value must
     * be a valid email address. No encryption — an ACME registration
     * address is not a secret.
     */
    async updateProxySettings(data: Partial<ProxySettings>): Promise<void> {
        if (data.acmeEmail !== undefined && data.acmeEmail !== "") {
            const emailResult = z.string().email().safeParse(data.acmeEmail)
            if (!emailResult.success) {
                throw new BadRequestError("ACME email must be a valid email address")
            }
        }

        const updates: Array<{key: string; value: string}> = []
        if (data.acmeEmail !== undefined) {
            updates.push({key: PROXY_SETTING_KEYS.ACME_EMAIL, value: data.acmeEmail})
        }
        if (data.showInDashboard !== undefined) {
            updates.push({key: PROXY_SETTING_KEYS.SHOW_IN_DASHBOARD, value: String(data.showInDashboard)})
        }

        await Promise.all(updates.map(({key, value}) => this.repo.upsert(key, value)))
    }

    /**
     * Masked view of the backup repository settings — GET /api/settings/backup
     * used to build this inline. Secrets are never returned in plaintext,
     * only a presence indicator (hasSftpKey/hasS3SecretKey/hasPassword).
     */
    async getMaskedBackupRepositorySettings(): Promise<MaskedBackupRepositorySettings> {
        const keys = [
            "backup.repoType",
            "backup.repoPath",
            "backup.sftpHost",
            "backup.sftpUser",
            "backup.sftpKey",
            "backup.s3Endpoint",
            "backup.s3Bucket",
            "backup.s3AccessKey",
            "backup.s3SecretKey",
            "backup.password",
        ]
        const values = await this.repo.getMany(keys)
        return {
            repoType: values["backup.repoType"] ?? null,
            repoPath: values["backup.repoPath"] ?? null,
            sftpHost: values["backup.sftpHost"] ?? null,
            sftpUser: values["backup.sftpUser"] ?? null,
            hasSftpKey: !!values["backup.sftpKey"],
            s3Endpoint: values["backup.s3Endpoint"] ?? null,
            s3Bucket: values["backup.s3Bucket"] ?? null,
            s3AccessKey: values["backup.s3AccessKey"] ?? null,
            hasS3SecretKey: !!values["backup.s3SecretKey"],
            hasPassword: !!values["backup.password"],
        }
    }

    // Saves the backup-repository settings form as one grouped write — the
    // plain fields via repo.upsert (in the same order and under the same
    // presence conditionals the route used to apply inline), the three
    // secrets (sftpKey, s3SecretKey, password, in that order) via the
    // shared encrypted-write path (upsertEncryptedSetting(), added in plan
    // 10-09 for SMTP — reused here rather than duplicated). A blank/absent
    // secret leaves its stored value untouched, matching saveSmtpConfig()'s
    // blank-password conditional (T-10-33: a blanked backup password would
    // silently break every subsequent scheduled backup).
    async saveBackupRepositorySettings(data: BackupSettingsInput): Promise<void> {
        await this.repo.upsert("backup.repoType", data.repoType)
        if (data.repoPath) await this.repo.upsert("backup.repoPath", data.repoPath)
        if (data.sftpHost) await this.repo.upsert("backup.sftpHost", data.sftpHost)
        if (data.sftpUser) await this.repo.upsert("backup.sftpUser", data.sftpUser)
        if (data.s3Endpoint) await this.repo.upsert("backup.s3Endpoint", data.s3Endpoint)
        if (data.s3Bucket) await this.repo.upsert("backup.s3Bucket", data.s3Bucket)
        if (data.s3AccessKey) await this.repo.upsert("backup.s3AccessKey", data.s3AccessKey)

        if (data.sftpKey) await this.upsertEncryptedSetting("backup.sftpKey", data.sftpKey)
        if (data.s3SecretKey) await this.upsertEncryptedSetting("backup.s3SecretKey", data.s3SecretKey)
        if (data.password) await this.upsertEncryptedSetting("backup.password", data.password)
    }

    /**
     * Global default backup schedule/retention — GET /api/settings/backup-defaults
     * used to build this inline.
     */
    async getBackupDefaults(): Promise<BackupDefaultsView> {
        const values = await this.repo.getMany(["backup.defaultSchedule", "backup.defaultRetention"])
        const retentionRaw = values["backup.defaultRetention"]
        return {
            defaultSchedule: values["backup.defaultSchedule"] ?? null,
            defaultRetention: retentionRaw ? (JSON.parse(retentionRaw) as RetentionPolicy) : null,
        }
    }

    /**
     * Updates only the keys present in the argument — matches the route's
     * pre-existing per-field conditional upserts.
     */
    async updateBackupDefaults(data: {defaultSchedule?: string; defaultRetention?: RetentionPolicy}): Promise<void> {
        if (data.defaultSchedule !== undefined) {
            await this.repo.upsert("backup.defaultSchedule", data.defaultSchedule)
        }
        if (data.defaultRetention !== undefined) {
            await this.repo.upsert("backup.defaultRetention", JSON.stringify(data.defaultRetention))
        }
    }
}
