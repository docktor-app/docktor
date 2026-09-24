/**
 * Domain-event catalog (D-04, D-15, D-16). Pure types only — no I/O, no
 * imports from lib/, infrastructure/, repositories/, or jobs/. Each key in
 * DomainEventMap names something that already happened (past tense), not a
 * command; the bus (server/src/infrastructure/event-bus.ts) is generic over
 * this map so callers get the correct payload type inferred from the event
 * name.
 *
 * This catalog covers only events with an existing, grounded producer in
 * server/src/ today. Plan 10-13 closed the last outstanding category (the
 * StackEvent audit trail) by adding the two audit-only fields below to
 * StackConfigChangedEvent.
 */

/** A stack's status-machine transition completed. */
export interface StackStatusChangedEvent {
    stackId: string;
    status: string;
    previousStatus?: string;
    message?: string;
}

/** A container's runtime state changed (dockerode event stream / reconcile). */
export interface StackContainerStateChangedEvent {
    stackId: string;
    serviceName: string;
    containerState: string;
    healthStatus: string | null;
    stackStatus: string;
    statusLog?: {
        id: string;
        fromStatus: string | null;
        toStatus: string;
        message: string | null;
        createdAt: string;
    };
}

/** A stack's compose/env configuration changed, from either an app-initiated save or an external edit. */
export interface StackConfigChangedEvent {
    stackId: string;
    newHash: string;
    // Distinguishes an app-initiated save (always "app") from a genuine
    // external edit (FileWatcher's publish call sites, always "external") —
    // mirrors lib/state-broadcaster.ts's ConfigChangedEvent.source exactly
    // (G-08-2) so the client's "changed externally" toast gating carries
    // over unchanged.
    source: "app" | "external";
    // Audit-trail fields (D-15 item 2, plan 10-13). Both optional because
    // the in-app producer (StackService) has neither — only FileWatcher's
    // two external call sites populate them, so the audit subscriber can
    // reproduce their StackEvent payload string byte-for-byte. previousHash
    // is the hash the file had before this change (empty string if there
    // was none); changedFile names which of the two watched files changed.
    previousHash?: string;
    changedFile?: "compose" | "env";
}

/** A stack's compose/env configuration failed to parse. */
export interface StackConfigErrorEvent {
    stackId: string;
    message: string;
}

/** An image update was detected (or ruled out) for one of a stack's services. */
export interface StackUpdateAvailableEvent {
    stackId: string;
    imageRef: string;
    latestTag: string | null;
    hasUpdate: boolean;
}

/** A notification record was created and persisted. */
export interface NotificationCreatedEvent {
    notificationId: string;
}

/** A proxy TLS certificate's status changed (issuance, renewal, expiry approach, failure). */
export interface ProxyCertStatusChangedEvent {
    proxyConfigId: string;
    stackId: string;
    domain: string;
    // Matches @docktor/shared's certStatusSchema exactly — mirrors
    // lib/state-broadcaster.ts's ProxyCertStatusEvent.status.
    status: "pending" | "issued" | "failed" | "expiring";
    message?: string;
}

/**
 * A backup run failed (runBackup's catch path or abortBackup's early-abort
 * path — plan 10-12). `repoType` is present only when the failure happened
 * with a resolved repository config (runBackup); abortBackup fires before a
 * repo config is necessarily available, so it omits the field. The
 * subscriber composes a message with or without the "(repo: ...)" clause
 * accordingly, reproducing both of the two prior call sites' templates
 * exactly.
 */
export interface BackupFailedEvent {
    stackId: string;
    displayName?: string;
    repoType?: string;
    errorMessage: string;
}

/** A restore run began (runRestoreProcess, before any restic work starts). */
export interface RestoreStartedEvent {
    stackId: string;
    displayName?: string;
    snapshotId: string;
}

/** A restore run completed successfully (runRestoreProcess's success path). */
export interface RestoreCompletedEvent {
    stackId: string;
    displayName?: string;
    snapshotId: string;
}

/** A restore run failed (runRestoreProcess's catch path). */
export interface RestoreFailedEvent {
    stackId: string;
    displayName?: string;
    snapshotId: string;
    errorMessage: string;
}

/**
 * Free disk space on the monitored path crossed its configured threshold
 * (DiskChecker.checkDiskUsage). Carries the raw facts the prior call site's
 * multi-line message was built from — free/total sizes as exact byte
 * counts, the already-computed free percentage, and a pre-formatted
 * threshold-description clause ("below 10%" / "below 2GB") — so the
 * subscriber can reproduce that message byte-for-byte without re-deriving
 * which threshold (percent or bytes) was the one actually crossed.
 */
export interface DiskSpaceThresholdCrossedEvent {
    monitorPath: string;
    freeBytes: bigint;
    totalBytes: bigint;
    freePercent: number;
    thresholdDescription: string;
}

/**
 * The domain-event catalog: one key per event, mapped to its payload type.
 * The bus (EventBusPort) is generic over this map so emit()/subscribe()
 * infer the correct payload from the event name.
 */
export interface DomainEventMap {
    "stack.status_changed": StackStatusChangedEvent;
    "stack.container_state_changed": StackContainerStateChangedEvent;
    "stack.config_changed": StackConfigChangedEvent;
    "stack.config_error": StackConfigErrorEvent;
    "stack.update_available": StackUpdateAvailableEvent;
    "notification.created": NotificationCreatedEvent;
    "proxy.cert_status_changed": ProxyCertStatusChangedEvent;
    "backup.failed": BackupFailedEvent;
    "restore.started": RestoreStartedEvent;
    "restore.completed": RestoreCompletedEvent;
    "restore.failed": RestoreFailedEvent;
    "disk.threshold_crossed": DiskSpaceThresholdCrossedEvent;
}
