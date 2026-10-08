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
 * #27/D-13: measures every stack's `<stack>/volumes/*` subdirectories with
 * `du` once a day, writes Stack.volumeSizeBytes (the sum) and volumeSizeAt,
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

    /** The post-boot scan. Never rejects: a failed first scan must not surface as an unhandled rejection. */
    async kickoff(): Promise<void> {
        try {
            await this.run()
        } catch (err) {
            console.error("[DiskUsageJob] initial scan failed:", err)
        }
    }

    private async getStore(): Promise<DiskUsageJobStore> {
        if (this.store !== null) return this.store
        const {stackRepository, stackDiskUsageRepository} = await import("../repositories/index.js")
        return {
            listStackIds: async () => (await stackRepository.findAll()).map((stack) => stack.id),
            recordStackUsage: (input) => stackDiskUsageRepository.recordStackUsage(input),
        }
    }

    protected async run(): Promise<void> {
        const store = await this.getStore()
        const stackIds = await store.listStackIds()
        for (const stackId of stackIds) {
            const usage = await this.measureStack(stackId)
            if (usage !== null) await store.recordStackUsage(usage)
        }
    }

    /** Null when any volume could not be sized: the stack keeps its previous figures instead of a partial sum. */
    private async measureStack(stackId: string): Promise<RecordStackUsageInput | null> {
        const volumesDir = path.join(this.resolveStackPath(stackId), "volumes")
        const names = await this.scanner.listVolumeDirectories(volumesDir)

        // D-13 / RESEARCH Open Question 3: `<stack>/volumes` is the only
        // measured location. A missing folder means the stack holds no
        // volume data, which is measured as 0 bytes, not "unmeasured".
        const volumes: Array<{name: string; sizeBytes: number}> = []
        for (const name of names ?? []) {
            const sizeBytes = await this.scanner.measureBytes(path.join(volumesDir, name))
            if (sizeBytes === null) return null
            volumes.push({name, sizeBytes})
        }

        return {
            stackId,
            volumes,
            volumeSizeBytes: volumes.reduce((sum, volume) => sum + volume.sizeBytes, 0),
            // `<stack>/backups` is measured by the follow-up plan (14-14).
            backupSizeBytes: null,
            measuredAt: this.now(),
        }
    }
}

export const diskUsageJob = new DiskUsageJob()
