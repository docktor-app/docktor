import {useCallback, useEffect, useState} from "react";
import {listStacks, type StackWithServices} from "@/lib/stacks-api";
import {useContainerEvents} from "@/hooks/use-container-events";

type FetchMode = "initial" | "background";

export function useStacks() {
    const [stacks, setStacks] = useState<StackWithServices[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // A background refresh (SSE-triggered or refetch()) must never flip
    // `loading` back to true or clear the already-rendered list — only the
    // initial load drives the page's loading/error state, mirroring
    // use-stack.ts's fetchStack(mode) split.
    const fetchStacks = useCallback(async (mode: FetchMode) => {
        if (mode === "initial") {
            setLoading(true);
            setError(null);
        }
        try {
            const data = await listStacks();
            setStacks(data);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Failed to fetch stacks";
            if (mode === "initial") {
                setError(message);
            } else {
                console.warn("Background stacks refresh failed", err);
            }
        } finally {
            if (mode === "initial") {
                setLoading(false);
            }
        }
    }, []);

    const refetch = useCallback(() => {
        void fetchStacks("background");
    }, [fetchStacks]);

    useEffect(() => {
        void fetchStacks("initial");
    }, [fetchStacks]);

    useContainerEvents((event) => {
        if (event.type === "container_state") {
            setStacks(prev => prev.map(stack =>
                stack.id === event.stackId
                    ? {
                        ...stack,
                        status: event.stackStatus,
                        services: stack.services.map(s =>
                            s.serviceName === event.serviceName
                                ? {...s, containerState: event.containerState, healthStatus: event.healthStatus}
                                : s
                        ),
                    }
                    : stack
            ));
        } else if (event.type === "stack_status") {
            setStacks(prev => prev.map(stack =>
                stack.id === event.stackId
                    ? {...stack, status: event.stackStatus}
                    : stack
            ));
        } else if (event.type === "config_changed" || event.type === "config_error" || event.type === "update_available") {
            void fetchStacks("background");
        }
    });

    return {stacks, loading, error, refetch};
}
