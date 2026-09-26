import type {EventBusPort} from "../ports/event-bus-port.js";
import type {NotificationEvent} from "../notification-service.js";

/**
 * Narrow notify-only shape of NotificationService — this subscriber never
 * touches settings, SMTP, or the repository directly, so it depends on the
 * one method it calls, not the concrete class.
 */
export interface NotificationSubscriberNotificationService {
    notify(event: NotificationEvent): Promise<void>;
}

/**
 * Turns the five notification-intent domain events (D-15 item 1) into calls
 * to NotificationService.notify(), replacing the six direct call sites that
 * used to live in BackupService and DiskChecker. Every subject and message
 * template below is copied verbatim from the call site it replaces — see
 * the plan 10-12 summary's before/after table for the source of each.
 *
 * The toggle decision (whether a given notification type is enabled) is not
 * made here — it stays inside NotificationService.notify() where it always
 * was; this subscriber only composes and calls.
 *
 * Each handler returns the notify() promise (rather than firing it with
 * `void`) so the bus's own per-subscriber isolation (InMemoryEventBus.emit,
 * D-17) can catch a rejection via its `.catch()` on the returned promise —
 * a rejecting notify() never becomes an unhandled rejection and never
 * propagates back to whatever called `emit`.
 */
export function subscribeNotifications(
    bus: Pick<EventBusPort, "subscribe">,
    notificationService: NotificationSubscriberNotificationService,
): () => void {
    const unsubscribers: Array<() => void> = [];

    unsubscribers.push(
        bus.subscribe("backup.failed", (payload) => {
            const displayName = payload.displayName ?? payload.stackId;
            const message = payload.repoType
                ? `Backup failed for stack "${displayName}" (repo: ${payload.repoType}). Error: ${payload.errorMessage}`
                : `Backup failed for stack "${displayName}". Error: ${payload.errorMessage}`;
            return notificationService.notify({
                type: "backup_failure",
                stackId: payload.stackId,
                subject: `Backup failed: ${displayName}`,
                message,
            });
        }),
    );

    unsubscribers.push(
        bus.subscribe("restore.started", (payload) => {
            const displayName = payload.displayName ?? payload.stackId;
            return notificationService.notify({
                // Reuses the backup_failure type value, exactly as the direct
                // call it replaces did — persisted rows must render identically.
                type: "backup_failure",
                stackId: payload.stackId,
                subject: `Restore started: ${displayName}`,
                message: `Restore started for stack "${displayName}" from snapshot ${payload.snapshotId}`,
            });
        }),
    );

    unsubscribers.push(
        bus.subscribe("restore.completed", (payload) => {
            const displayName = payload.displayName ?? payload.stackId;
            return notificationService.notify({
                type: "backup_failure",
                stackId: payload.stackId,
                subject: `Restore completed: ${displayName}`,
                message: `Restore completed successfully for stack "${displayName}" from snapshot ${payload.snapshotId}`,
            });
        }),
    );

    unsubscribers.push(
        bus.subscribe("restore.failed", (payload) => {
            const displayName = payload.displayName ?? payload.stackId;
            return notificationService.notify({
                type: "backup_failure",
                stackId: payload.stackId,
                subject: `Restore failed: ${displayName}`,
                message: `Restore failed for stack "${displayName}". Snapshot: ${payload.snapshotId}. Error: ${payload.errorMessage}`,
            });
        }),
    );

    unsubscribers.push(
        bus.subscribe("disk.threshold_crossed", (payload) => {
            const freeMB = Number(payload.freeBytes / (1024n * 1024n));
            const totalMB = Number(payload.totalBytes / (1024n * 1024n));
            const message = [
                `Disk space warning on ${payload.monitorPath}`,
                ``,
                `Free space: ${freeMB} MB (${payload.freePercent}%) of ${totalMB} MB total`,
                `Threshold crossed: ${payload.thresholdDescription}`,
                ``,
                `This notification will not repeat until disk space recovers above the threshold.`,
            ].join("\n");
            return notificationService.notify({
                type: "disk_warning",
                subject: "Disk space warning",
                message,
            });
        }),
    );

    return () => {
        for (const unsubscribe of unsubscribers) {
            unsubscribe();
        }
    };
}
