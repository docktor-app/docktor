---
phase: 10-backend-architecture-refactor
plan: 12
subsystem: backend-architecture
tags: [event-bus, domain-events, pub-sub, notifications, vitest, tdd]

# Dependency graph
requires:
  - phase: 10-backend-architecture-refactor
    provides: "10-03's EventBusPort/InMemoryEventBus/domainEventBus and the DomainEventMap catalog; 10-11's subscriber-module convention and the bridge subscriber it left in place as the sole sanctioned broadcaster.publish caller"
provides:
  - "server/src/application/subscribers/notification-subscriber.ts — subscribeNotifications(bus, notificationService), composing NotificationService.notify() calls from five notification-intent domain events with byte-identical subject/message templates to the six direct call sites it replaces"
  - "BackupService and DiskChecker take EventBusPort instead of NotificationService; all six former direct notify() call sites (runBackup failure, runRestoreProcess start/complete/fail, abortBackup, DiskChecker's threshold check) now emit domain events"
  - "NotificationWatcher subscribes to the domain-event bus (stack.status_changed, stack.container_state_changed) instead of the live-state broadcaster; NotificationService's own notification-created publish moves onto the bus too — the last inline broadcaster.publish call in the server"
affects: [10-13, 10-14, 10-15]

# Actuals (#2632)
actuals:
  tokens: 17019
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Notification-composition subscriber pattern: subscribeNotifications() mirrors 10-11's subscribeStateBroadcast() shape (bus + narrow dependency in, disposer out) but composes a derived value (subject/message text) from the payload rather than doing a field-for-field passthrough — the first subscriber in this phase that transforms rather than translates"
    - "Defence-in-depth emit wrapping extended to notification-intent events: every one of the six emit call sites (5 in BackupService/DiskChecker, 1 in NotificationService) wraps `this.bus.emit(...)` in its own try/catch, matching 10-11's precedent for the status/config broadcasts (belt-and-suspenders alongside the bus's own per-subscriber isolation, not redundant with it)"

key-files:
  created:
    - server/src/application/subscribers/notification-subscriber.ts
    - server/test/unit/application/notification-subscriber.test.ts
  modified:
    - server/src/domain/events.ts
    - server/src/application/index.ts
    - server/src/application/backup-service.ts
    - server/src/application/notification-service.ts
    - server/src/jobs/disk-checker.ts
    - server/src/jobs/notification-watcher.ts
    - server/test/unit/application/backup-service.test.ts
    - server/test/unit/application/notification-service.test.ts
    - server/test/unit/jobs/disk-checker.test.ts
    - server/test/unit/jobs/notification-watcher.test.ts

key-decisions:
  - "BackupFailedEvent.repoType is optional, not required — runBackup's failure site resolves a repo config and can supply it, but abortBackup fires before restic work (and its BadRequestError path) makes a repo config necessarily available; the subscriber's message composition branches on repoType's presence to reproduce both prior templates ('(repo: X)' clause present vs. absent) byte-for-byte from one event, rather than splitting into two separate events for what the plan names as a single fact ('a backup failed')"
  - "DiskSpaceThresholdCrossedEvent carries raw facts (freeBytes/totalBytes as bigint, freePercent, a pre-formatted thresholdDescription string) rather than the pre-composed multi-line message — message composition (the free/total MB conversion and the 6-line join) moved from DiskChecker into the subscriber, consistent with 'subscribers compose, publishers state facts' from this plan's action text"
  - "All 6 new emit call sites got the same try/catch defence-in-depth wrapping 10-11 established for the status/config broadcasts, even though the plan's action text for Task 2 didn't explicitly mandate it — chosen for consistency with the established pattern and because it makes 'operation completes normally when the notification path rejects' a testable guarantee at the BackupService/DiskChecker/NotificationService boundary, not just provable one layer down inside the bus"
  - "NotificationWatcher's own two notificationService.notify() calls (ERROR, UNHEALTHY) are unchanged and remain direct calls — per the plan's own objective text, the watcher is one of the two 'halves' D-15 item 1 unifies (it already went through an indirection, a job subscribing to a broadcast); only its event *source* moves from the broadcaster to the bus in this plan, not its role as the notify() caller for those two categories"

