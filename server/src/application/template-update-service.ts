import {isTemplateUpdated} from "../domain/template-pin.js";

export interface PinnedStackRow {
    id: string;
    templateRepoUrl: string | null;
    templatePath: string | null;
    templateContentHash: string | null;
    templateUpdateAvailable: boolean;
}

/**
 * Narrow port onto StackRepository (Issue #19/D-08): exactly the two methods
 * this service needs — a reader scoped to already-pinned stacks and a
 * single-column writer. There is no path from here to a stack's compose
 * file, .env file, or any other column (T-12-40) — the prohibition is
 * structural, not just a convention.
 */
export interface PinnedStackStore {
    findTemplatePinnedStacks(): Promise<PinnedStackRow[]>;
    setTemplateUpdateAvailable(id: string, value: boolean): Promise<void>;
}

export interface VariantContentHash {
    repoUrl: string;
    path: string;
    contentHash: string;
}

/** Narrow port onto TemplateRepository — the current synced index's content hashes only. */
export interface TemplateHashReader {
    findVariantContentHashes(): Promise<VariantContentHash[]>;
}

function pinKey(repoUrl: string, path: string): string {
    return `${repoUrl}\u0000${path}`;
}

/**
 * Issue #19/D-08: refreshes Stack.templateUpdateAvailable for every
 * template-pinned stack by comparing each pin's stored content hash against
 * the currently-synced index. This service has no filesystem, StackService,
 * or compose-write capability — it is incapable of modifying a stack's
 * files; the only effect it can ever have is flipping the passive badge
 * flag (T-12-40).
 */
export class TemplateUpdateService {
    constructor(
        private readonly stacks: PinnedStackStore,
        private readonly templates: TemplateHashReader,
    ) {}

    async refreshPinnedStacks(): Promise<{changed: number}> {
        const [pinned, hashes] = await Promise.all([
            this.stacks.findTemplatePinnedStacks(),
            this.templates.findVariantContentHashes(),
        ]);

        const hashIndex = new Map<string, string>();
        for (const h of hashes) {
            hashIndex.set(pinKey(h.repoUrl, h.path), h.contentHash);
        }

        let changed = 0;
        for (const stack of pinned) {
            // findTemplatePinnedStacks() only ever returns rows where all
            // three pin fields are non-null (its own query filter) — these
            // non-null assertions reflect that invariant, not an unchecked cast.
            const currentHash = hashIndex.get(pinKey(stack.templateRepoUrl!, stack.templatePath!));
            // A removed variant or an unconfigured repo yields `undefined`
            // here, which isTemplateUpdated() always treats as "not
            // updated" — re-pinning is never automatic (D-08 prohibition).
            const updated = isTemplateUpdated(stack.templateContentHash!, currentHash);
            if (updated === stack.templateUpdateAvailable) continue;

            await this.stacks.setTemplateUpdateAvailable(stack.id, updated);
            changed++;
        }

        return {changed};
    }
}
