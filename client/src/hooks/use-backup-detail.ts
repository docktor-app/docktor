import {useCallback, useEffect, useState} from "react";

import {getBackup, type BackupRecord} from "@/lib/backups-api";
import {useBackupStream, type BackupStreamStatus} from "@/hooks/use-backup-stream";

// Bounds the disconnected-case poll at five minutes: interval * max = 300s.
const BACKUP_RESYNC_POLL_INTERVAL_MS = 5000;
const BACKUP_RESYNC_MAX_POLLS = 60;

export interface UseBackupDetailResult {
    readonly backup: BackupRecord | null;
    readonly loading: boolean;
    readonly error: string | null;
    readonly displayLines: string[];
    readonly isStreaming: boolean;
    readonly isStillStreaming: boolean;
    readonly streamStatus: BackupStreamStatus;
}

/**
 * Owns the backup detail page's fetch/resync/poll lifecycle (moved from
 * [backupId].tsx unchanged in behavior — see backup-detail-page.test.tsx for
 * the regression net covering request counts, CR-01, and CR-03).
 */
export function useBackupDetail(backupId: string): UseBackupDetailResult {
    const [backup, setBackup] = useState<BackupRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const isStreaming = backup?.status === "IN_PROGRESS";
    const {lines: streamLines, status: streamStatus} = useBackupStream(
        backupId,
        isStreaming ?? false,
    );

    // A resync (stream reached a terminal state) must never disturb the
    // loading/error branches that swap out the whole mounted tree — only the
    // initial mount load may set them. Mirrors use-stack.ts's initial/background split.
    const loadBackup = useCallback(
        (mode: "initial" | "resync", isCancelled: () => boolean) => {
            if (mode === "initial") {
                setLoading(true);
                setError(null);
            }

            getBackup(backupId)
                .then((data) => {
                    if (isCancelled()) return;
                    setBackup(data);
                })
                .catch((err: unknown) => {
                    if (isCancelled()) return;
                    if (mode === "initial") {
                        setError(err instanceof Error ? err.message : "Failed to load backup");
                    } else {
                        console.warn("Background backup refresh failed", err);
                    }
                })
                .finally(() => {
                    if (isCancelled()) return;
                    if (mode === "initial") setLoading(false);
                });
        },
        [backupId],
    );

    useEffect(() => {
        let cancelled = false;
        loadBackup("initial", () => cancelled);
        return () => {
            cancelled = true;
        };
    }, [backupId, loadBackup]);

    // One-shot resync: fires when the stream reaches a real terminal verdict
    // (completed or failed) while a stream is active. Once the refetched record
    // is terminal, isStreaming goes false and this guard short-circuits — so
    // this cannot become a request loop against GET /api/backups/:id. The
    // "disconnected" case is handled by the poll effect below instead, so the
    // two effects can never both fetch for the same transition.
    useEffect(() => {
        if (!isStreaming || (streamStatus !== "completed" && streamStatus !== "failed")) return;

        let cancelled = false;
        loadBackup("resync", () => cancelled);
        return () => {
            cancelled = true;
        };
    }, [isStreaming, streamStatus, loadBackup]);

    // Bounded poll for the disconnected case: CR-01's answer to a dropped SSE
    // connection permanently freezing the page. Re-reads the record instead of
    // trusting anything the dropped connection implied, and terminates from
    // three independent directions: the record leaving IN_PROGRESS (isStreaming
    // flips false), the hook's reconnect succeeding (streamStatus returns to
    // "streaming"), or the hard BACKUP_RESYNC_MAX_POLLS ceiling.
    useEffect(() => {
        if (!isStreaming || streamStatus !== "disconnected") return;

        let cancelled = false;
        let pollCount = 0;
        loadBackup("resync", () => cancelled);

        const interval = setInterval(() => {
            pollCount += 1;
            if (pollCount >= BACKUP_RESYNC_MAX_POLLS) {
                clearInterval(interval);
                return;
            }
            loadBackup("resync", () => cancelled);
        }, BACKUP_RESYNC_POLL_INTERVAL_MS);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [isStreaming, streamStatus, loadBackup]);

    const displayLines = isStreaming ? streamLines : (backup?.logLines ?? []);
    const isStillStreaming = (isStreaming ?? false) && streamStatus === "streaming";

    return {
        backup,
        loading,
        error,
        displayLines,
        isStreaming: isStreaming ?? false,
        isStillStreaming,
        streamStatus,
    };
}
