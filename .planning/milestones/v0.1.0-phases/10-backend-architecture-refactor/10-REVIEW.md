---
phase: 10-backend-architecture-refactor
reviewed: 2026-09-24T00:00:00Z
depth: standard
files_reviewed: 79
files_reviewed_list:
  - server/src/app.ts
  - server/src/application/backup-service.ts
  - server/src/application/certificate-service.ts
  - server/src/application/index.ts
  - server/src/application/log-service.ts
  - server/src/application/migration-service.ts
  - server/src/application/notification-service.ts
  - server/src/application/onboarding-service.ts
  - server/src/application/ports/backup-schedule-port.ts
  - server/src/application/ports/brownfield-scanner-port.ts
  - server/src/application/ports/certificate-filesystem-port.ts
  - server/src/application/ports/compose-analyzer-port.ts
  - server/src/application/ports/compose-rewriter-port.ts
  - server/src/application/ports/docker-executor-port.ts
  - server/src/application/ports/dockerode-client-port.ts
  - server/src/application/ports/event-bus-port.ts
  - server/src/application/ports/registry-client-port.ts
  - server/src/application/ports/restic-executor-port.ts
  - server/src/application/ports/smtp-client-port.ts
  - server/src/application/ports/stack-filesystem-port.ts
  - server/src/application/ports/volume-migrator-port.ts
  - server/src/application/proxy-service.ts
  - server/src/application/settings-service.ts
  - server/src/application/stack-service.ts
  - server/src/application/subscribers/notification-subscriber.ts
  - server/src/application/subscribers/register.ts
  - server/src/application/subscribers/stack-event-subscriber.ts
  - server/src/application/subscribers/state-broadcast-subscriber.ts
  - server/src/domain/backup-retention-policy.ts
  - server/src/domain/events.ts
  - server/src/domain/image-update-detection.ts
  - server/src/domain/proxy-idempotency.ts
  - server/src/infrastructure/brownfield-scanner.ts
  - server/src/infrastructure/certificate-filesystem.ts
  - server/src/infrastructure/compose-analyzer.ts
  - server/src/infrastructure/compose-rewriter.ts
  - server/src/infrastructure/docker-executor.ts
  - server/src/infrastructure/dockerode-client.ts
  - server/src/infrastructure/event-bus.ts
  - server/src/infrastructure/registry-client.ts
  - server/src/infrastructure/restic-executor.ts
  - server/src/infrastructure/smtp-client.ts
  - server/src/infrastructure/stack-filesystem.ts
  - server/src/infrastructure/volume-migrator.ts
  - server/src/jobs/backup-scheduler.ts
  - server/src/jobs/disk-checker.ts
  - server/src/jobs/file-watcher.ts
  - server/src/jobs/index.ts
  - server/src/jobs/job-registry.ts
  - server/src/jobs/job.ts
  - server/src/jobs/notification-watcher.ts
  - server/src/jobs/proxy-cert-poller.ts
  - server/src/jobs/state-poller.ts
  - server/src/jobs/update-checker.ts
  - server/src/repositories/index.ts
  - server/src/repositories/settings-repository.ts
  - server/src/repositories/stack-repository.ts
  - server/src/repositories/user-repository.ts
  - server/src/routes/backups.ts
  - server/src/routes/imports.ts
  - server/src/routes/notifications.ts
  - server/src/routes/settings.ts
  - server/src/routes/setup.ts
  - server/src/routes/stacks.ts
  - server/test/unit/application/backup-service.test.ts
  - server/test/unit/application/log-service.test.ts
  - server/test/unit/application/migration-service.test.ts
  - server/test/unit/application/notification-service.test.ts
  - server/test/unit/application/notification-subscriber.test.ts
  - server/test/unit/application/onboarding-service.test.ts
  - server/test/unit/application/settings-service.test.ts
  - server/test/unit/application/stack-event-subscriber.test.ts
  - server/test/unit/application/stack-service.test.ts
  - server/test/unit/application/state-broadcast-subscriber.test.ts
  - server/test/unit/application/subscriber-registration.test.ts
  - server/test/unit/architecture/layering.test.ts
  - server/test/unit/domain/backup-retention-policy.test.ts
  - server/test/unit/domain/image-update-detection.test.ts
  - server/test/unit/domain/proxy-idempotency.test.ts
  - server/test/unit/infrastructure/event-bus.test.ts
  - server/test/unit/infrastructure/smtp-client.test.ts
  - server/test/unit/jobs/backup-scheduler.test.ts
  - server/test/unit/jobs/disk-checker.test.ts
  - server/test/unit/jobs/file-watcher.test.ts
  - server/test/unit/jobs/index.test.ts
  - server/test/unit/jobs/job-registry.test.ts
  - server/test/unit/jobs/job.test.ts
  - server/test/unit/jobs/notification-watcher.test.ts
  - server/test/unit/jobs/proxy-cert-poller.test.ts
  - server/test/unit/jobs/update-checker.test.ts
  - server/test/unit/repositories/index.test.ts
