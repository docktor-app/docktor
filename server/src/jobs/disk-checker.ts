import type {NotificationEvent} from "../application/notification-service.js"
import type {Job, JobHealthReporter} from "./job.js"
import {IntervalJob} from "./job.js"

export interface DiskCheckerNotificationService {
    notify(event: NotificationEvent): Promise<void>
}

export interface DiskCheckerSettings {
    getMany(keys: string[]): Promise<Record<string, string>>
    findLastDiskAlert(): Promise<{active: boolean} | null>
    setDiskAlertActive(active: boolean): Promise<void>
}

export class DiskChecker extends IntervalJob {
    readonly name = "DiskChecker"
    protected readonly cronExpression = "0 0 * * *"
    protected readonly runImmediatelyOnStart = true

    private readonly monitorPath: string

    constructor(
        private readonly notificationService: DiskCheckerNotificationService,
        private readonly settings: DiskCheckerSettings,
        monitorPath?: string,
    ) {
        super()
        this.monitorPath = monitorPath ?? "/var/lib/docker"
    }

    protected async run(): Promise<void> {
        await this.check()
    }

    async check(): Promise<void> {
        // check() is invoked both as this class's run() body and, in
        // production, directly by nothing else — this outer try/catch stays
        // even though IntervalJob's runGuarded() would also catch a thrown
        // error, because check() is a public method with its own
        // job-specific log line ("[DiskChecker] check failed:") that the
        // existing test suite asserts verbatim, and it must keep degrading
        // to a logged skip (not a rethrow) on a settings-query failure
        // against a freshly-provisioned database where the Setting table
        // may not exist yet.
        try {
            const settings = await this.settings.getMany([
                "notify.diskWarning",
                "disk.thresholdPercent",
                "disk.thresholdBytes",
            ])

            if (settings["notify.diskWarning"] === "false") return

            const thresholdPercent = Number(settings["disk.thresholdPercent"] ?? "10")
            const thresholdBytes = BigInt(settings["disk.thresholdBytes"] ?? "2147483648")

            await this.checkDiskUsage(thresholdPercent, thresholdBytes)
        } catch (err) {
            console.error("[DiskChecker] check failed:", err)
        }
    }

    private async checkDiskUsage(thresholdPercent: number, thresholdBytes: bigint): Promise<void> {
        let stats: {bsize: number; blocks: number; bavail: number}
        try {
            const {statfs} = await import("node:fs/promises")
            stats = await statfs(this.monitorPath)
        } catch (err) {
            console.error("[DiskChecker] statfs failed:", err)
            return
        }

        const freeBytes = BigInt(stats.bavail) * BigInt(stats.bsize)
        const totalBytes = BigInt(stats.blocks) * BigInt(stats.bsize)
        const freePercent = totalBytes > 0n ? Number(freeBytes * 100n / totalBytes) : 100

        const belowPercent = freePercent < thresholdPercent
        const belowBytes = freeBytes < thresholdBytes
        const triggered = belowPercent || belowBytes

        const lastAlert = await this.settings.findLastDiskAlert()

        if (triggered && (!lastAlert || !lastAlert.active)) {
            await this.settings.setDiskAlertActive(true)

            const freeMB = Number(freeBytes / (1024n * 1024n))
            const totalMB = Number(totalBytes / (1024n * 1024n))
            const thresholdKind = belowPercent ? `below ${thresholdPercent}%` : `below ${Number(thresholdBytes / (1024n * 1024n * 1024n))}GB`
            const message = [
                `Disk space warning on ${this.monitorPath}`,
                ``,
                `Free space: ${freeMB} MB (${freePercent}%) of ${totalMB} MB total`,
                `Threshold crossed: ${thresholdKind}`,
                ``,
                `This notification will not repeat until disk space recovers above the threshold.`,
            ].join("\n")

            await this.notificationService.notify({
                type: "disk_warning",
                subject: "Disk space warning",
                message,
            })
        } else if (!triggered && lastAlert?.active) {
            await this.settings.setDiskAlertActive(false)
        }
    }
}

let _checker: DiskChecker | null = null
let _healthReporter: JobHealthReporter | null = null

async function createProductionChecker(): Promise<DiskChecker> {
    const [{notificationService, settingsRepository}, {notificationRepository}] = await Promise.all([
        import("../application/index.js"),
        import("../repositories/notification-repository.js"),
    ])

    const combinedSettings: DiskCheckerSettings = {
        getMany: (keys: string[]) => settingsRepository.getMany(keys),
        findLastDiskAlert: () => notificationRepository.findLastDiskAlert(),
        setDiskAlertActive: (active: boolean) => notificationRepository.setDiskAlertActive(active),
    }

    const monitorPath = process.env.DOCKER_DATA_PATH ?? (process.platform === "win32" ? "." : "/var/lib/docker")

    const checker = new DiskChecker(notificationService, combinedSettings, monitorPath)
    if (_healthReporter) checker.setHealthReporter(_healthReporter)
    return checker
}

// A Job facade over the lazily-constructed production DiskChecker — the
// lazy construction itself (not this facade) is what keeps db.ts and the
// rest of the production dependency chain out of the unit-test module
// graph; several suites depend on that staying true.
export const diskChecker: Job = {
    name: "DiskChecker",
    kind: "interval",
    start: async () => {
        _checker = await createProductionChecker()
        await _checker.start()
    },
    stop: () => _checker?.stop(),
    setHealthReporter: (reporter: JobHealthReporter) => {
        _healthReporter = reporter
        _checker?.setHealthReporter(reporter)
    },
}
