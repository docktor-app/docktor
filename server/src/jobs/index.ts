import {jobRegistry} from "./job-registry.js"
import {statePoller} from "./state-poller.js"
import {fileWatcher} from "./file-watcher.js"
import {updateChecker} from "./update-checker.js"
import {diskChecker} from "./disk-checker.js"
import {notificationWatcher} from "./notification-watcher.js"
import {backupScheduler} from "./backup-scheduler.js"
import {proxyCertPoller} from "./proxy-cert-poller.js"

// Registered once, at module load, in the same order startJobs() used to
// call startJob() for each — the registry's startAll()/stopAll() preserve
// that order and give every job the per-job start/stop isolation that used
// to be seven duplicated try/catch calls here (D-02, D-14).
jobRegistry.register(statePoller)
jobRegistry.register(fileWatcher)
jobRegistry.register(updateChecker)
jobRegistry.register(diskChecker)
jobRegistry.register(notificationWatcher)
jobRegistry.register(backupScheduler)
jobRegistry.register(proxyCertPoller)

export async function startJobs(): Promise<void> {
    // Recovering orphaned in-progress backups stays an isolated pre-start
    // hook, not a registered Job (PD-7) — a health status of "running" or
    // "stopped" would be permanently meaningless for a one-shot startup
    // action with no ongoing lifecycle. A failure here (e.g. the DB isn't
    // reachable yet on a cold docker-compose start) must not prevent the
    // other jobs — or the HTTP server itself — from coming up.
    const {backupService} = await import("../application/index.js")
    try {
        await backupService.recoverInProgressBackups()
    } catch (err) {
        console.error("[Jobs] BackupRecovery failed to start:", err)
    }

    await jobRegistry.startAll()
}

export async function stopJobs(): Promise<void> {
    await jobRegistry.stopAll()
}
