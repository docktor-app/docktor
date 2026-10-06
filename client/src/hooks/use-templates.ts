import {useCallback, useEffect, useState} from "react";
import {listTemplates, syncTemplateRepo, type TemplateCatalog} from "@/lib/templates-api";

type FetchMode = "initial" | "background";

export interface UseTemplatesResult {
    readonly catalog: TemplateCatalog | null;
    readonly loading: boolean;
    readonly error: string | null;
    readonly refetch: () => Promise<void>;
    readonly retryRepo: (repoId: string) => Promise<void>;
}

/**
 * Issue #19/D-07: loads the template catalog once on mount. `refetch()` (used
 * by the first-fetch-error "Retry" action and `retryRepo()` below) always
 * runs in background mode — it never flips `loading` back to true, mirroring
 * use-stack.ts's initial/background fetch-mode split.
 */
export function useTemplates(): UseTemplatesResult {
    const [catalog, setCatalog] = useState<TemplateCatalog | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchCatalog = useCallback(async (mode: FetchMode) => {
        if (mode === "initial") {
            setLoading(true);
            setError(null);
        }
        try {
            const data = await listTemplates();
            setCatalog(data);
            if (mode !== "initial") setError(null);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Failed to load templates";
            if (mode === "initial") {
                setError(message);
            } else {
                console.warn("Background template refresh failed", err);
            }
        } finally {
            if (mode === "initial") setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchCatalog("initial");
    }, [fetchCatalog]);

    const refetch = useCallback(() => fetchCatalog("background"), [fetchCatalog]);

    // Issue #19/UI-SPEC sync-error Retry: re-sync the one repo, then
    // background-refetch the whole catalog so the grid reflects the result.
    const retryRepo = useCallback(
        async (repoId: string) => {
            await syncTemplateRepo(repoId);
            await fetchCatalog("background");
        },
        [fetchCatalog],
    );

    return {catalog, loading, error, refetch, retryRepo};
}
