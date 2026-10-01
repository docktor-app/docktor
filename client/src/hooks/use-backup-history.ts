import {useEffect, useRef, useState} from "react"

import {getBackups, type BackupRecord} from "@/lib/backups-api"

// Poll cadence while at least one backup is IN_PROGRESS.
export const BACKUP_HISTORY_POLL_INTERVAL_MS = 5000

export interface UseBackupHistoryResult {
    readonly backups: BackupRecord[]
    readonly loading: boolean
}

/**
 * Owns the fetch/poll lifecycle for a stack's backup history (G-10-2 fix).
 *
 * The effect below depends on `[stackId]` only: every schedule decision
 * (whether to poll again) is made from the freshly fetched response, never
 * from the `backups` state the effect itself writes. Reading `backups`
 * state in either the dependency array or the timer callback is exactly the
 * defect this hook replaces — getBackups() returns a brand-new array
 * reference on every response, so a dependency on `backups` would retrigger
 * the effect on every single fetch.
 *
 * There is no "grace window" after the last IN_PROGRESS backup completes:
 * polling starts only when a fetch actually finds one in progress, and
 * stops the instant a fetch no longer finds one — a stack whose backups are
 * all COMPLETED/FAILED costs exactly one request for as long as the tab
 * stays open.
 */
export function useBackupHistory(stackId: string, stackStatus?: string): UseBackupHistoryResult {
    const [backups, setBackups] = useState<BackupRecord[]>([])
    const [loading, setLoading] = useState(true)

    // Holds the current [stackId] effect run's own fetch function, so the
    // status-change effect below can trigger an immediate refresh without
    // duplicating any scheduling logic.
    const refreshRef = useRef<(() => Promise<void>) | null>(null)
    // Tracks the last {stackId, stackStatus} pair the status effect has
    // already reacted to, so it can tell an actual status change (refresh)
    // apart from a stackId change (already handled by the polling effect)
    // or a same-value re-render (nothing to do).
    const lastSeenRef = useRef({stackId, stackStatus})

    useEffect(() => {
        let cancelled = false
        let timeoutHandle: ReturnType<typeof setTimeout> | null = null

        setLoading(true)
        // Functional update returns the previous array when it is already
        // empty, so the first mount does not re-render needlessly.
        setBackups((prev) => (prev.length === 0 ? prev : []))

        function clearScheduled(): void {
            if (timeoutHandle) {
                clearTimeout(timeoutHandle)
                timeoutHandle = null
            }
        }

        async function fetchBackups(): Promise<void> {
            // A manual refresh (status-driven, below) can run while a poll is
            // already scheduled — always clear first so the two never race
            // into a double-scheduled timer.
            clearScheduled()

            try {
                const data = await getBackups(stackId)
                if (cancelled) return

                setBackups(data)

                if (data.some((b) => b.status === "IN_PROGRESS")) {
                    timeoutHandle = setTimeout(() => {
                        void fetchBackups()
                    }, BACKUP_HISTORY_POLL_INTERVAL_MS)
                }
            } catch {
                // Swallowed — keep showing the previously fetched list.
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        refreshRef.current = fetchBackups

        void fetchBackups()

        return () => {
            cancelled = true
            clearScheduled()
            refreshRef.current = null
        }
    }, [stackId])

    // A backup or restore started while the tab is open always moves the
    // stack through BACKING_UP/RESTORING and back — the page already
    // receives those transitions over its existing SSE subscription, so a
    // status change is the refresh signal. This keeps the history fresh
    // with no second EventSource and no open-ended polling (CLAUDE.md: do
    // not poll for state available via SSE).
    useEffect(() => {
        const last = lastSeenRef.current

        if (last.stackId !== stackId) {
            // The polling effect above already fetches for the new stack;
            // just record the new pair.
            lastSeenRef.current = {stackId, stackStatus}
            return
        }

        if (last.stackStatus !== stackStatus) {
            lastSeenRef.current = {stackId, stackStatus}
            void refreshRef.current?.()
        }
    }, [stackId, stackStatus])

    return {backups, loading}
}
