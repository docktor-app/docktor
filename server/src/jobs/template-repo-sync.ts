import {IntervalJob} from "./job.js"

// Issue #19/D-08: a repo is re-synced once its last sync attempt is older
// than this, or was never attempted — same per-repo staleness model as
// UpdateChecker's stagger window, but a fixed threshold rather than a
// stagger-across-N-items one, since the number of template repos is small
// and git-sync cost (unlike a registry round trip) does not scale per item.
export const TEMPLATE_SYNC_MAX_AGE_MS = 6 * 60 * 60 * 1000 // 6 hours

interface TemplateSyncer {
    syncStaleRepos(maxAgeMs: number): Promise<void>
}

interface TemplateUpdater {
    refreshPinnedStacks(): Promise<{changed: number}>
}

interface TemplateRepoSyncDeps {
    templates: TemplateSyncer
    updates: TemplateUpdater
}

/**
 * Issue #19/D-08: keeps template repos fresh in the background and refreshes
 * every pinned stack's passive "template updated" badge. Lazily loads the
 * production templateService/templateUpdateService singletons at run time
 * (UpdateChecker precedent) so db.ts stays out of the unit-test module graph.
 */
export class TemplateRepoSync extends IntervalJob {
    readonly name = "TemplateRepoSync"
    protected readonly cronExpression = "*/30 * * * *"
    protected readonly runImmediatelyOnStart = false

    private readonly deps: TemplateRepoSyncDeps | null

    constructor(deps?: TemplateRepoSyncDeps) {
        super()
        this.deps = deps ?? null
    }

    private async getDeps(): Promise<TemplateRepoSyncDeps> {
        if (this.deps !== null) return this.deps
        const {templateService, templateUpdateService} = await import("../application/index.js")
        return {templates: templateService, updates: templateUpdateService}
    }

    protected async run(): Promise<void> {
        const {templates, updates} = await this.getDeps()

        // One repo's git/read failure must never prevent the badge refresh
        // below from running — syncStaleRepos already isolates per-repo
        // failures internally, this catch only guards the unexpected case of
        // the call itself rejecting.
        try {
            await templates.syncStaleRepos(TEMPLATE_SYNC_MAX_AGE_MS)
        } catch (err) {
            console.error("[TemplateRepoSync] syncStaleRepos failed:", err instanceof Error ? err.message : err)
        }

        // Wrapped in its own try/catch (not chained onto the step above) so
        // run() always resolves even when both dependencies reject —
        // IntervalJob.runGuarded must see a normal "run" outcome, not an
        // unhandled crash loop.
        try {
            await updates.refreshPinnedStacks()
        } catch (err) {
            console.error("[TemplateRepoSync] refreshPinnedStacks failed:", err instanceof Error ? err.message : err)
        }
    }
}

export const templateRepoSync = new TemplateRepoSync()
