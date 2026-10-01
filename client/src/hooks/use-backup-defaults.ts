import {useEffect, useState} from "react";
import {getBackupDefaults} from "@/lib/backups-api";

export interface UseBackupDefaultsResult {
    defaultSchedule: string | null;
    loading: boolean;
    error: string | null;
}

// Fetches the global backup-defaults schedule once on mount. The dashboard
// combines this with each stack's own `backupSchedule` (via
// computeDashboardStats) to count "Backups Configured" without an
// N+1 per-stack request (prohibition in 11-04-PLAN.md).
export function useBackupDefaults(): UseBackupDefaultsResult {
    const [defaultSchedule, setDefaultSchedule] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        getBackupDefaults()
            .then((defaults) => {
                if (cancelled) return;
                setDefaultSchedule(defaults.defaultSchedule);
                setLoading(false);
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : "Failed to fetch backup defaults");
                setDefaultSchedule(null);
                setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    return {defaultSchedule, loading, error};
}
