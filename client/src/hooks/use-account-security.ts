import {useEffect, useSyncExternalStore} from "react";
import type {AccountSecurityStatus} from "@docktor/shared";

import {getAccountSecurity} from "@/lib/account-api";

export interface AccountSecurityState {
    status: AccountSecurityStatus | null;
    loading: boolean;
    error: string | null;
}

export interface AccountSecurityStore {
    getSnapshot(): AccountSecurityState;

    subscribe(listener: () => void): () => void;

    refresh(): Promise<void>;

    setStatus(status: AccountSecurityStatus): void;

    reset(): void;
}

const INITIAL_STATE: AccountSecurityState = {status: null, loading: true, error: null};

export function createAccountSecurityStore(
    fetchStatus: () => Promise<AccountSecurityStatus>,
): AccountSecurityStore {
    let state = INITIAL_STATE;
    let inFlight: Promise<void> | null = null;
    // Bumped by reset() so a response that was in flight at that moment is dropped.
    let generation = 0;
    const listeners = new Set<() => void>();

    // Snapshots are replaced, never mutated, so useSyncExternalStore sees every change.
    function publish(next: AccountSecurityState): void {
        state = next;
        listeners.forEach((listener) => listener());
    }

    async function load(startedIn: number): Promise<void> {
        try {
            const status = await fetchStatus();
            if (startedIn === generation) {
                publish({status, loading: false, error: null});
            }
        } catch (err: unknown) {
            if (startedIn === generation) {
                const error = err instanceof Error ? err.message : "Failed to load security settings";
                publish({status: null, loading: false, error});
            }
        } finally {
            if (startedIn === generation) {
                inFlight = null;
            }
        }
    }

    return {
        getSnapshot: () => state,
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        refresh() {
            if (inFlight) {
                return inFlight;
            }
            // A refetch with a known status stays on screen (no skeleton flash).
            publish({...state, loading: state.status === null, error: null});
            inFlight = load(generation);
            return inFlight;
        },
        setStatus(status) {
            publish({status, loading: false, error: null});
        },
        reset() {
            generation += 1;
            inFlight = null;
            publish(INITIAL_STATE);
        },
    };
}

// Shared on purpose: ProtectedRoute (15-06) and the Account page must agree on
// the enrollment state, so every consumer reads this one store.
export const accountSecurityStore = createAccountSecurityStore(getAccountSecurity);

export interface UseAccountSecurityOptions {
    /** False keeps the hook from fetching (no session yet). Defaults to true. */
    enabled?: boolean;
}

export interface UseAccountSecurityResult extends AccountSecurityState {
    refresh(): Promise<void>;

    setStatus(status: AccountSecurityStatus): void;
}

export function useAccountSecurity(options?: UseAccountSecurityOptions): UseAccountSecurityResult {
    const enabled = options?.enabled ?? true;
    const state = useSyncExternalStore(
        accountSecurityStore.subscribe,
        accountSecurityStore.getSnapshot,
    );

    useEffect(() => {
        if (enabled && accountSecurityStore.getSnapshot().status === null) {
            // refresh() shares the in-flight request with any other consumer.
            void accountSecurityStore.refresh();
        }
    }, [enabled]);

    return {...state, refresh: accountSecurityStore.refresh, setStatus: accountSecurityStore.setStatus};
}
