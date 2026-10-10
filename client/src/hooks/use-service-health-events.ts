import {useCallback, useEffect, useMemo, useState} from "react";
import {getServiceHealthEvents, type ServiceHealthEvent} from "@/lib/health-api";
import {groupHealthEventsByService} from "@/lib/health-format";
import {useContainerEvents} from "@/hooks/use-container-events";

type FetchMode = "initial" | "background";

export interface UseServiceHealthEventsResult {
    readonly eventsByService: ReadonlyMap<string, ServiceHealthEvent[]>;
    readonly loading: boolean;
    readonly error: string | null;
    readonly refetch: () => void;
}

// One request per stack (never per service). A container_state SSE frame for
// this stack triggers a background refetch that never re-enters the loading
// state, so rows already on screen stay put; nothing polls.
export function useServiceHealthEvents(stackId: string): UseServiceHealthEventsResult {
    const [events, setEvents] = useState<ServiceHealthEvent[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchEvents = useCallback(async (mode: FetchMode) => {
        if (mode === "initial") {
            setLoading(true);
            setError(null);
        }
        try {
            setEvents(await getServiceHealthEvents(stackId));
            setError(null);
        } catch (err: unknown) {
            if (mode === "initial") {
                setError(err instanceof Error ? err.message : "Failed to fetch health history");
            } else {
                console.warn("Background health history refresh failed", err);
            }
        } finally {
            if (mode === "initial") setLoading(false);
        }
    }, [stackId]);

    const refetch = useCallback(() => {
        void fetchEvents("initial");
    }, [fetchEvents]);

    useEffect(() => {
        void fetchEvents("initial");
    }, [fetchEvents]);

    useContainerEvents((event) => {
        if (event.type !== "container_state" || event.stackId !== stackId) return;
        void fetchEvents("background");
    });

    const eventsByService = useMemo(() => groupHealthEventsByService(events ?? []), [events]);

    return {eventsByService, loading, error, refetch};
}
