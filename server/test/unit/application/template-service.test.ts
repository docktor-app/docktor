import path from "node:path";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {TemplateService} from "../../../src/application/template-service.js";
import {ConfirmationRequiredError, ConflictError, NotFoundError} from "../../../src/lib/errors.js";

const OFFICIAL_URL = "https://github.com/docktor-app/templates";

// --- In-memory fake TemplateRepository --------------------------------
// Mirrors the real Prisma-backed repository's upsert/prune transaction
// semantics closely enough to exercise TemplateService's re-sync
// id-stability/pruning behavior without a database.

interface FakeRepoRow {
    id: string;
    url: string;
    isDefault: boolean;
    headCommitSha: string | null;
    lastSyncAttemptAt: Date | null;
    lastSyncedAt: Date | null;
    lastSyncError: string | null;
    syncIssues: string | null;
}

interface FakeVariantRow {
    id: string;
    templateId: string;
    slug: string;
    name: string;
    description: string;
    usage: string | null;
    composeContent: string;
    envContent: string | null;
    contentHash: string;
}

interface FakeTemplateRow {
    id: string;
    repoId: string;
    slug: string;
    name: string;
    description: string;
    category: string;
    iconDataUri: string | null;
}

interface FakeSyncedVariant {
    slug: string;
    name: string;
    description: string;
    usage: string | null;
    composeContent: string;
    envContent: string | null;
    contentHash: string;
}

interface FakeSyncedTemplate {
    slug: string;
    name: string;
    description: string;
    category: string;
    iconDataUri: string | null;
    variants: FakeSyncedVariant[];
}

class FakeTemplateRepository {
    repos: FakeRepoRow[] = [];
    templates: FakeTemplateRow[] = [];
    variants: FakeVariantRow[] = [];
    private seq = 0;

    private nextId(prefix: string): string {
        this.seq += 1;
        return `${prefix}-${this.seq}`;
    }

    async ensureRepo(url: string, options: {isDefault?: boolean} = {}): Promise<FakeRepoRow> {
        const existing = this.repos.find((r) => r.url === url);
        if (existing) return existing;
        const row: FakeRepoRow = {
            id: this.nextId("repo"),
            url,
            isDefault: options.isDefault ?? false,
            headCommitSha: null,
            lastSyncAttemptAt: null,
            lastSyncedAt: null,
            lastSyncError: null,
            syncIssues: null,
        };
        this.repos.push(row);
        return row;
    }

    async createRepo(url: string): Promise<FakeRepoRow> {
        if (this.repos.some((r) => r.url === url)) {
            throw new ConflictError("Template repository already added");
        }
        const row: FakeRepoRow = {
            id: this.nextId("repo"),
            url,
            isDefault: false,
            headCommitSha: null,
            lastSyncAttemptAt: null,
            lastSyncedAt: null,
            lastSyncError: null,
            syncIssues: null,
        };
        this.repos.push(row);
        return row;
    }

    async findAllRepos(): Promise<FakeRepoRow[]> {
        return [...this.repos].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
    }

    async findRepoByIdOrThrow(id: string): Promise<FakeRepoRow> {
        const row = this.repos.find((r) => r.id === id);
        if (!row) throw new NotFoundError(`Template repository "${id}" not found`);
        return row;
    }

    async recordSyncSuccess(
        repoId: string,
        data: {headCommitSha: string | null; issues: Array<{path: string; message: string}>; templates: FakeSyncedTemplate[]; at: Date},
    ): Promise<void> {
        const repo = await this.findRepoByIdOrThrow(repoId);
        const keptTemplateSlugs = data.templates.map((t) => t.slug);

        for (const t of data.templates) {
            let templateRow = this.templates.find((row) => row.repoId === repoId && row.slug === t.slug);
            if (!templateRow) {
                templateRow = {
                    id: this.nextId("template"),
                    repoId,
                    slug: t.slug,
                    name: t.name,
                    description: t.description,
                    category: t.category,
                    iconDataUri: t.iconDataUri,
                };
                this.templates.push(templateRow);
            } else {
                templateRow.name = t.name;
                templateRow.description = t.description;
                templateRow.category = t.category;
                templateRow.iconDataUri = t.iconDataUri;
            }

            const keptVariantSlugs = t.variants.map((v) => v.slug);
            for (const v of t.variants) {
                let variantRow = this.variants.find((row) => row.templateId === templateRow!.id && row.slug === v.slug);
                if (!variantRow) {
                    variantRow = {
                        id: this.nextId("variant"),
                        templateId: templateRow.id,
                        slug: v.slug,
                        name: v.name,
                        description: v.description,
                        usage: v.usage,
                        composeContent: v.composeContent,
                        envContent: v.envContent,
                        contentHash: v.contentHash,
                    };
                    this.variants.push(variantRow);
                } else {
                    Object.assign(variantRow, {
                        name: v.name,
                        description: v.description,
                        usage: v.usage,
                        composeContent: v.composeContent,
                        envContent: v.envContent,
                        contentHash: v.contentHash,
                    });
                }
            }
            this.variants = this.variants.filter(
                (row) => row.templateId !== templateRow!.id || keptVariantSlugs.includes(row.slug),
            );
        }

        this.templates = this.templates.filter((row) => row.repoId !== repoId || keptTemplateSlugs.includes(row.slug));
        const remainingTemplateIds = new Set(this.templates.map((t) => t.id));
        this.variants = this.variants.filter((v) => remainingTemplateIds.has(v.templateId));

        repo.lastSyncAttemptAt = data.at;
        repo.lastSyncedAt = data.at;
        repo.lastSyncError = null;
        repo.headCommitSha = data.headCommitSha;
        repo.syncIssues = JSON.stringify(data.issues);
    }