patterns-established:
  - "Subscriber test convention when composing (not just translating): notification-subscriber.test.ts asserts the exact literal type/subject/message object per event (mirroring state-broadcast-subscriber.test.ts's per-event deep-equality cases from 10-11), plus a dedicated case for the optional-field-absent branch (disk event's missing stackId) and the two-independent-subscribers-on-one-event isolation case"

requirements-completed: ["D-04", "D-15", "D-16", "D-17"]

coverage:
  - id: D1
    description: "Five notification-intent domain events (backup.failed, restore.started/completed/failed, disk.threshold_crossed) added to the catalog; subscribeNotifications() composes NotificationService.notify() calls from them with byte-identical type/subject/message to the six direct call sites it replaces, the toggle decision staying inside NotificationService"
    requirement: "D-15"
    verification:
      - kind: unit
        ref: "server/test/unit/application/notification-subscriber.test.ts (10 tests: 2 backup.failed variants with/without repoType, restore.started/completed/failed, disk.threshold_crossed message composition, absent-stackId passthrough, non-propagating rejection, cross-subscriber isolation, disposer teardown)"
        status: pass
      - kind: other
        ref: "grep -cE 'getSetting|settings\\.' server/src/application/subscribers/notification-subscriber.ts -> 0 (no toggle lookup or settings access in the subscriber)"
        status: pass
    human_judgment: false
  - id: D2
    description: "BackupService's five call sites (runBackup failure, runRestoreProcess start/complete/fail, abortBackup) and DiskChecker's one call site emit domain events instead of calling notificationService.notify() directly; both files drop the notification-service dependency"
    requirement: "D-15"
    verification:
      - kind: unit
        ref: "server/test/unit/application/backup-service.test.ts (111 tests, incl. new emit-assertion and bus-emit-throws-completes-normally cases per site); server/test/unit/jobs/disk-checker.test.ts (10 tests, incl. new emit assertion and throws-completes-normally case)"
        status: pass
      - kind: other
        ref: "grep -cE 'notificationService\\.notify|notify\\(' server/src/application/backup-service.ts server/src/jobs/disk-checker.ts -> 0 for both; grep -n notificationService (constructor param) -> no match for either file"
        status: pass
    human_judgment: false
  - id: D3
    description: "Five previously-awaited notification call sites now emit synchronously and fire-and-forget — a mail-server outage can no longer delay or fail the backup/restore/disk-check operation that emits the event (D-17), proven per site"
    requirement: "D-17"
    verification:
      - kind: unit
        ref: "server/test/unit/application/backup-service.test.ts: 'completes normally when the bus emit throws' (runBackup), 'completes normally when the bus emit throws for every restore-lifecycle event' (runRestoreProcess), 'resolves normally even when the bus emit throws — a rejecting notification path can no longer propagate past abortBackup's finally' (abortBackup); server/test/unit/jobs/disk-checker.test.ts: 'completes normally when the bus emit throws'"
        status: pass
    human_judgment: false
  - id: D4
    description: "NotificationWatcher subscribes to the domain-event bus (stack.status_changed, stack.container_state_changed) instead of the live-state broadcaster, with every pre-existing de-duplication, timer-cancellation and recovery-reset assertion passing unedited; NotificationService's notification-created publish moves onto the bus, emitted after the record is created"
    requirement: "D-15"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/notification-watcher.test.ts (9 tests, all pre-existing expect() bodies unedited, new field-name and disposal cases added); server/test/unit/application/notification-service.test.ts (13 tests, incl. new emit-after-create ordering test and bus-emit-throws-completes-normally test)"
        status: pass
      - kind: other
        ref: "grep -rcE 'broadcaster' server/src/jobs/notification-watcher.ts server/src/application/notification-service.ts -> 0 for both; grep -rcE '\\.publish\\(' server/src/application/ server/src/jobs/ | grep -v ':0$' -> only subscribers/state-broadcast-subscriber.ts (the sanctioned bridge, 10-11) and update-checker.ts's dead triggerUpdate() method (documented exception, 10-11)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Full server unit suite and typecheck stay green after every task"
    requirement: "D-04"
    verification:
      - kind: unit
        ref: "yarn workspace @docktor/server test:unit -> 56 files, 986 passed + 2 todo; yarn typecheck -> 0 errors"
        status: pass
    human_judgment: false
  - id: D6
    description: "With a mail server configured and then made unreachable, a failed backup's own outcome/status transition/log stream are unaffected and the notification row is still written"
    verification: []
    human_judgment: true
    rationale: "Deferred by the plan's own <verification><human-check> to the phase gate in plan 10-15, not required per-plan. No automated end-to-end SMTP test exists in this repo (confirmed by 10-RESEARCH.md and repeated in 10-11's SUMMARY for the analogous SSE human-check) — recorded here so verify-work does not silently auto-pass an unverified live claim."

