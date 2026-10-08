import {IntervalJob} from "./job.js"
import {windowStartFor} from "../domain/uptime.js"

export interface HealthHistoryPrunerStore {
    getRetentionDays(): Promise<number>
    deleteHealthEventsBefore(cutoff: Date): Promise<number>
    deleteResolvedIncidentsBefore(cutoff: Date): Promise<number>
}

/**
 * Issue #24/D-10: deletes the Phase 14 history that has aged out of the
 * configured retention window — ServiceHealthEvent rows created before the
 * window start and StackIncident rows resolved before it. Runs once at
 * startup (clearing any backlog) and then daily, offset from the midnight jobs.
 *
 * StatusLog is intentionally NOT pruned (D-11): it is also the source of the
 * activity timeline, so it is indexed instead (14-04) and left whole. Open
 * incidents survive too, since a `resolvedAt < cutoff` comparison never
 * matches a NULL resolvedAt.
 *
 * Lazily loads the production store at run time (ImageUpdateCheckPruner and
 * disk-checker precedent) so neither the database client nor the application
 * composition root enters unit-test module graphs.
 */
export class HealthHistoryPruner extends IntervalJob {
    readonly name = "HealthHistoryPruner"
    protected readonly cronExpression = "30 0 * * *"
    // Two indexed deletes: fast enough not to delay JobRegistry.startAll().
    protected readonly runImmediatelyOnStart = true

    private readonly store: HealthHistoryPrunerStore | null

    constructor(
        store?: HealthHistoryPrunerStore,
        private readonly now: () => Date = () => new Date(),
    ) {
        super()
        this.store = store ?? null
    }

    private async getStore(): Promise<HealthHistoryPrunerStore> {
        if (this.store !== null) return this.store
        const {settingsService} = await import("../application/index.js")
        const {serviceHealthEventRepository, stackIncidentRepository} = await import("../repositories/index.js")
        return {
            getRetentionDays: async () => (await settingsService.getHealthSettings()).retentionDays,
            deleteHealthEventsBefore: (cutoff) => serviceHealthEventRepository.deleteCreatedBefore(cutoff),
            deleteResolvedIncidentsBefore: (cutoff) => stackIncidentRepository.deleteResolvedBefore(cutoff),
        }
    }

    protected async run(): Promise<void> {
        const store = await this.getStore()
        // Deliberately not wrapped in try/catch: a failed read must reject
        // the run (IntervalJob records it) and never fall back to a default
        // window, which could delete history the user chose to keep.
        const retentionDays = await store.getRetentionDays()
        const cutoff = windowStartFor(this.now(), retentionDays)

        const healthEvents = await store.deleteHealthEventsBefore(cutoff)
        const incidents = await store.deleteResolvedIncidentsBefore(cutoff)
        if (healthEvents > 0 || incidents > 0) {
            console.log(`[HealthHistoryPruner] pruned ${healthEvents} health event(s) and ${incidents} incident(s)`)
        }
    }
}

export const healthHistoryPruner = new HealthHistoryPruner()