    async recordSyncFailure(repoId: string, message: string, at: Date): Promise<void> {
        const repo = await this.findRepoByIdOrThrow(repoId);
        repo.lastSyncAttemptAt = at;
        repo.lastSyncError = message;
    }

    async listTemplateIndex() {
        return this.templates.map((t) => {
            const repo = this.repos.find((r) => r.id === t.repoId)!;
            const variants = this.variants
                .filter((v) => v.templateId === t.id)
                .map((v) => ({id: v.id, slug: v.slug, name: v.name, description: v.description}));
            return {...t, repo: {id: repo.id, url: repo.url}, variants};
        });
    }

    async findVariantByIdOrThrow(variantId: string) {
        const variant = this.variants.find((v) => v.id === variantId);
        if (!variant) throw new NotFoundError(`Template variant "${variantId}" not found`);
        const template = this.templates.find((t) => t.id === variant.templateId)!;
        const repo = this.repos.find((r) => r.id === template.repoId)!;
        return {...variant, template: {...template, repo}};
    }
}

function createMockGit() {
    return {syncCheckout: vi.fn()};
}

function createMockReader() {
    return {readCheckout: vi.fn()};
}

function createMockStacks() {
    return {createStack: vi.fn()};
}

function createMockConfig(url: string | null = OFFICIAL_URL) {
    return {
        defaultRepoUrl: vi.fn().mockReturnValue(url),
        cacheDir: vi.fn().mockReturnValue("/cache"),
    };
}