# Metrics
duration: ~1h (resumed after a session interruption; see Issues Encountered)
completed: 2026-09-24
status: complete
---

# Phase 10 Plan 12: Notification Side Effects onto the Domain-Event Bus Summary

**All six direct `notificationService.notify()` call sites in `BackupService` and `DiskChecker` now emit one of five notification-intent domain events instead, a new `notification-subscriber.ts` composes byte-identical notifications from them, and `NotificationWatcher`/`NotificationService`'s remaining broadcaster wiring moves onto the same bus — leaving the 10-11 bridge subscriber as the only sanctioned `broadcaster.publish` caller in the server.**

## Performance

- **Duration:** ~1h (this resumed session; the plan was originally started and interrupted by a session rate-limit during the reading/investigation phase with zero commits made — restarted from a clean worktree per the coordinator's instructions)
- **Completed:** 2026-09-24T09:12:51Z
- **Tasks:** 3
- **Files created:** 2
- **Files modified:** 10

## Accomplishments

- `server/src/domain/events.ts` gains five notification-intent events — `backup.failed`, `restore.started`, `restore.completed`, `restore.failed`, `disk.threshold_crossed` — named as facts, carrying only the data needed to compose their message (stack id/display name, repo type where resolved, snapshot id, error text, and for the disk event the raw free/total byte counts, free percentage, and a pre-formatted threshold-description clause).
- `server/src/application/subscribers/notification-subscriber.ts` — `subscribeNotifications(bus, notificationService)`, registering one subscription per event and composing `NotificationService.notify()` calls with the exact subject/message templates the six direct call sites used to build, verified per-event in a dedicated test. The toggle decision stays inside `NotificationService` exactly as before — the subscriber only composes and calls.
- `BackupService`'s five notify() call sites (runBackup's catch block, runRestoreProcess's start/success/failure paths, abortBackup) and `DiskChecker`'s one call site all replaced with `this.bus.emit(...)`, each wrapped in the same defence-in-depth try/catch 10-11 established for the status/config broadcasts. Both classes drop their `NotificationService`/`DiskCheckerNotificationService` constructor dependency entirely.
- `NotificationWatcher` repointed from `StateBroadcaster.subscribe()` onto `domainEventBus.subscribe()` — two subscriptions (`stack.status_changed`, `stack.container_state_changed`) replacing the one filtered broadcaster channel, with every pre-existing de-duplication/timer/recovery `expect()` body carried over unedited.
- `NotificationService`'s own inline `notification_created` broadcast moves onto the bus (`this.bus.emit("notification.created", ...)`) — the last inline `broadcaster.publish` call in the server outside the 10-11 bridge subscriber and update-checker.ts's already-documented dead method.
- `yarn typecheck` and `yarn workspace @docktor/server test:unit` (56 files, 986 passed + 2 todo, up from the pre-plan 981/2-todo baseline by 5 net new tests after accounting for one removed obsolete test) both exit zero after every task.

## Task Commits

Each task was committed atomically:

1. **Task 1: Notification-intent domain events and the notification subscriber** - `3928f85` (test)
2. **Task 2: Backup, restore and disk publishers emit instead of notifying** - `6d18713` (feat)
3. **Task 3: The notification watcher subscribes to the bus; notification-created moves onto it too** - `d0ab4db` (feat)

Task 1 carried `tdd="true"` — the notification-subscriber.ts module and its test were written together and the RED state (module/exports not yet existing) was implicit in creating both files in the same commit, matching this phase's established single-commit-per-TDD-task precedent from plans 10-01/10-03/10-11 (`workflow.tdd_mode` is not enabled for this project; RED evidence was confirmed by running the new test file against the pre-implementation state before writing `notification-subscriber.ts`'s body).

