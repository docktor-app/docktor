import {useCallback, useEffect, useRef, useState} from "react";
import {getStackUptime, type StackUptime} from "@/lib/uptime-api";

type FetchMode = "initial" | "background";

export interface UseStackUptimeResult {
    readonly uptime: StackUptime | null;
    readonly loading: boolean;
    readonly error: string | null;
    readonly retry: () => void;
}

// One uptime request per stack. `stackStatus` is already SSE-driven by
// useStack, so a change in it is the refetch signal: no extra SSE subscription
// and no polling. A background refetch never re-enters loading, so the figures
// on screen stay put while the new ones arrive.
export function useStackUptime(stackId: string, stackStatus: string): UseStackUptimeResult {
    const [uptime, setUptime] = useState<StackUptime | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const previousStatus = useRef(stackStatus);
    // Only the latest request may write state, so a slow response for an old
    // status or stack can never overwrite a newer one.
    const latestRequest = useRef(0);

    const fetchUptime = useCallback(async (mode: FetchMode) => {
        const request = ++latestRequest.current;
        if (mode === "initial") {
            setLoading(true);
            setError(null);
        }
        try {
            const data = await getStackUptime(stackId);
            if (request !== latestRequest.current) return;
            setUptime(data);
            setError(null);
        } catch (err: unknown) {
            if (request !== latestRequest.current) return;
            if (mode === "initial") {
                setError(err instanceof Error ? err.message : "Failed to fetch uptime");
            } else {
                console.warn("Background uptime refresh failed", err);
            }
        } finally {
            // Any latest request ends loading, so a background refetch that
            // supersedes an in-flight initial load cannot leave it stuck.
            if (request === latestRequest.current) setLoading(false);
        }
    }, [stackId]);

    const retry = useCallback(() => {
        void fetchUptime("initial");
    }, [fetchUptime]);

    useEffect(() => {
        void fetchUptime("initial");
    }, [fetchUptime]);

    useEffect(() => {
        if (previousStatus.current === stackStatus) return;
        previousStatus.current = stackStatus;
        void fetchUptime("background");
    }, [stackStatus, fetchUptime]);

    return {uptime, loading, error, retry};
}
