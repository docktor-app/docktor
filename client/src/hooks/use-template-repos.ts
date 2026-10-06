import {useCallback, useEffect, useState} from "react";
import {addTemplateRepo, listTemplateRepos, syncTemplateRepo, type TemplateRepoStatus} from "@/lib/templates-api";

type FetchMode = "initial" | "background";

export interface UseTemplateReposResult {
    readonly repos: ReadonlyArray<TemplateRepoStatus>;
    readonly loading: boolean;
    readonly error: string | null;
    readonly syncingIds: ReadonlySet<string>;
    readonly addRepo: (url: string) => Promise<TemplateRepoStatus>;
    readonly syncRepo: (id: string) => Promise<void>;
    readonly refetch: () => Promise<void>;
}

/**
 * Issue #19: backs the Settings → Stacks "Template Repositories" card. Loads
 * every configured repo once on mount; addRepo()/syncRepo() each perform
 * their API call then background-refetch the list, mirroring
 * use-templates.ts's initial/background fetch-mode split so neither action
 * flips the card back into its loading skeleton.
 */
export function useTemplateRepos(): UseTemplateReposResult {
    const [repos, setRepos] = useState<ReadonlyArray<TemplateRepoStatus>>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [syncingIds, setSyncingIds] = useState<ReadonlySet<string>>(new Set());

    const fetchRepos = useCallback(async (mode: FetchMode) => {
        if (mode === "initial") {
            setLoading(true);
            setError(null);
        }
        try {
            const data = await listTemplateRepos();
            setRepos(data);
            if (mode !== "initial") setError(null);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Failed to load template repositories";
            if (mode === "initial") {
                setError(message);
            } else {
                console.warn("Background template repo refresh failed", err);
            }
        } finally {
            if (mode === "initial") setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchRepos("initial");
    }, [fetchRepos]);

    const refetch = useCallback(() => fetchRepos("background"), [fetchRepos]);

    const addRepo = useCallback(
        async (url: string) => {
            const created = await addTemplateRepo(url);
            await fetchRepos("background");
            return created;
        },
        [fetchRepos],
    );

    // Issue #19: per-row pending state — "Sync now" disables only the row
    // being synced, not the whole card, and never flips the card back into
    // its loading skeleton.
    const syncRepo = useCallback(
        async (id: string) => {
            setSyncingIds((prev) => new Set(prev).add(id));
            try {
                await syncTemplateRepo(id);
                await fetchRepos("background");
            } finally {
                setSyncingIds((prev) => {
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                });
            }
        },
        [fetchRepos],
    );

    return {repos, loading, error, syncingIds, addRepo, syncRepo, refetch};
}
