import {prisma} from "../lib/db.js"

export const SETTING_KEYS = {
    INSTANCE_NAME: "instanceName",
    BASE_URL: "baseUrl",
    TIMEZONE: "timezone",
} as const

export class SettingsRepository {
    async findByKey(key: string): Promise<{key: string; value: string} | null> {
        return prisma.setting.findUnique({where: {key}})
    }

    async upsert(key: string, value: string): Promise<void> {
        await prisma.setting.upsert({
            where: {key},
            create: {key, value},
            update: {value},
        })
    }

    // Stores value with the encrypted flag set — the single write path for secrets.
    // Callers must pass an already-encrypted value; this method never encrypts.
    async upsertEncrypted(key: string, value: string): Promise<void> {
        await prisma.setting.upsert({
            where: {key},
            create: {key, value, encrypted: true},
            update: {value, encrypted: true},
        })
    }

    async findAll(): Promise<{key: string; value: string}[]> {
        return prisma.setting.findMany()
    }

    // WR-07 concurrency guard: an exclusive insert of a lock row. `key` is
    // the table's primary key, so Postgres guarantees only one concurrent
    // insert of the same key can ever succeed — every losing caller's insert
    // rejects with a uniqueness violation. That rejection MUST propagate to
    // the caller unchanged: no try/catch, no rejection handler, no upsert
    // fallback here. The caller (OnboardingService) is the sole place that
    // decides what a losing insert means.
    async insertExclusive(key: string, value: string): Promise<void> {
        await prisma.setting.create({data: {key, value}})
    }

    // Releases a lock row acquired via insertExclusive(). Tolerates an
    // already-absent row (e.g. a second release attempt, or a row that was
    // never created) so the release side of an acquire/release pair can
    // always run unconditionally from a `finally` block.
    async deleteIfPresent(key: string): Promise<void> {
        await prisma.setting.delete({where: {key}}).catch(() => {})
    }

    // Convenience alias for plan interface compatibility
    async get(key: string): Promise<string | null> {
        const record = await this.findByKey(key)
        return record?.value ?? null
    }

    async getMany(keys: string[]): Promise<Record<string, string>> {
        const records = await prisma.setting.findMany({where: {key: {in: keys}}})
        return records.reduce(
            (acc: Record<string, string>, r: {key: string; value: string}) => {
                acc[r.key] = r.value
                return acc
            },
            {} as Record<string, string>,
        )
    }
}

export const settingsRepository = new SettingsRepository()
