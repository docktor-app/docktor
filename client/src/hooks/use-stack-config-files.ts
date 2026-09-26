import {useCallback, useEffect, useRef, useState} from "react";
import {toast} from "sonner";
import {getComposeContent, getEnvContent, updateStack} from "@/lib/stacks-api";

export interface StackConfigFiles {
    readonly composeContent: string;
    readonly envContent: string;
    readonly composeDirty: boolean;
    readonly envDirty: boolean;
    readonly isDirty: boolean;
    setComposeContent(value: string): void;
    setEnvContent(value: string): void;
    saveCompose(): void;
    saveEnv(): void;
}

// Owns the Config tab's compose/env file state: loading, dirty-guarding
// (a background refresh must never clobber an unsaved edit — RESEARCH
// Pitfall 3), and saving through the existing PUT /api/stacks/:id endpoint.
export function useStackConfigFiles(
    stackId: string,
    lastKnownHash: string | null | undefined,
    onSaved: () => void,
): StackConfigFiles {
    const [composeContent, setComposeContentState] = useState("");
    const [envContent, setEnvContentState] = useState("");
    const [composeDirty, setComposeDirtyState] = useState(false);
    const [envDirty, setEnvDirtyState] = useState(false);

    // Kept in lockstep with the dirty state *synchronously*, everywhere a
    // dirty flag is set — a load response's `.then` callback is a microtask
    // that can run before React flushes a `useEffect`, so it must read a ref
    // updated at the same time as the state, not one synced via its own
    // effect (which would still be observing a stale value at that point).
    const composeDirtyRef = useRef(false);
    const envDirtyRef = useRef(false);

    const setComposeDirty = useCallback((dirty: boolean) => {
        composeDirtyRef.current = dirty;
        setComposeDirtyState(dirty);
    }, []);

    const setEnvDirty = useCallback((dirty: boolean) => {
        envDirtyRef.current = dirty;
        setEnvDirtyState(dirty);
    }, []);

    useEffect(() => {
        if (!stackId) return;
        let cancelled = false;

        // Only reload a file the user hasn't started editing — and even
        // then, discard the response if it arrives after the file became
        // dirty (a load in flight when the user starts typing).
        if (!composeDirty) {
            getComposeContent(stackId).then((r) => {
                if (cancelled || composeDirtyRef.current) return;
                setComposeContentState(r.content);
            });
        }
        if (!envDirty) {
            getEnvContent(stackId).then((r) => {
                if (cancelled || envDirtyRef.current) return;
                setEnvContentState(r.content);
            });
        }

        return () => {
            cancelled = true;
        };
    }, [stackId, lastKnownHash, composeDirty, envDirty]);

    const setComposeContent = useCallback(
        (value: string) => {
            setComposeContentState(value);
            setComposeDirty(true);
        },
        [setComposeDirty],
    );

    const setEnvContent = useCallback(
        (value: string) => {
            setEnvContentState(value);
            setEnvDirty(true);
        },
        [setEnvDirty],
    );

    const saveCompose = useCallback(() => {
        toast.promise(
            (async () => {
                await updateStack(stackId, {composeContent});
                setComposeDirty(false);
                onSaved();
            })(),
            {
                loading: "Saving compose file…",
                success: "Compose file saved",
                error: (err: unknown) => {
                    const message = err instanceof Error ? err.message : "Unknown error";
                    return `Couldn't save compose file — ${message}. Try again.`;
                },
            },
        );
    }, [stackId, composeContent, onSaved, setComposeDirty]);

    const saveEnv = useCallback(() => {
        toast.promise(
            (async () => {
                await updateStack(stackId, {envContent});
                setEnvDirty(false);
                onSaved();
            })(),
            {
                loading: "Saving environment variables…",
                success: "Environment variables saved",
                error: (err: unknown) => {
                    const message = err instanceof Error ? err.message : "Unknown error";
                    return `Couldn't save environment variables — ${message}. Try again.`;
                },
            },
        );
    }, [stackId, envContent, onSaved, setEnvDirty]);

    return {
        composeContent,
        envContent,
        composeDirty,
        envDirty,
        isDirty: composeDirty || envDirty,
        setComposeContent,
        setEnvContent,
        saveCompose,
        saveEnv,
    };
}