## Files Created/Modified

- `server/src/domain/events.ts` - Adds `BackupFailedEvent`, `RestoreStartedEvent`, `RestoreCompletedEvent`, `RestoreFailedEvent`, `DiskSpaceThresholdCrossedEvent` and their `DomainEventMap` entries; updates the file's own doc comment (the "two categories not here yet" note now names only the audit-trail category, since this plan closed the notification-intent one)
- `server/src/application/subscribers/notification-subscriber.ts` - New: `subscribeNotifications()`, the 5-event composition subscriber
- `server/test/unit/application/notification-subscriber.test.ts` - New: 10 test cases covering every `<behavior>` requirement in Task 1
- `server/src/application/index.ts` - Registers `subscribeNotifications(domainEventBus, notificationService)` alongside the 10-11 bridge, exporting `disposeNotificationSubscription`; `backupService`/`notificationService` construction updated for their new constructor signatures
- `server/src/application/backup-service.ts` - Drops the `NotificationService` import/constructor param; all five notify() sites become try/catch-wrapped `this.bus.emit(...)` calls at the same control-flow position
- `server/src/jobs/disk-checker.ts` - Drops `DiskCheckerNotificationService`; constructor's first param is now `bus: Pick<EventBusPort, "emit">`; `checkDiskUsage()` emits raw facts instead of composing and sending the message itself
- `server/src/jobs/notification-watcher.ts` - Constructor's `broadcaster` param -> `bus: Pick<EventBusPort, "subscribe">`; `attach()`/`detach()` manage two subscriptions instead of one; `handleStateEvent(event)` renamed `handleStatusChange(stackId, stackStatus)` taking the two values directly (no longer a `StateEvent` union to narrow)
- `server/src/application/notification-service.ts` - Constructor's `broadcaster: StateBroadcaster` param -> `bus: Pick<EventBusPort, "emit">`; the inline `notification_created` publish becomes a try/catch-wrapped `this.bus.emit("notification.created", ...)`
- `server/test/unit/application/backup-service.test.ts` - `createMockNotificationService()` removed; constructor call drops the arg; 5 `notificationService.notify` assertions migrated to `mockBus.emit` assertions; 4 new "completes normally when bus emit throws" cases added; obsolete "emits done even when the notification send rejects" test replaced with its inverse (now resolves, not rejects)
- `server/test/unit/jobs/disk-checker.test.ts` - `createMockNotificationService()` -> `createMockBus()`; assertions migrated to `bus.emit` with `"disk.threshold_crossed"`; 1 new throws-completes-normally case
- `server/test/unit/jobs/notification-watcher.test.ts` - `createMockBroadcaster()` removed in favor of a real `InMemoryEventBus`; an `emitContainerState()` helper replaces the captured-handler pattern; every pre-existing `expect()` body unedited; 2 new cases (field-name-differs via `stack.status_changed`, post-`stop()` disposal of both subscriptions)
- `server/test/unit/application/notification-service.test.ts` - `createMockBroadcaster()` -> `createMockBus()`; 3 new tests (emit assertion, emit-after-create ordering, throws-completes-normally)

## Decisions Made

### Before/after template table (plan's `<verification>` requirement — all five notification templates and their type values, byte-identical across the migration)

