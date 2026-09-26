/**
 * Port for the per-stack cron scheduling dependency (D-07). Declared here
 * rather than BackupService importing the concrete BackupScheduler job
 * class, so the service stays unit-testable with a plain fake and the
 * dependency arrow keeps pointing inward (application depends on a port,
 * not on jobs/). The exported `backupScheduler` facade in
 * jobs/backup-scheduler.ts declares that it implements this type — a
 * member removed from that facade becomes a compile error here rather
 * than a silent runtime gap.
 */
export interface BackupSchedulePort {
    /**
     * Creates or replaces the cron task for a stack's backup schedule.
     */
    upsert(stackId: string, cronExpr: string): void;

    /**
     * Stops and removes the cron task for a stack. No-op if none registered.
     */
    remove(stackId: string): void;
}
