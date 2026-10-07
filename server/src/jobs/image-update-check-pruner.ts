import {IntervalJob} from "./job.js"

export interface ImageUpdateCheckPrunerStore {
    findTrackedImageRefs(): Promise<string[]>
    deleteAllExcept(imageRefs: readonly string[]): Promise<number>
}

/**
 * Issue #29/D-10: deletes ImageUpdateCheck rows for image+tag combinations
 * no current service produces, so the table stops growing without bound.
 * Runs once at startup (clearing the pre-existing backlog) and then daily.
 *
 * D-11: the tracked set comes from the same repository query UpdateChecker
 * scans with, so the prune rule cannot drift from the check rule.
 *
 * Race: a ref UpdateChecker is checking is, by definition, in the tracked
 * set when the set is read, so its row survives. A row re-created by an
 * in-flight check after a tag change is an orphan the next daily run
 * removes — a harmless cache row.
 *
 * Lazily loads the production repository at run time (TemplateRepoSync
 * precedent) so the database client stays out of unit-test module graphs.
 */
export class ImageUpdateCheckPruner extends IntervalJob {
    readonly name = "ImageUpdateCheckPruner"
    protected readonly cronExpression = "0 0 * * *"
    protected readonly runImmediatelyOnStart = true

    private readonly store: ImageUpdateCheckPrunerStore | null

    constructor(store?: ImageUpdateCheckPrunerStore) {
        super()
        this.store = store ?? null
    }

    private async getStore(): Promise<ImageUpdateCheckPrunerStore> {
        if (this.store !== null) return this.store
        const {imageUpdateCheckRepository} = await import("../repositories/index.js")
        return imageUpdateCheckRepository
    }

    protected async run(): Promise<void> {
        const store = await this.getStore()
        const trackedRefs = await store.findTrackedImageRefs()
        const pruned = await store.deleteAllExcept(trackedRefs)
        if (pruned > 0) {
            console.log(`[ImageUpdateCheckPruner] pruned ${pruned} stale row(s)`)
        }
    }
}

export const imageUpdateCheckPruner = new ImageUpdateCheckPruner()