| Event | Notification type | Subject | Message |
|---|---|---|---|
| `backup.failed` (with `repoType`) | `backup_failure` | `Backup failed: {displayName ?? stackId}` | `Backup failed for stack "{displayName ?? stackId}" (repo: {repoType}). Error: {errorMessage}` |
| `backup.failed` (no `repoType`, abortBackup) | `backup_failure` | `Backup failed: {displayName ?? stackId}` | `Backup failed for stack "{displayName ?? stackId}". Error: {errorMessage}` |
| `restore.started` | `backup_failure` (reused) | `Restore started: {displayName ?? stackId}` | `Restore started for stack "{displayName ?? stackId}" from snapshot {snapshotId}` |
| `restore.completed` | `backup_failure` (reused) | `Restore completed: {displayName ?? stackId}` | `Restore completed successfully for stack "{displayName ?? stackId}" from snapshot {snapshotId}` |
| `restore.failed` | `backup_failure` (reused) | `Restore failed: {displayName ?? stackId}` | `Restore failed for stack "{displayName ?? stackId}". Snapshot: {snapshotId}. Error: {errorMessage}` |
| `disk.threshold_crossed` | `disk_warning` | `Disk space warning` (static) | 6-line: `Disk space warning on {monitorPath}` / blank / `Free space: {freeMB} MB ({freePercent}%) of {totalMB} MB total` / `Threshold crossed: {thresholdDescription}` / blank / `This notification will not repeat until disk space recovers above the threshold.` |