findings:
  critical: 1
  warning: 3
  info: 0
  total: 4
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-09-24T00:00:00Z
**Depth:** standard
**Files Reviewed:** 79
**Status:** issues_found

## Summary

This phase is a large, well-documented layered-architecture refactor (ports/adapters, a domain-event bus, a job-lifecycle contract, an architecture fitness test). The overwhelming majority of the reviewed code is careful: prior security fixes are annotated in place (CR-01..CR-04, T-09-xx path-traversal/TOCTOU hardening), error handling is typed and consistent, and the layering rules are enforced by an actual test (`layering.test.ts`) rather than just documentation.

Despite that quality bar, one correctness defect stands out as a genuine BLOCKER because it silently defeats a user-facing feature with data-safety implications (off-site backup repository configuration), and three further issues degrade robustness/maintainability enough to warrant fixing.

## Critical Issues

### CR-01: Configured SFTP/S3 backup repository is silently ignored — restic always writes to a local directory inside the stack's own folder

**File:** `server/src/application/backup-service.ts:981-1002` (also exercised from `runBackup` line 236, `runRestoreProcess` line 405, and `getSnapshots` line 663)

**Issue:** `BackupService`'s private `buildEnv()` unconditionally overrides `RESTIC_REPOSITORY` to `path.resolve(stackPath, "backups")` whenever a `stackPath` is supplied:

```ts
private buildEnv(repoConfig: BackupRepoConfig, stackPath?: string): Record<string, string> {
    const base: Record<string, string> = {
        RESTIC_PASSWORD: repoConfig.password,
    }
    // Always use stack-local backup directory
    if (stackPath) {
        base.RESTIC_REPOSITORY = path.resolve(stackPath, "backups")
    } else {
        // Fallback to configured repo (shouldn't happen in production)
        ...sftp:/... or s3:/... branches...
    }
    return base
}
```

Every real call site (`runBackup`, `runRestoreProcess`, `getSnapshots`) always has a `stack.hostPath`, so the `else` branch (the one that actually honours `repoConfig.repoType === "sftp" | "s3"`) is dead code in production — confirmed by `buildEnv path construction` tests in `backup-service.test.ts` (lines 1241-1262), which only assert the local-path branch.

Meanwhile, the rest of the stack still fully implements SFTP/S3 configuration as a first-class, user-facing feature: `SettingsService.saveBackupRepositorySettings()` and `getMaskedBackupRepositorySettings()` persist/encrypt `sftpHost`/`sftpUser`/`sftpKey`/`s3Endpoint`/`s3Bucket`/`s3AccessKey`/`s3SecretKey`; `OnboardingService.handleWizardStep3()` collects these same fields during the first-run wizard; `BackupService.getBackupRepoConfig()` decrypts all of them on every call. None of that decrypted data is ever used to build the restic repository target — only `repoConfig.password` (`RESTIC_PASSWORD`) survives into the actual backup/restore/snapshot run.

Net effect: an operator who configures an SFTP or S3 backup repository (reasonably expecting off-host disaster-recovery protection) silently gets **zero off-site backups** — every backup, restore, and snapshot-listing operation runs against `<stackHostPath>/backups` on the same disk as the stack itself, with no error, warning, or indication anywhere that the configured destination was not used. This is a data-loss/disaster-recovery risk that a user cannot discover without inspecting server-side logs or source code (the log line at `backup-service.ts:238` does print the resolved local path, but nothing flags the mismatch against the configured `repoType`).

**Fix:** Either (a) make `BackupService.buildEnv()` respect `repoConfig.repoType` and route to the infrastructure `ResticExecutorPort.buildEnv()`/`buildRepoUrl()` (which already implements this correctly and is otherwise unused/dead), reserving the stack-local path only for `repoType === "local"`; or, if "always local" is now the deliberate product decision, remove the SFTP/S3 input fields from settings/wizard/schema entirely (or surface a clear "not currently supported" notice) so the UI stops promising a capability the backend does not deliver.

```ts
private buildEnv(repoConfig: BackupRepoConfig, stackPath?: string): Record<string, string> {
    if (repoConfig.repoType === "local" && stackPath) {
        return {RESTIC_PASSWORD: repoConfig.password, RESTIC_REPOSITORY: path.resolve(stackPath, "backups")};
    }
    return this.resticExecutor.buildEnv(repoConfig); // honours sftp/s3
}
```

## Warnings

### WR-01: `detectAbsolutePathVolumes()` path-containment check lacks a separator boundary — false-negative warnings for sibling directories sharing a prefix

**File:** `server/src/application/backup-service.ts:646`

**Issue:**

```ts
if (path.isAbsolute(resolvedSource) && !resolvedSource.startsWith(stackPath)) {
    warnings.push(`${serviceName}: ${source}`);
}
```

