import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {getStackUptimes, type StackUptimes} from "@/lib/uptime-api";
import {useContainerEvents} from "@/hooks/use-container-events";
import type {StackListUptimes} from "@/components/domain/stack/stack-list";

type FetchMode = "initial" | "background";

/**
 * Batch uptime for the stack lists (D-16). The data is non-critical, so a
 * failure degrades silently to an empty map (every cell reads an em dash),
 * with no error state and no toast. It refreshes in the background only on
 * real status transitions, never on a timer.
 */
export function useStackUptimes(): StackListUptimes {
    const [data, setData] = useState<StackUptimes | null>(null);
    const [loading, setLoading] = useState(true);
    // Only the newest request may write state, so a slow response for an
    // older refetch can never overwrite a newer one.
    const latestRequest = useRef(0);

    const fetchUptimes = useCallback(async (mode: FetchMode) => {
        const requestId = ++latestRequest.current;
        if (mode === "initial") setLoading(true);
        try {
            const result = await getStackUptimes();
            if (requestId !== latestRequest.current) return;
            setData(result);
        } catch (err: unknown) {
            console.warn("Stack uptimes unavailable", err);
            if (requestId !== latestRequest.current) return;
            setData(null);
        } finally {
            if (requestId === latestRequest.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchUptimes("initial");
    }, [fetchUptimes]);

    useContainerEvents((event) => {
        const isTransition =
            event.type === "stack_status" ||
            (event.type === "container_state" && event.statusLog !== undefined);
        if (isTransition) void fetchUptimes("background");
    });

    return useMemo(
        () => ({
            byStackId: new Map(data?.stacks.map((entry) => [entry.stackId, entry.percent]) ?? []),
            windowDays: data?.windowDays ?? null,
            loading,
        }),
        [data, loading],
    );
}