Every one of the six original call sites reused the `backup_failure` type value for backup **and** restore events (the restore-lifecycle events' reuse of `backup_failure` — not a new `restore` type — is carried across verbatim), so rows written before and after this plan render identically in the client's notification log. The `backup.failed` event's single payload shape (with `repoType` optional) reproduces both of the two prior message templates from one event, rather than splitting into two events for what the plan's action text names as a single fact ("a backup failed").

### Before/after control-flow context (plan's `<verification>` requirement — all six migrated call sites, proving nothing was reordered, merged, or moved out of a try/finally)

**1. `BackupService.runBackup()` catch block** — before:
```ts
await this.writeStackStatus(stack.id, {status: "ERROR"})
await this.notificationService.notify({type: "backup_failure", stackId: stack.id, subject: ..., message: ...})
// (end of catch; finally emits "done" and disposes the broadcaster)
```
— after:
```ts
await this.writeStackStatus(stack.id, {status: "ERROR"})
try {
    this.bus.emit("backup.failed", {stackId: stack.id, displayName: stack.displayName, repoType: repoConfig.repoType, errorMessage})
} catch (emitErr) {
    console.error("[BackupService] bus emit failed", emitErr)
}
// (end of catch; finally still emits "done" and disposes the broadcaster)
```

**2. `BackupService.runRestoreProcess()` — restore-started, before the outer try** — before:
```ts
// Send restore start notification
await this.notificationService.notify({type: "backup_failure", stackId: stack.id, subject: ..., message: ...})
try { /* restic work */ }
```
— after:
```ts
try {
    this.bus.emit("restore.started", {stackId: stack.id, displayName: stack.displayName, snapshotId})
} catch (emitErr) {
    console.error("[BackupService] bus emit failed", emitErr)
}
try { /* restic work, unchanged */ }
```

**3. `BackupService.runRestoreProcess()` — restore-completed, success path before `finalStatus = "COMPLETED"`** — before:
```ts
await this.notificationService.notify({type: "backup_failure", stackId: stack.id, subject: ..., message: ...})
finalStatus = "COMPLETED"
```
— after:
```ts
try {
    this.bus.emit("restore.completed", {stackId: stack.id, displayName: stack.displayName, snapshotId})
} catch (emitErr) {
    console.error("[BackupService] bus emit failed", emitErr)
}
finalStatus = "COMPLETED"
```

**4. `BackupService.runRestoreProcess()` — restore-failed, catch block before the restart attempt** — before:
```ts
await this.writeStackStatus(stack.id, {status: "ERROR"})
await this.notificationService.notify({type: "backup_failure", stackId: stack.id, subject: ..., message: ...})
// Attempt to restart containers even if restore failed partially
try { await this.docker.up(stack.id) } catch (restartErr) { ... }
```
— after:
```ts
await this.writeStackStatus(stack.id, {status: "ERROR"})
try {
    this.bus.emit("restore.failed", {stackId: stack.id, displayName: stack.displayName, snapshotId, errorMessage})
} catch (emitErr) {
    console.error("[BackupService] bus emit failed", emitErr)
}
// Attempt to restart containers even if restore failed partially — unchanged
try { await this.docker.up(stack.id) } catch (restartErr) { ... }
```

**5. `BackupService.abortBackup()` — inside the try, immediately before `finally`** — before:
```ts
await this.notificationService.notify({type: "backup_failure", stackId, subject: `Backup failed: ${displayName}`, message: `Backup failed for stack "${displayName}". Error: ${errorMessage}`})
} finally {
    getBackupBroadcaster(backupId)?.emit("done", "FAILED")
    disposeBackupBroadcaster(backupId)
}
```
— after:
```ts
try {
    this.bus.emit("backup.failed", {stackId, displayName, errorMessage})
} catch (emitErr) {
    console.error("[BackupService] bus emit failed", emitErr)
}
} finally {
    getBackupBroadcaster(backupId)?.emit("done", "FAILED")
    disposeBackupBroadcaster(backupId)
}
```
Note: `abortBackup`'s outer `try` has no `catch` clause (only `finally`) — before this plan, a rejecting `notify()` propagated past the method's own return (after `finally` ran). The new inner try/catch means the notification path itself can no longer be the source of such a propagation; other genuine failures (e.g. `backupRepo.update` rejecting) still propagate exactly as before.

**6. `DiskChecker.checkDiskUsage()` — inside the `triggered && !active` branch** — before:
```ts
await this.settings.setDiskAlertActive(true)
const freeMB = ...; const totalMB = ...; const thresholdKind = ...
const message = [...].join("\n")
await this.notificationService.notify({type: "disk_warning", subject: "Disk space warning", message})
```
— after:
```ts
await this.settings.setDiskAlertActive(true)
const thresholdDescription = belowPercent ? `below ${thresholdPercent}%` : `below ${...}GB`
try {
    this.bus.emit("disk.threshold_crossed", {monitorPath: this.monitorPath, freeBytes, totalBytes, freePercent, thresholdDescription})
} catch (emitErr) {
    console.error("[DiskChecker] bus emit failed", emitErr)
}
```
The `setDiskAlertActive(true)`/`else if (!triggered && lastAlert?.active) setDiskAlertActive(false)` bookkeeping is byte-identical in order and condition; only the message composition moved from `DiskChecker` into the subscriber (Task 1).

### The awaited-to-fire-and-forget timing change (plan's `<verification>` requirement, D-17)

Five of the six sites above (**all except `disk.threshold_crossed`**, which was never awaited — `DiskChecker.check()`'s outer try/catch already tolerated a rejecting `notify()` without stalling anything else) used to `await this.notificationService.notify(...)` directly:

1. `BackupService.runBackup()`'s failure notify — used to await the SMTP send before `runBackup()` could return, inside a `catch` block with no enclosing try/catch of its own.
2. `BackupService.runRestoreProcess()`'s restore-started notify — used to await the SMTP send *before any restic work began*, meaning a slow mail server used to delay the actual restore's start.
3. `BackupService.runRestoreProcess()`'s restore-completed notify — used to await the SMTP send after every restic/docker/DB step had already succeeded, delaying only the method's own return, not the restore's outcome.
4. `BackupService.runRestoreProcess()`'s restore-failed notify — used to await the SMTP send before the container-restart attempt that follows it, meaning a slow mail server used to delay the restart-after-failure recovery step.
5. `BackupService.abortBackup()`'s notify — used to await the SMTP send with **no enclosing catch** (only the method's own `finally`), so a rejecting notification propagated past `abortBackup()`'s own return, even though `finally` still ran the terminal `done` frame and broadcaster disposal first.

After this plan, all five `emit()` calls return synchronously and the notification subscriber (Task 1) notifies independently — the emitting operation no longer awaits or observes the notification's outcome. This is exactly the isolation D-17 asks for (a mail server being unreachable must not delay or fail a backup/restore), and it makes site 5 (`abortBackup`) strictly safer: a rejected notification can no longer propagate past its `finally` at all, closing the one call site whose pre-migration behavior actively depended on that propagation not mattering (it did — `abortBackup()`'s own doc comment already warned about this).

