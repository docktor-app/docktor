import {useCallback, useEffect, useState} from "react";
import {getStorageOverview, type StorageOverview} from "@/lib/storage-api";

// No SSE subscription: the measurement is taken once a day by the server, so
// there is nothing live to follow.
export function useStorage() {
    const [overview, setOverview] = useState<StorageOverview | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setOverview(await getStorageOverview());
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to fetch disk usage");
        } finally {
            setLoading(false);
        }
    }, []);

    const retry = useCallback(() => {
        void load();
    }, [load]);

    useEffect(() => {
        void load();
    }, [load]);

    return {overview, loading, error, retry};
}
