import path from "node:path";
import type {CreateStackInput} from "@docktor/shared";
import {withKeyedLock} from "../lib/keyed-mutex.js";
import type {TemplateRepository} from "../repositories/template-repository.js";
import type {GitExecutorPort} from "./ports/git-executor-port.js";
import type {TemplateSourceReaderPort} from "./ports/template-source-reader-port.js";

export interface TemplateServiceConfig {
    defaultRepoUrl(): string | null;
    cacheDir(): string;
}

/**
 * Narrow port onto StackService (Issue #19/#20): declared here rather than
 * importing the concrete class, same reasoning as StackService's own ports —
 * this service stays unit-testable with a plain object and the dependency
 * arrow keeps pointing inward. Typed against the current createStack
 * signature until plan 12-07 Task 3 adds CreateStackOptions and widens this.
 */
export interface TemplateStackCreator {
    createStack(input: CreateStackInput): Promise<{id: string}>;
}

export interface TemplateIssueView {
    path: string;
    message: string;
}

export interface TemplateRepoView {
    id: string;
    url: string;
    isDefault: boolean;
    headCommitSha: string | null;
    lastSyncAttemptAt: Date | null;
    lastSyncedAt: Date | null;
    lastSyncError: string | null;
    issues: TemplateIssueView[];
}

export interface TemplateVariantSummaryView {
    id: string;
    slug: string;
    name: string;
    description: string;
}

export interface TemplateSummaryView {
    id: string;
    repoId: string;
    slug: string;
    name: string;
    description: string;
    category: string;
    iconDataUri: string | null;
    variants: TemplateVariantSummaryView[];
}

export interface TemplateCatalog {
    repos: TemplateRepoView[];
    templates: TemplateSummaryView[];
}

type TemplateRepoRow = Awaited<ReturnType<TemplateRepository["findRepoByIdOrThrow"]>>;
type TemplateIndexRow = Awaited<ReturnType<TemplateRepository["listTemplateIndex"]>>[number];

/**
 * Seeds and syncs template repositories through the 12-04 git/read adapters,
 * persisting a deduplicated, deterministic index via TemplateRepository. The
 * full dependency list a later plan (12-09/12-10/12-11) needs is already
 * present in the constructor so none of them ever change its shape.
 */
export class TemplateService {
    constructor(
        private readonly repo: TemplateRepository,
        private readonly git: GitExecutorPort,
        private readonly reader: TemplateSourceReaderPort,
        private readonly stacks: TemplateStackCreator,
        private readonly config: TemplateServiceConfig,
    ) {}

    /** Seeds the official/configured default repo row if missing. A null url (disabled) is a no-op. */
    async ensureDefaultRepo(): Promise<void> {
        const url = this.config.defaultRepoUrl();
        if (!url) return;
        await this.repo.ensureRepo(url, {isDefault: true});
    }

    /**
     * Syncs one repo: git checkout -> validated read -> persisted index, all
     * serialized per repo id so a concurrent read never observes a
     * half-updated checkout (T-12-26). Never rethrows a git/read failure —
     * it is recorded on the repo row instead, so a caller (listTemplates,
     * the manual re-sync route) always resolves with the repo's current
     * status rather than throwing for a single bad repo. An unknown repo id
     * does throw (NotFoundError), since that is a caller error, not a sync
     * failure.
     */
    async syncRepo(repoId: string): Promise<TemplateRepoView> {
        return withKeyedLock(`template-repo:${repoId}`, async () => {
            const repoRow = await this.repo.findRepoByIdOrThrow(repoId);
            const at = new Date();

            try {
                const checkoutDir = path.join(this.config.cacheDir(), repoRow.id);
                const {headCommitSha} = await this.git.syncCheckout(repoRow.url, checkoutDir);
                const {templates, issues} = await this.reader.readCheckout(checkoutDir);
                await this.repo.recordSyncSuccess(repoRow.id, {headCommitSha, issues, templates, at});
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                await this.repo.recordSyncFailure(repoRow.id, message, at);
            }

            const updated = await this.repo.findRepoByIdOrThrow(repoRow.id);
            return this.toRepoView(updated);
        });
    }

    /**
     * Ensures the default repo exists, syncs every repo that has never been
     * attempted (so the first browse — or the first call after an air-gapped
     * override is lifted — always returns a populated catalog instead of an
     * empty one the client has to poll for), then returns every repo's
     * status alongside the full persisted template index.
     */
    async listTemplates(): Promise<TemplateCatalog> {
        await this.ensureDefaultRepo();

        const neverSynced = (await this.repo.findAllRepos()).filter((r) => r.lastSyncAttemptAt === null);
        for (const r of neverSynced) {
            await this.syncRepo(r.id);
        }

        const [repos, index] = await Promise.all([
            this.repo.findAllRepos(),
            this.repo.listTemplateIndex(),
        ]);

        const templates = index
            .map((row) => this.toTemplateSummaryView(row))
            .sort((a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug));

        return {
            repos: repos.map((row) => this.toRepoView(row)),
            templates,
        };
    }

    private toRepoView(row: TemplateRepoRow): TemplateRepoView {
        return {
            id: row.id,
            url: row.url,
            isDefault: row.isDefault,
            headCommitSha: row.headCommitSha,
            lastSyncAttemptAt: row.lastSyncAttemptAt,
            lastSyncedAt: row.lastSyncedAt,
            lastSyncError: row.lastSyncError,
            issues: this.parseIssues(row.syncIssues),
        };
    }

    private toTemplateSummaryView(row: TemplateIndexRow): TemplateSummaryView {
        return {
            id: row.id,
            repoId: row.repo.id,
            slug: row.slug,
            name: row.name,
            description: row.description,
            category: row.category,
            iconDataUri: row.iconDataUri,
            variants: row.variants.map((v) => ({
                id: v.id,
                slug: v.slug,
                name: v.name,
                description: v.description,
            })),
        };
    }

    /** Malformed/absent syncIssues decodes to an empty list rather than throwing. */
    private parseIssues(raw: string | null): TemplateIssueView[] {
        if (!raw) return [];
        try {
            const parsed: unknown = JSON.parse(raw);
            return Array.isArray(parsed) ? (parsed as TemplateIssueView[]) : [];
        } catch {
            return [];
        }
    }
}
