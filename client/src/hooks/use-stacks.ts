import {useCallback, useEffect, useRef, useState} from "react";
import {listStacks, type StackWithServices} from "@/lib/stacks-api";
import {useContainerEvents} from "@/hooks/use-container-events";

type FetchMode = "initial" | "background";

export function useStacks() {
    const [stacks, setStacks] = useState<StackWithServices[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // Last status seen per stack. Events can arrive faster than React re-renders,
    // so the "left BACKING_UP" check must not read the render-time `stacks` closure.
    const lastStatusRef = useRef(new Map<string, string>());

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
            lastStatusRef.current = new Map(data.map((stack) => [stack.id, stack.status]));
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

    // Records the latest status for a known stack and reports whether it just left BACKING_UP.
    const recordStatus = (stackId: string, status: string): boolean => {
        if (!lastStatusRef.current.has(stackId)) return false;
        const previous = lastStatusRef.current.get(stackId);
        lastStatusRef.current.set(stackId, status);
        return previous === "BACKING_UP" && status !== "BACKING_UP";
    };

    useContainerEvents((event) => {
        if (event.type === "container_state") {
            // A finished backup can flip hasBackup (D-04); container_state also
            // carries the stack status, so it can be the event that ends BACKING_UP.
            const leftBackingUp = recordStatus(event.stackId, event.stackStatus);
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
            if (leftBackingUp) {
                void fetchStacks("background");
            }
        } else if (event.type === "stack_status") {
            // Re-read the list when a stack leaves BACKING_UP instead of polling.
            const leftBackingUp = recordStatus(event.stackId, event.stackStatus);
            setStacks(prev => prev.map(stack =>
                stack.id === event.stackId
                    ? {...stack, status: event.stackStatus}
                    : stack
            ));
            if (leftBackingUp) {
                void fetchStacks("background");
            }
        } else if (event.type === "config_changed" || event.type === "config_error" || event.type === "update_available") {
            void fetchStacks("background");
        }
    });

    return {stacks, loading, error, refetch};
}