### Other decisions

- **`BackupFailedEvent.repoType` optional, not two separate events:** see `key-decisions` above — reproduces both of the two prior message shapes from one event.
- **Disk message composition moved to the subscriber:** `DiskChecker` now emits raw facts (`freeBytes`/`totalBytes` as `bigint`, `freePercent`, a pre-formatted `thresholdDescription`); the 6-line message join lives in `notification-subscriber.ts`.
- **Defence-in-depth try/catch on all 6 new emit sites:** extends 10-11's precedent (belt-and-suspenders alongside the bus's own per-subscriber isolation) even though the plan's Task 2/3 action text didn't explicitly mandate it for these specific sites — chosen for consistency and because it's what makes "completes normally when the notification path rejects" a provable guarantee one layer up from the bus itself.
- **`NotificationWatcher`'s own `notify()` calls stay direct:** per the plan's own framing, the watcher already went through an indirection (a job subscribing to a broadcast) before this plan — only its event source moved from the broadcaster to the bus; it remains the "subscriber" for the ERROR/UNHEALTHY categories, just as `notification-subscriber.ts` is the subscriber for the other five.
- **`stack.status_changed`/`stack.container_state_changed` field-name difference recorded (plan's own request):** `stack.status_changed`'s status field is named `status`; `stack.container_state_changed`'s is named `stackStatus`. This is the one field-name difference between the two events `NotificationWatcher` subscribes to — every other field name is unchanged from the pre-migration `StateEvent` shapes per 10-03's mirroring.

## Deviations from Plan

**1. [Rule 1 — comment text tripped a literal acceptance-criterion grep] Two doc comments referencing "notify()" as prose**

- **Found during:** Task 2, after implementation — running the plan's own acceptance-criterion grep (`grep -cE 'notificationService\.notify|notify\(' server/src/application/backup-service.ts server/src/jobs/disk-checker.ts`) printed `1` for each file, not `0`.
- **Issue:** Two new doc comments (one in `abortBackup()`, one in `checkDiskUsage()`) used the literal substring `notify() call` as prose to describe the *prior* behavior being replaced — a comment, not code, but the plan's grep is text-based and doesn't distinguish.
- **Fix:** Reworded both comments to say "the direct notification call" instead of "the notify() call" — no code or behavioral change, purely comment wording.
- **Files modified:** `server/src/application/backup-service.ts`, `server/src/jobs/disk-checker.ts`
- **Verification:** `grep -cE 'notificationService\.notify|notify\(' server/src/application/backup-service.ts server/src/jobs/disk-checker.ts` -> `0` for both, confirmed after the reword.
- **Committed in:** `6d18713` (Task 2 commit)

**2. [Rule 1 — pre-existing test fixture didn't match a written assertion] `runBackup()`'s fixture has no `displayName`**

- **Found during:** Task 2, first test run of the new `backup.failed` emit assertion.
- **Issue:** The `runBackup()` describe block's `stack` fixture (pre-existing, not owned by this plan) has no `displayName` field, so the payload's `displayName` is `undefined`, not a resolved name — the first version of the new test asserted a hardcoded `"My App"` (copied from a different describe block's fixture) and failed.
- **Fix:** Corrected the assertion to `displayName: undefined`, with a comment explaining the fixture doesn't carry a display name — matches actual, correct production behavior (`stack.displayName` is genuinely optional on this interface).
- **Files modified:** `server/test/unit/application/backup-service.test.ts`
- **Verification:** Test passes; confirmed the fixture intentionally omits `displayName` (not an oversight) by reading the full `runBackup()` describe block.
- **Committed in:** `6d18713` (Task 2 commit)

---

**Total deviations:** 2 (both Rule 1 — test/comment corrections found while proving the plan's own acceptance criteria; no code behavior changed by either)
**Impact on plan:** Zero. Both are wording/assertion corrections; every load-bearing acceptance criterion (zero direct notify() calls, zero notification-service constructor params, byte-identical templates, unawaited emits) holds exactly as the plan specifies.

## Issues Encountered

**Session interruption and restart:** This plan's execution was interrupted by a session rate-limit during the initial reading/investigation phase (~21 tool calls in, zero commits made, clean worktree). Restarted from scratch per the coordinator's explicit instructions: re-read the plan and all required context, then executed all three tasks in one continuous pass with no work lost (there was none to lose).

**Fresh-worktree setup:** `node_modules` was absent (`yarn install`, ~1m18s) and the Prisma client had never been generated (`yarn db:generate`) — the same pre-existing per-worktree prerequisite every plan since 10-02 has documented, not introduced by this plan.

**Worktree base was stale:** confirmed via `git merge-base --is-ancestor HEAD refs/heads/feature/phase-10-backend-refactoring` that this worktree's own HEAD (242e645) was an ancestor of the feature branch tip (06bef94, containing plans 10-01 through 10-11) with no divergent commits of its own — fast-forward-merged cleanly before starting, per this plan's own dispatch instructions.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 10-13 (the StackEvent audit trail, D-15 item 2) can follow this plan's and 10-11's exact subscriber-module convention — `subscribers/` now holds two precedents: a pure translator (`state-broadcast-subscriber.ts`) and a composer (`notification-subscriber.ts`).
- After this plan, `grep -rcE '\.publish\(' server/src/application/ server/src/jobs/` is non-zero for exactly two files: `subscribers/state-broadcast-subscriber.ts` (the sanctioned bridge) and `jobs/update-checker.ts` (the dead `triggerUpdate()` method, already named as a Plan 10-14 target in 10-11's own "Next Phase Readiness"). D-15 item 1 (notifications) and item 3 (status/config broadcasts, 10-11) are both now fully on the bus; only item 2 (the audit trail, 10-13) remains.
- No blockers. `yarn typecheck` and `yarn workspace @docktor/server test:unit` (56 files, 986 passed + 2 todo) both exit zero on the full tree after all three tasks.
- Integration tests (`server/test/integration/`, 6 files) were not run in this worktree — no PostgreSQL instance is available in this sandboxed environment, consistent with every prior plan's precedent in this phase.
- The plan's own `<verification><human-check>` (a real mail-server-down backup-failure run, confirming the backup's own outcome/status/log stream are unaffected and the notification row is still written) is deferred to the phase gate in plan 10-15, per the plan's own text — not performed in this session. Recorded as coverage item D6 (`human_judgment: true`) above so it surfaces at verify-work rather than being silently assumed proven.

---
*Phase: 10-backend-architecture-refactor*
*Completed: 2026-09-24*

## Self-Check: PASSED

All created/modified files confirmed present on disk (`server/src/application/subscribers/notification-subscriber.ts`,
`server/test/unit/application/notification-subscriber.test.ts`, `server/src/domain/events.ts`,
`server/src/application/backup-service.ts`, `server/src/jobs/disk-checker.ts`,
`server/src/jobs/notification-watcher.ts`, `server/src/application/notification-service.ts`, and this SUMMARY.md).
All 3 task commits (`3928f85`, `6d18713`, `d0ab4db`) confirmed present in `git log`.
`git rev-list --count 06bef94..HEAD` = 3 (before this SUMMARY commit), matching the 3 task commits with no
docs-only or uncommitted changes at self-check time.
