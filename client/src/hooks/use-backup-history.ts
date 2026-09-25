import {useEffect, useRef, useState} from "react"

import {getBackups, type BackupRecord} from "@/lib/backups-api"

// Poll cadence while the Backups tab is actively refreshing.
export const BACKUP_HISTORY_POLL_INTERVAL_MS = 3000
// How long after mount the tab keeps polling (even with nothing in
// progress) to catch a newly created backup.
export const BACKUP_HISTORY_GRACE_WINDOW_MS = 30_000

export interface UseBackupHistoryResult {
    readonly backups: BackupRecord[]
    readonly loading: boolean
}

/**
 * Owns the fetch/poll lifecycle for a stack's backup history.
 *
 * The polling effect below depends on `[stackId]` only (G-10-2's binding
 * fix): every schedule decision (whether to keep polling, whether the grace
 * window has elapsed) is made from plain local variables and the freshly
 * fetched response, never from the `backups` state the effect itself
 * writes. Reading `backups` state in either the dependency array or the
 * timer callbacks is exactly the defect this hook replaces — getBackups()
 * returns a brand-new array reference on every response, so a dependency on
 * `backups` retriggers the effect on every single fetch, producing an
 * unbounded request storm bound only by round-trip latency.
 */
export function useBackupHistory(stackId: string, stackStatus: string): UseBackupHistoryResult {
    const [backups, setBackups] = useState<BackupRecord[]>([])
    const [loading, setLoading] = useState(true)

    // Holds the current [stackId] effect run's own fetch function, so the
    // status-change effect below can trigger a refresh without duplicating
    // any scheduling logic — Task 1's after-fetch logic already re-arms the
    // interval when the result contains an IN_PROGRESS backup and stops it
    // once nothing is in progress past the grace window.
    const refreshRef = useRef<(() => Promise<void>) | null>(null)
    // Tracks the last {stackId, stackStatus} pair the status effect has
    // already reacted to, so it can tell an actual status change (refresh)
    // apart from a stackId change (already handled by the polling effect)
    // or a same-value re-render (nothing to do).
    const lastSeenRef = useRef({stackId, stackStatus})

    useEffect(() => {
        let cancelled = false
        let graceElapsed = false
        let latestHasInProgress = false
        let intervalHandle: ReturnType<typeof setInterval> | null = null
        let graceTimerHandle: ReturnType<typeof setTimeout> | null = null

        setLoading(true)
        // Functional update returns the previous array when it is already
        // empty, so the first mount does not re-render needlessly.
        setBackups((prev) => (prev.length === 0 ? prev : []))

        function stopInterval(): void {
            if (intervalHandle) {
                clearInterval(intervalHandle)
                intervalHandle = null
            }
        }

        function ensureIntervalRunning(): void {
            if (!intervalHandle) {
                intervalHandle = setInterval(() => {
                    void fetchBackups()
                }, BACKUP_HISTORY_POLL_INTERVAL_MS)
            }
        }

        async function fetchBackups(): Promise<void> {
            try {
                const data = await getBackups(stackId)
                if (cancelled) return

                setBackups(data)
                latestHasInProgress = data.some((b) => b.status === "IN_PROGRESS")

                if (latestHasInProgress) {
                    ensureIntervalRunning()
                } else if (graceElapsed) {
                    stopInterval()
                }
            } catch {
                // Swallowed — keep showing the previously fetched list.
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        refreshRef.current = fetchBackups

        void fetchBackups()
        ensureIntervalRunning()
        graceTimerHandle = setTimeout(() => {
            graceElapsed = true
            if (!latestHasInProgress) {
                stopInterval()
            }
        }, BACKUP_HISTORY_GRACE_WINDOW_MS)

        return () => {
            cancelled = true
            stopInterval()
            if (graceTimerHandle) clearTimeout(graceTimerHandle)
            refreshRef.current = null
        }
    }, [stackId])

    // A backup or restore started while the tab is open always moves the
    // stack through BACKING_UP/RESTORING and back — the page already
    // receives those transitions over its existing SSE subscription, so a
    // status change is the refresh signal. This keeps the history fresh
    // past the grace window with no second EventSource and no open-ended
    // polling (CLAUDE.md: do not poll for state available via SSE).
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
