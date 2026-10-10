import path from "node:path"
import type {DiskUsageScannerPort} from "../application/ports/disk-usage-scanner-port.js"
import {diskUsageScanner} from "../infrastructure/disk-usage-scanner.js"
import {getStackPath} from "../lib/stacks-dir.js"
import type {RecordStackUsageInput} from "../repositories/stack-disk-usage-repository.js"
import {IntervalJob} from "./job.js"

export interface DiskUsageJobStore {
    listStackIds(): Promise<string[]>
    recordStackUsage(input: RecordStackUsageInput): Promise<void>
}

/**
 * The first scan starts this long after boot, on its own timer. `du` over a
 * large volume can take minutes and JobRegistry.startAll() awaits every
 * start() in sequence, so scanning inside start() would delay every job
 * registered after this one (RESEARCH Finding 7).
 */
export const KICKOFF_DELAY_MS = 60_000

/**
 * #27/D-13: measures every stack's `<stack>/volumes/*` subdirectories and its
 * local `<stack>/backups` repository (D-14 amended) with `du` once a day,
 * writes Stack.volumeSizeBytes (the sum), backupSizeBytes and volumeSizeAt,
 * and replaces the stack's StackVolumeUsage rows in one transaction.
 *
 * `runImmediatelyOnStart` is false on purpose; see KICKOFF_DELAY_MS. The
 * first scan after boot is a non-awaited, unref()ed timer, so it neither
 * delays startup nor keeps the process alive.
 *
 * Lazily loads the production repositories at run time (ImageUpdateCheckPruner
 * precedent) so the database client stays out of unit-test module graphs.
 */
export class DiskUsageJob extends IntervalJob {
    readonly name = "DiskUsageJob"
    // Daily, offset from DiskChecker's midnight run.
    protected readonly cronExpression = "15 0 * * *"
    protected readonly runImmediatelyOnStart = false

    private readonly store: DiskUsageJobStore | null
    private kickoffTimer: NodeJS.Timeout | null = null
    private scanning = false

    constructor(
        store?: DiskUsageJobStore,
        private readonly scanner: DiskUsageScannerPort = diskUsageScanner,
        private readonly resolveStackPath: (id: string) => string = getStackPath,
        private readonly now: () => Date = () => new Date(),
    ) {
        super()
        this.store = store ?? null
    }

    override async start(): Promise<void> {
        await super.start()
        if (this.kickoffTimer !== null) return
        this.kickoffTimer = setTimeout(() => {
            this.kickoffTimer = null
            void this.kickoff()
        }, KICKOFF_DELAY_MS)
        this.kickoffTimer.unref()
    }

    override stop(): void {
        if (this.kickoffTimer !== null) {
            clearTimeout(this.kickoffTimer)
            this.kickoffTimer = null
        }
        super.stop()
    }

    /**
     * The post-boot scan, through the guarded run so its outcome is logged and
     * recorded on the job health reporter like a scheduled run (WR-09). Never
     * rejects: a failed first scan must not surface as an unhandled rejection.
     */
    kickoff(): Promise<void> {
        return this.runGuarded()
    }

    private async getStore(): Promise<DiskUsageJobStore> {
        if (this.store !== null) return this.store
        const {stackRepository, stackDiskUsageRepository} = await import("../repositories/index.js")
        return {
            listStackIds: async () => (await stackRepository.findAll()).map((stack) => stack.id),
            recordStackUsage: (input) => stackDiskUsageRepository.recordStackUsage(input),
        }
    }

    /**
     * Never two scans at once (T-14-68): the cron run and the kickoff could
     * otherwise race delete-then-create on the (stackId, name) unique key. A
     * skipped run still counts as a run on the health reporter, because the job
     * is alive and a scan is in progress.
     */
    protected async run(): Promise<void> {
        if (this.scanning) {
            console.warn("[DiskUsageJob] a scan is already running; skipping this run")
            return
        }
        this.scanning = true
        try {
            await this.scan()
        } finally {
            this.scanning = false
        }
    }

    private async scan(): Promise<void> {
        const store = await this.getStore()
        const stackIds = await store.listStackIds()
        let measured = 0
        for (const stackId of stackIds) {
            if (await this.recordStack(store, stackId)) measured++
        }
        console.log(`[DiskUsageJob] measured ${measured} stack(s)`)
    }

    /**
     * One stack's measure-and-record step. Never throws (T-14-56): an escape-check
     * failure, an unavailable measurement or a rejected write skips this stack only.
     */
    private async recordStack(store: DiskUsageJobStore, stackId: string): Promise<boolean> {
        try {
            const usage = await this.measureStack(stackId)
            if (usage === null) {
                // T-14-55: keep the previously stored figures rather than a partial or zero value.
                console.warn(`[DiskUsageJob] skipped stack "${stackId}": a measurement was unavailable`)
                return false
            }
            await store.recordStackUsage(usage)
            return true
        } catch (err) {
            console.error(`[DiskUsageJob] failed to measure stack "${stackId}":`, err)
            return false
        }
    }

    /** Null when any volume or the backups repository could not be sized: the stack keeps its previous figures. */
    private async measureStack(stackId: string): Promise<RecordStackUsageInput | null> {
        const stackPath = this.resolveStackPath(stackId)
        const volumes = await this.measureVolumes(path.join(stackPath, "volumes"))
        if (volumes === null) return null
        const backups = await this.measureBackups(path.join(stackPath, "backups"))
        if (backups === null) return null

        return {
            stackId,
            volumes,
            volumeSizeBytes: volumes.reduce((sum, volume) => sum + volume.sizeBytes, 0),
            backupSizeBytes: backups.sizeBytes,
            measuredAt: this.now(),
        }
    }

    private async measureVolumes(volumesDir: string): Promise<Array<{name: string; sizeBytes: number}> | null> {
        // Pitfall 9 / WR-03: a container can replace `volumes` with a symlink, so
        // the folder itself is lstat-checked and never followed. Like a missing
        // one (D-13 / RESEARCH Open Question 3) it holds no volume data, which is
        // measured as 0 bytes, not "unmeasured".
        if (!(await this.scanner.isRealDirectory(volumesDir))) return []
        const names = await this.scanner.listVolumeDirectories(volumesDir)
        const volumes: Array<{name: string; sizeBytes: number}> = []
        for (const name of names ?? []) {
            const sizeBytes = await this.scanner.measureBytes(path.join(volumesDir, name))
            if (sizeBytes === null) return null
            volumes.push({name, sizeBytes})
        }
        return volumes
    }

    /**
     * D-14 (amended): `<stack>/backups` is the stack-local restic repository.
     * Only a real directory is sized (Pitfall 9: a symlink is never followed);
     * no local repository is a measured null. The outer null means unavailable.
     */
    private async measureBackups(backupsDir: string): Promise<{sizeBytes: number | null} | null> {
        if (!(await this.scanner.isRealDirectory(backupsDir))) return {sizeBytes: null}
        const sizeBytes = await this.scanner.measureBytes(backupsDir)
        return sizeBytes === null ? null : {sizeBytes}
    }
}

export const diskUsageJob = new DiskUsageJob()