describe("TemplateService", () => {
    let repo: FakeTemplateRepository;
    let git: ReturnType<typeof createMockGit>;
    let reader: ReturnType<typeof createMockReader>;
    let stacks: ReturnType<typeof createMockStacks>;
    let config: ReturnType<typeof createMockConfig>;
    let service: TemplateService;

    beforeEach(() => {
        repo = new FakeTemplateRepository();
        git = createMockGit();
        reader = createMockReader();
        stacks = createMockStacks();
        config = createMockConfig();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        service = new TemplateService(repo as any, git as any, reader as any, stacks as any, config as any);
    });

    describe("listTemplates", () => {
        it("first sync seeds the default repo, calls git.syncCheckout once with <cacheDir>/<repoId>, persists the reader's templates, and returns the catalog", async () => {
            git.syncCheckout.mockResolvedValue({headCommitSha: "abc123", mode: "cloned"});
            reader.readCheckout.mockResolvedValue({
                templates: [
                    {
                        slug: "nextcloud",
                        name: "Nextcloud",
                        description: "A file sync server",
                        category: "productivity",
                        iconDataUri: null,
                        variants: [
                            {
                                slug: "default",
                                name: "Default",
                                description: "Nextcloud with SQLite",
                                usage: null,
                                composeContent: "services: {}",
                                envContent: null,
                                contentHash: "hash1",
                            },
                        ],
                    },
                ],
                issues: [],
            });

            const catalog = await service.listTemplates();

            expect(repo.repos).toHaveLength(1);
            expect(repo.repos[0]!.isDefault).toBe(true);
            expect(repo.repos[0]!.url).toBe(OFFICIAL_URL);

            expect(git.syncCheckout).toHaveBeenCalledTimes(1);
            expect(git.syncCheckout).toHaveBeenCalledWith(OFFICIAL_URL, path.join("/cache", repo.repos[0]!.id));

            expect(catalog.repos).toHaveLength(1);
            expect(catalog.repos[0]!.lastSyncedAt).not.toBeNull();
            expect(catalog.repos[0]!.lastSyncError).toBeNull();

            expect(catalog.templates).toHaveLength(1);
            expect(catalog.templates[0]!.slug).toBe("nextcloud");
            expect(catalog.templates[0]!.variants).toHaveLength(1);
            expect(catalog.templates[0]!.variants[0]!.slug).toBe("default");
        });

        it("does not sync again on a second call (lastSyncAttemptAt already set)", async () => {
            git.syncCheckout.mockResolvedValue({headCommitSha: "abc", mode: "cloned"});
            reader.readCheckout.mockResolvedValue({templates: [], issues: []});

            await service.listTemplates();
            await service.listTemplates();

            expect(git.syncCheckout).toHaveBeenCalledTimes(1);
        });

        it("records a sync failure without throwing — listTemplates still resolves", async () => {
            git.syncCheckout.mockRejectedValue(new Error("clone failed: network unreachable"));

            const catalog = await service.listTemplates();

            expect(catalog.repos).toHaveLength(1);
            expect(catalog.repos[0]!.lastSyncError).toBe("clone failed: network unreachable");
            expect(catalog.repos[0]!.lastSyncedAt).toBeNull();
            expect(catalog.templates).toHaveLength(0);
        });

        it("surfaces reader issues on the repo view", async () => {
            git.syncCheckout.mockResolvedValue({headCommitSha: "abc", mode: "cloned"});
            reader.readCheckout.mockResolvedValue({
                templates: [],
                issues: [{path: "templates/bad", message: "template.yml missing"}],
            });

            const catalog = await service.listTemplates();

            expect(catalog.repos[0]!.issues).toEqual([{path: "templates/bad", message: "template.yml missing"}]);
        });

        it("creates no repo row when defaultRepoUrl() returns null", async () => {
            config.defaultRepoUrl.mockReturnValue(null);

            const catalog = await service.listTemplates();

            expect(repo.repos).toHaveLength(0);
            expect(catalog.repos).toHaveLength(0);
            expect(catalog.templates).toHaveLength(0);
            expect(git.syncCheckout).not.toHaveBeenCalled();
        });

        it("re-syncing with one template renamed away and one variant added keeps the surviving template's id, removes the vanished one, and adds the new variant", async () => {
            git.syncCheckout.mockResolvedValue({headCommitSha: "sha1", mode: "cloned"});
            reader.readCheckout.mockResolvedValue({
                templates: [
                    {
                        slug: "nextcloud",
                        name: "Nextcloud",
                        description: "d",
                        category: "c",
                        iconDataUri: null,
                        variants: [
                            {slug: "default", name: "Default", description: "d", usage: null, composeContent: "a", envContent: null, contentHash: "h1"},
                        ],
                    },
                    {
                        slug: "vaultwarden",
                        name: "Vaultwarden",
                        description: "d",
                        category: "c",
                        iconDataUri: null,
                        variants: [
                            {slug: "default", name: "Default", description: "d", usage: null, composeContent: "a", envContent: null, contentHash: "h2"},
                        ],
                    },
                ],
                issues: [],
            });

            const first = await service.listTemplates();
            const nextcloudId = first.templates.find((t) => t.slug === "nextcloud")!.id;
            const repoId = first.repos[0]!.id;

            // Second sync: vaultwarden is gone, nextcloud gains a new variant.
            reader.readCheckout.mockResolvedValue({
                templates: [
                    {
                        slug: "nextcloud",
                        name: "Nextcloud",
                        description: "d",
                        category: "c",
                        iconDataUri: null,
                        variants: [
                            {slug: "default", name: "Default", description: "d", usage: null, composeContent: "a", envContent: null, contentHash: "h1"},
                            {slug: "with-redis", name: "With Redis", description: "d", usage: null, composeContent: "b", envContent: null, contentHash: "h3"},
                        ],
                    },
                ],
                issues: [],
            });

            await service.syncRepo(repoId);
            const catalog = await service.listTemplates();

            expect(catalog.templates.map((t) => t.slug)).toEqual(["nextcloud"]);
            expect(catalog.templates[0]!.id).toBe(nextcloudId);
            expect(catalog.templates[0]!.variants.map((v) => v.slug).sort()).toEqual(["default", "with-redis"]);
        });
    });

    describe("syncRepo", () => {
        it("throws NotFoundError for an unknown repo id", async () => {
            await expect(service.syncRepo("does-not-exist")).rejects.toThrow(NotFoundError);
        });
    });

    /** Seeds a repo/template/variant directly into the fake, bypassing a real sync. */
    function seedVariant(): {repoId: string; variantId: string} {
        repo.repos.push({
            id: "repo-seed",
            url: OFFICIAL_URL,
            isDefault: true,
            headCommitSha: "sha-seed",
            lastSyncAttemptAt: new Date(),
            lastSyncedAt: new Date(),
            lastSyncError: null,
            syncIssues: "[]",
        });
        repo.templates.push({
            id: "template-seed",
            repoId: "repo-seed",
            slug: "nextcloud",
            name: "Nextcloud",
            description: "d",
            category: "c",
            iconDataUri: null,
        });
        repo.variants.push({
            id: "variant-seed",
            templateId: "template-seed",
            slug: "default",
            name: "Default",
            description: "d",
            usage: "run it",
            composeContent: "services: {}",
            envContent: null,
            contentHash: "hash-seed",
        });
        return {repoId: "repo-seed", variantId: "variant-seed"};
    }

    describe("getVariant", () => {
        it("returns the full variant detail including compose/env content, usage, template and repo info", async () => {
            const {variantId} = seedVariant();

            const view = await service.getVariant(variantId);

            expect(view.composeContent).toBe("services: {}");
            expect(view.usage).toBe("run it");
            expect(view.template.slug).toBe("nextcloud");
            expect(view.repo.url).toBe(OFFICIAL_URL);
        });

        it("throws NotFoundError for an unknown variant id", async () => {
            await expect(service.getVariant("does-not-exist")).rejects.toThrow(NotFoundError);
        });
    });

    describe("createStackFromVariant", () => {
        it("calls stacks.createStack with the user's input unchanged plus the template pin", async () => {
            const {variantId} = seedVariant();
            stacks.createStack.mockResolvedValue({id: "my-nextcloud"});

            const input = {displayName: "My Nextcloud", composeContent: "services: {}"};
            const result = await service.createStackFromVariant(variantId, input);

            expect(result).toEqual({id: "my-nextcloud"});
            expect(stacks.createStack).toHaveBeenCalledWith(input, {
                templatePin: {
                    repoUrl: OFFICIAL_URL,
                    path: "nextcloud/default",
                    commitSha: "sha-seed",
                    contentHash: "hash-seed",
                },
            });
        });

        it("propagates a ConfirmationRequiredError from createStack unchanged", async () => {
            const {variantId} = seedVariant();
            stacks.createStack.mockRejectedValue(new ConfirmationRequiredError());

            await expect(
                service.createStackFromVariant(variantId, {displayName: "x", composeContent: "services: {}"}),
            ).rejects.toThrow(ConfirmationRequiredError);
        });

        it("throws NotFoundError for an unknown variant id", async () => {
            await expect(
                service.createStackFromVariant("does-not-exist", {displayName: "x", composeContent: "services: {}"}),
            ).rejects.toThrow(NotFoundError);
        });
    });

    describe("syncStaleRepos", () => {
        it("ensures the default repo and syncs only repos never attempted or older than maxAgeMs", async () => {
            git.syncCheckout.mockResolvedValue({headCommitSha: "sha", mode: "cloned"});
            reader.readCheckout.mockResolvedValue({templates: [], issues: []});

            const now = new Date("2026-01-01T00:00:00Z");
            const fresh = await repo.ensureRepo("https://example.invalid/fresh.git");
            fresh.lastSyncAttemptAt = new Date(now.getTime() - 1_000); // 1s ago: not stale
            const stale = await repo.ensureRepo("https://example.invalid/stale.git");
            stale.lastSyncAttemptAt = new Date(now.getTime() - 100_000); // 100s ago: stale

            await service.syncStaleRepos(60_000, now);

            // Official default repo (never attempted) + the stale repo both sync;
            // the fresh repo does not.
            expect(git.syncCheckout).toHaveBeenCalledTimes(2);
            const syncedUrls = git.syncCheckout.mock.calls.map((call) => call[0]);
            expect(syncedUrls).toContain(stale.url);
            expect(syncedUrls).not.toContain(fresh.url);
        });

        it("one repo's sync failure never prevents the next repo from being synced", async () => {
            const now = new Date("2026-01-01T00:00:00Z");
            config.defaultRepoUrl.mockReturnValue(null); // isolate to the two manually-seeded repos
            const repoA = await repo.ensureRepo("https://example.invalid/a.git");
            const repoB = await repo.ensureRepo("https://example.invalid/b.git");

            git.syncCheckout.mockImplementation(async (url: string) => {
                if (url === repoA.url) throw new Error("boom");
                return {headCommitSha: "sha", mode: "cloned" as const};
            });
            reader.readCheckout.mockResolvedValue({templates: [], issues: []});

            await service.syncStaleRepos(60_000, now);

            const refreshedA = await repo.findRepoByIdOrThrow(repoA.id);
            const refreshedB = await repo.findRepoByIdOrThrow(repoB.id);
            expect(refreshedA.lastSyncError).toBe("boom");
            expect(refreshedB.lastSyncedAt).not.toBeNull();
        });
    });
});
