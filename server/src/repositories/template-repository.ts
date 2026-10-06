import {prisma} from "../lib/db.js";
import {ConflictError, NotFoundError} from "../lib/errors.js";

export interface SyncedVariant {
    slug: string;
    name: string;
    description: string;
    usage: string | null;
    composeContent: string;
    envContent: string | null;
    contentHash: string;
}

export interface SyncedTemplate {
    slug: string;
    name: string;
    description: string;
    category: string;
    iconDataUri: string | null;
    variants: SyncedVariant[];
}

export interface RecordSyncSuccessInput {
    headCommitSha: string | null;
    issues: Array<{path: string; message: string}>;
    templates: SyncedTemplate[];
    at: Date;
}

/**
 * The only Prisma access for TemplateRepo/Template/TemplateVariant (CLAUDE.md
 * Repository rule). recordSyncSuccess replaces a repo's entire template
 * index in one transaction — upserting every template/variant the reader
 * just produced by its (repoId, slug)/(templateId, slug) composite key, then
 * pruning anything no longer present — so a template/variant id stays stable
 * across syncs and a concurrent reader never sees a half-updated index.
 */
export class TemplateRepository {
    /** Upsert by url with an empty update — used to seed/find the default repo idempotently. */
    async ensureRepo(url: string, options: {isDefault?: boolean} = {}) {
        return prisma.templateRepo.upsert({
            where: {url},
            create: {url, isDefault: options.isDefault ?? false},
            update: {},
        });
    }

    /** Used by 12-10's "add a repo" flow — throws (not upserts) when the url already exists. */
    async createRepo(url: string) {
        const existing = await prisma.templateRepo.findUnique({where: {url}});
        if (existing) {
            throw new ConflictError("Template repository already added");
        }
        return prisma.templateRepo.create({data: {url}});
    }

    async findAllRepos() {
        return prisma.templateRepo.findMany({
            orderBy: [{isDefault: "desc"}, {createdAt: "asc"}],
        });
    }

    async findRepoByIdOrThrow(id: string) {
        const repo = await prisma.templateRepo.findUnique({where: {id}});
        if (!repo) {
            throw new NotFoundError(`Template repository "${id}" not found`);
        }
        return repo;
    }

    /**
     * Replaces repoId's entire template/variant index in one transaction:
     * upsert every template by (repoId, slug), upsert every variant by
     * (templateId, slug), delete variants/templates no longer present, then
     * update the repo's sync bookkeeping fields. Never partially applies —
     * a failure anywhere rolls back the whole sync, leaving the prior index
     * (and the repo's lastSyncedAt) untouched.
     */
    async recordSyncSuccess(repoId: string, data: RecordSyncSuccessInput): Promise<void> {
        await prisma.$transaction(async (tx) => {
            const keptTemplateSlugs = data.templates.map((t) => t.slug);

            for (const template of data.templates) {
                const templateRow = await tx.template.upsert({
                    where: {repoId_slug: {repoId, slug: template.slug}},
                    create: {
                        repoId,
                        slug: template.slug,
                        name: template.name,
                        description: template.description,
                        category: template.category,
                        iconDataUri: template.iconDataUri,
                    },
                    update: {
                        name: template.name,
                        description: template.description,
                        category: template.category,
                        iconDataUri: template.iconDataUri,
                    },
                });

                const keptVariantSlugs = template.variants.map((v) => v.slug);
                for (const variant of template.variants) {
                    await tx.templateVariant.upsert({
                        where: {templateId_slug: {templateId: templateRow.id, slug: variant.slug}},
                        create: {
                            templateId: templateRow.id,
                            slug: variant.slug,
                            name: variant.name,
                            description: variant.description,
                            usage: variant.usage,
                            composeContent: variant.composeContent,
                            envContent: variant.envContent,
                            contentHash: variant.contentHash,
                        },
                        update: {
                            name: variant.name,
                            description: variant.description,
                            usage: variant.usage,
                            composeContent: variant.composeContent,
                            envContent: variant.envContent,
                            contentHash: variant.contentHash,
                        },
                    });
                }

                await tx.templateVariant.deleteMany({
                    where: {templateId: templateRow.id, slug: {notIn: keptVariantSlugs}},
                });
            }

            await tx.template.deleteMany({
                where: {repoId, slug: {notIn: keptTemplateSlugs}},
            });

            await tx.templateRepo.update({
                where: {id: repoId},
                data: {
                    lastSyncAttemptAt: data.at,
                    lastSyncedAt: data.at,
                    lastSyncError: null,
                    headCommitSha: data.headCommitSha,
                    syncIssues: JSON.stringify(data.issues),
                },
            });
        });
    }

    /** Records a failed sync attempt — never touches lastSyncedAt or the existing index. */
    async recordSyncFailure(repoId: string, message: string, at: Date): Promise<void> {
        await prisma.templateRepo.update({
            where: {id: repoId},
            data: {lastSyncAttemptAt: at, lastSyncError: message},
        });
    }

    /** The full, persisted template index across every repo — variants selecting summary fields only (no composeContent). */
    async listTemplateIndex() {
        return prisma.template.findMany({
            include: {
                repo: {select: {id: true, url: true}},
                variants: {
                    select: {id: true, slug: true, name: true, description: true},
                    orderBy: [{name: "asc"}, {slug: "asc"}],
                },
            },
            orderBy: [{name: "asc"}, {slug: "asc"}],
        });
    }

    // Issue #19/D-08: every currently-synced variant's content hash, keyed by
    // (repoUrl, "<template-slug>/<variant-slug>") — the shape
    // TemplateUpdateService compares against each pinned stack's
    // templateContentHash. A variant pruned by a later recordSyncSuccess()
    // simply stops appearing here (no tombstone needed).
    async findVariantContentHashes(): Promise<Array<{repoUrl: string; path: string; contentHash: string}>> {
        const variants = await prisma.templateVariant.findMany({
            select: {
                slug: true,
                contentHash: true,
                template: {select: {slug: true, repo: {select: {url: true}}}},
            },
        });
        return variants.map((v) => ({
            repoUrl: v.template.repo.url,
            path: `${v.template.slug}/${v.slug}`,
            contentHash: v.contentHash,
        }));
    }

    async findVariantByIdOrThrow(variantId: string) {
        const variant = await prisma.templateVariant.findUnique({
            where: {id: variantId},
            include: {template: {include: {repo: true}}},
        });
        if (!variant) {
            throw new NotFoundError(`Template variant "${variantId}" not found`);
        }
        return variant;
    }
}

export const templateRepository = new TemplateRepository();