`resolvedSource.startsWith(stackPath)` treats any path that merely shares `stackPath` as a *string prefix* as being "inside" the stack directory. For example, if `stackPath` is `/data/stacks/myapp` and a compose file bind-mounts `/data/stacks/myapp-shared-secrets`, `startsWith` returns `true` even though that path is a sibling directory, not a descendant — so the "bind mount points outside the stack directory" warning is silently suppressed for exactly the kind of path that most needs it. The same file's own `MigrationService.assertWithin()` (`migration-service.ts:30-37`) and `CertificateFilesystem.resolveCertPath()` (`certificate-filesystem.ts:41-50`) both correctly guard against this with a trailing-separator check; this call site is the one place in the reviewed set that doesn't.

**Fix:**

```ts
const withSep = stackPath.endsWith(path.sep) ? stackPath : stackPath + path.sep;
if (path.isAbsolute(resolvedSource) && resolvedSource !== stackPath && !resolvedSource.startsWith(withSep)) {
    warnings.push(`${serviceName}: ${source}`);
}
```

### WR-02: `OnboardingService`'s production singleton constructs its own `StackRepository`/`SettingsRepository` instead of reusing the composition-root singletons

**File:** `server/src/application/onboarding-service.ts:300-311`

**Issue:** `repositories/index.ts`'s own header comment states the intended invariant: *"Single source of repository singletons for the whole composition root... No repository is constructed a second time in this file"* — and `repositories/index.test.ts` enforces reference-identity for every export of that barrel. `onboarding-service.ts`, however, imports the concrete classes directly and constructs brand-new instances at module scope, bypassing the barrel it otherwise partially uses (it does import `userRepository` as a singleton from `../repositories/index.js` on line 6):

```ts
const settingsRepository = new SettingsRepository();
const stackRepository = new StackRepository();

export const onboardingService = new OnboardingService(
    auth.api,
    settingsRepository,
    {encrypt},
    stackRepository,
    proxyService,
);
```

Contrast with `migration-service.ts`, which does this correctly via a default constructor parameter bound to the exported singleton (`private readonly stackRepo: StackRepository = stackRepository`, importing `stackRepository` from `repositories/stack-repository.js`). Because these particular repository classes hold no internal state today, this doesn't currently cause a data-consistency bug, but it is a real drift from the documented single-instance architecture (D-09) that the project's own test suite is specifically designed to catch for the barrel's exports — it just can't catch a consumer that skips the barrel. A future repository that gains any in-memory state (a cache, a connection pool, a lock table) would silently split state between this duplicate instance and the rest of the app.

**Fix:** Import and reuse the barrel singletons instead of constructing new instances:

```ts
import {userRepository, settingsRepository, stackRepository} from "../repositories/index.js";

export const onboardingService = new OnboardingService(
    auth.api,
    settingsRepository,
    {encrypt},
    stackRepository,
    proxyService,
);
```

### WR-03: Unguarded `JSON.parse()` on stored retention-policy JSON — inconsistent with the domain's own safe parser and an unhandled edge case

**File:** `server/src/application/backup-service.ts:772-774` (`getBackupConfig`) and `server/src/application/settings-service.ts:361-364` (`getBackupDefaults`)

**Issue:** Both methods parse a nullable JSON column/setting directly:

```ts
// backup-service.ts
const globalRetention = globalRetentionRaw ? (JSON.parse(globalRetentionRaw) as RetentionPolicy) : null;
const retention = stack.backupRetention ? (JSON.parse(stack.backupRetention) as RetentionPolicy) : null;

// settings-service.ts
defaultRetention: retentionRaw ? (JSON.parse(retentionRaw) as RetentionPolicy) : null,
```

Neither call is wrapped in a `try/catch`. This is the exact same nullable JSON-string-to-`RetentionPolicy` shape the domain layer's `parseRetentionPolicy()` (`domain/backup-retention-policy.ts`) was specifically extracted to handle safely — that function's doc comment explicitly says a malformed stored policy "must not be able to fail a backup run" and falls through to defaults on a parse error. `getBackupConfig()` and `getBackupDefaults()` don't share that protection: a row with malformed JSON in `Stack.backupRetention` or the `backup.defaultRetention` setting (e.g. from a partial write, manual DB edit, or a future bug elsewhere) throws an uncaught `SyntaxError` out of these methods, which the global Fastify error handler turns into a generic 500 for `GET /api/stacks/:id/backup-config` and `GET /api/settings/backup-defaults` — a viewer of the Backup settings page can no longer load it at all, for a stack that otherwise still runs fine (since `runBackup()`'s own retention lookup goes through the safe `parseRetentionPolicy()`).

**Fix:** Route both call sites through `parseRetentionPolicy()` (already imported in `backup-service.ts`; import it in `settings-service.ts` too) instead of a bare `JSON.parse`:

```ts
const retention = parseRetentionPolicy(stack.backupRetention);
const globalRetention = parseRetentionPolicy(globalRetentionRaw);
```

---

_Reviewed: 2026-09-24T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
