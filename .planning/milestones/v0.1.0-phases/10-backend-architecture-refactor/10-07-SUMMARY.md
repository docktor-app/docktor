---
phase: 10-backend-architecture-refactor
plan: 07
subsystem: jobs
tags: [ddd, job-abstraction, registry, node-cron, health-tracking, vitest]

# Dependency graph
requires:
  - phase: 10-04
    provides: "server/src/jobs/job.ts (Job/JobKind/JobHealthReporter, IntervalJob/WatcherJob base classes) and server/src/jobs/job-registry.ts (JobRegistry singleton) — this plan's seven real jobs migrate onto them"
  - phase: 10-05
    provides: "server/src/application/ports/dockerode-client-port.ts, docker-executor-port.ts, registry-client-port.ts — this plan's constructor parameter types swap onto these"
provides:
  - "All seven background jobs (DiskChecker, UpdateChecker, ProxyCertPoller, StatePoller, FileWatcher, NotificationWatcher, BackupScheduler) satisfying the Job lifecycle contract from 10-04"
  - "server/src/jobs/index.ts rewritten as registration + jobRegistry.startAll()/stopAll() delegation, replacing seven duplicated try/catch calls"
  - "A layering.test.ts fitness rule (D-02, D-13) that fails if a future job file under jobs/ doesn't join the Job contract"
  - "Two-sided (start and stop) per-job failure isolation actually wired into the real startup/shutdown path, closing 10-RESEARCH.md Pitfall 4"
affects: []

# Actuals (#2632)
actuals:
  tokens: 10107
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Seven real jobs now share one of three shapes: IntervalJob (DiskChecker, UpdateChecker, ProxyCertPoller), WatcherJob (StatePoller, FileWatcher, NotificationWatcher), or implements Job directly for the one dynamic-schedule job (BackupScheduler, PD-6)"
    - "A job's lazily-constructed exported singleton (DiskChecker, NotificationWatcher, BackupScheduler — the three whose production dependencies need a lazy import to keep db.ts out of the unit-test module graph) is widened into a plain-object Job facade (name/kind/start/stop/setHealthReporter) rather than replaced with an eager instance; jobs whose production dependencies are already lazy internally (UpdateChecker, ProxyCertPoller) or need no lazy construction at all (StatePoller, FileWatcher) export a direct class instance that satisfies Job natively via the base class"
    - "jobs/index.ts registers all seven job facades with the jobRegistry singleton at module load, in the original start order, then startJobs()/stopJobs() are thin delegations to jobRegistry.startAll()/stopAll() plus the one hook (backup recovery) that stays outside the job set"

key-files:
  created: []
  modified:
    - server/src/jobs/disk-checker.ts
    - server/src/jobs/update-checker.ts
    - server/src/jobs/proxy-cert-poller.ts
    - server/src/jobs/state-poller.ts
    - server/src/jobs/file-watcher.ts
    - server/src/jobs/notification-watcher.ts
    - server/src/jobs/backup-scheduler.ts
    - server/src/jobs/index.ts
    - server/src/app.ts
    - server/test/unit/jobs/backup-scheduler.test.ts
    - server/test/unit/jobs/index.test.ts
    - server/test/unit/jobs/notification-watcher.test.ts
    - server/test/unit/architecture/layering.test.ts

key-decisions:
  - "DiskChecker keeps its own outer try/catch inside check() (producing the job-specific '[DiskChecker] check failed:' log line the existing test suite asserts verbatim) even though IntervalJob's runGuarded() would also catch the same error — check() is a public method independently tested by calling it directly, not just reached through run()/start()"
  - "UpdateChecker and ProxyCertPoller needed no Job-facade wrapper — both already export a direct class instance (export const x = new X()), and once the class extends IntervalJob/WatcherJob that instance satisfies Job natively; only DiskChecker, NotificationWatcher and BackupScheduler have a lazily-constructed exported wrapper and needed widening into a Job facade"
  - "BackupScheduler reports health at the scheduler level (recordRun/recordError keyed on this.name, not per-stack) inside runScheduledBackup()'s existing outer try/catch — a run is recorded once the tick has fired the initiateBackup() call (whether or not the unawaited fire-and-forget continuation later succeeds), an error only when initiateBackup() itself throws synchronously; this is the only honest reading of one last-run/last-error field shared across every stack's independent cron task (PD-6)"
  - "NotificationWatcher's reconcile() is implemented as a documented no-op body, not left undefined — it is genuinely unreachable (reconcileCronExpression is null, so WatcherJob never schedules a tick that could call it) but PD-6's rationale (a missed in-process broadcast has no queryable drift to reconcile against) needs to live somewhere a future reader will find it"
  - "app.ts's onClose hook changed from `stopJobs()` to `await stopJobs()` — the only call-site change stopJobs() becoming async required, since the hook body was already async"

patterns-established:
  - "The layering.test.ts fitness rule for jobs/ matches the class-declaration line with a line-anchored regex requiring 'extends IntervalJob', 'extends WatcherJob', or 'implements Job' — live-confirmed by temporarily adding a job file with a class joining no contract, observing the new test case fail, then reverting"

requirements-completed: ["D-02", "D-07", "D-12", "D-13", "D-14"]

coverage:
  - id: D1
    description: "DiskChecker, UpdateChecker and ProxyCertPoller extend IntervalJob, with every cron expression, threshold and tick body byte-identical to before (D-02, D-12, D-13)"
    requirement: "D-13"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/disk-checker.test.ts, update-checker.test.ts, proxy-cert-poller.test.ts (75 tests, all pre-existing assertions unedited)"
        status: pass
      - kind: other
        ref: "grep -cE '^export class (DiskChecker|UpdateChecker|ProxyCertPoller) extends IntervalJob' — 1 for each file; grep -cE 'cron\\.schedule\\(' — 0 for each file"
        status: pass
    human_judgment: false
  - id: D2
    description: "StatePoller, FileWatcher and NotificationWatcher extend WatcherJob; NotificationWatcher's reconcileCronExpression is null and schedules no cron task (D-02, D-13, PD-6)"
    requirement: "D-13"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/state-poller.test.ts, file-watcher.test.ts, notification-watcher.test.ts (59 tests + 2 todo, including a new case asserting no cron.schedule call)"
        status: pass
      - kind: other
        ref: "grep -cE '^export class (StatePoller|FileWatcher|NotificationWatcher) extends WatcherJob' — 1 for each file; grep -cE 'cron\\.schedule\\(' — 0 for each file"
        status: pass
    human_judgment: false
  - id: D3
    description: "BackupScheduler implements Job directly (kind: dynamic) with its per-stack task map, upsert()/remove() and cron-expression validation kept internal and unchanged; jobs/index.ts registers all seven jobs and delegates startJobs()/stopJobs() to jobRegistry.startAll()/stopAll(), with backup recovery as an isolated pre-start hook (D-02, D-14, PD-6, PD-7)"
    requirement: "D-14"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/backup-scheduler.test.ts (15 tests, 4 new for the Job contract/health reporting), server/test/unit/jobs/index.test.ts (5 tests, including a new case proving a throwing stop() does not block a later job's stop())"
        status: pass
      - kind: other
        ref: "grep -cE '^export class BackupScheduler implements Job' -> 1; grep -cE 'try \\{' server/src/jobs/index.ts -> 1; grep -cE 'jobRegistry\\.(startAll|stopAll)' server/src/jobs/index.ts -> 2"
        status: pass
    human_judgment: false
  - id: D4
    description: "A fitness-rule test case fails automatically if a future job file under jobs/ doesn't join the Job contract"
    requirement: "D-02"
    verification:
      - kind: unit
        ref: "server/test/unit/architecture/layering.test.ts 'every job under jobs/ joins the Job lifecycle contract (D-02, D-13, 10-07)' — 7/7 tests pass on the real tree; live-confirmed once locally by temporarily adding jobs/_fitness-rule-check.ts with a class joining no contract (test failed), then reverting"
        status: pass
    human_judgment: false
  - id: D5
    description: "Jobs depend on infrastructure through ports, not concrete classes (D-07)"
    requirement: "D-07"
    verification:
      - kind: other
        ref: "grep -nE '^\\s*import .*infrastructure/' server/src/jobs/update-checker.ts server/src/jobs/proxy-cert-poller.ts — only singleton values (dockerExecutor, registryClient, dockerodeClient) and the typed RegistryUnavailableError, no concrete class used as a dependency type"
        status: pass
      - kind: unit
        ref: "yarn typecheck exits zero with UpdateChecker/ProxyCertPoller/StatePoller constructors typed against DockerExecutorPort/RegistryClientPort/DockerodeClientPort"
        status: pass
    human_judgment: false
---

# Phase 10 Plan 07: Job Migration to Job Contract + Registry Summary

**All seven background jobs (DiskChecker, UpdateChecker, ProxyCertPoller, StatePoller, FileWatcher, NotificationWatcher, BackupScheduler) now satisfy the `Job` lifecycle contract from plan 10-04 — three IntervalJob, three WatcherJob, one dynamic-kind `implements Job` — and `jobs/index.ts`'s seven duplicated try/catch calls are replaced by `jobRegistry.startAll()`/`stopAll()`, closing the pre-existing shutdown-leak gap where a throwing `stop()` used to abort the remaining stops.**

## Performance

- **Duration:** ~35 min of active work (Task 1 at 15:17, Tasks 2–3 at 20:29 after a session rate-limit interruption and resume — wall-clock gap is not active work time)
- **Started:** 2026-09-23T15:17:26+02:00
- **Completed:** 2026-09-23T20:36:29+02:00
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments
- `DiskChecker`, `UpdateChecker`, `ProxyCertPoller` now `extends IntervalJob` — every cron expression (`"0 0 * * *"`, `"*/5 * * * *"`, `"*/60 * * * * *"`), threshold and tick body kept byte-identical; scheduling, the per-tick try/catch and health reporting now live only in the base class
- `StatePoller`, `FileWatcher`, `NotificationWatcher` now `extends WatcherJob` — `StatePoller`'s Docker event-stream retry/backoff and `FileWatcher`'s chokidar setup moved verbatim into `attach()`; their abort/close logic moved into `detach()`; both reconcile cron expressions (`"*/60 * * * * *"`) kept byte-identical; `NotificationWatcher`'s `reconcileCronExpression` is `null` (PD-6) and its `reconcile()` is a documented no-op rather than left unexplained
- `BackupScheduler` now `implements Job` directly (`kind: "dynamic"`, PD-6) since its per-stack task map doesn't fit either base class's single schedule handle; `start()` delegates to the existing `loadAll()` body; health is reported at the scheduler level from inside `runScheduledBackup()`'s existing try/catch
- `jobs/index.ts` rewritten: registers all seven job facades with `jobRegistry` in the original start order (`StatePoller, FileWatcher, UpdateChecker, DiskChecker, NotificationWatcher, BackupScheduler, ProxyCertPoller`), keeps the backup-recovery pre-start hook as its own isolated try/catch outside the job set (PD-7), and delegates `startJobs()`/`stopJobs()` to `jobRegistry.startAll()`/`stopAll()`
- `app.ts`'s `onClose` hook updated from `stopJobs()` to `await stopJobs()` — the hook body was already `async`, so this was the only call-site change `stopJobs()` becoming async required
- Constructor parameters that used to be typed against concrete infrastructure classes (`DockerExecutor`, `RegistryClient`, `DockerodeClient`) now type against their D-07 ports (`DockerExecutorPort`, `RegistryClientPort`, `DockerodeClientPort`) in `update-checker.ts`, `proxy-cert-poller.ts` and `state-poller.ts`
- A new `layering.test.ts` fitness-rule case fails automatically if a future job file under `jobs/` doesn't extend `IntervalJob`/`WatcherJob` or declare `implements Job` — live-confirmed by temporarily adding `jobs/_fitness-rule-check.ts` with a class joining no contract, observing the new test fail, then reverting
- Rewrote `jobs/index.test.ts` against the registry-backed shape and added the case the old suite never had and the old code never satisfied: a job whose `stop()` throws no longer prevents a later job's `stop()` from running (closes 10-RESEARCH.md Pitfall 4)
- `yarn workspace @docktor/server test:unit` (51 files, 851 passed + 2 todo — up from the pre-plan baseline of 838 passed + 2 todo) and `yarn typecheck` both exit zero after every task and at plan completion

## Task Commits

Each task was committed atomically:

1. **Task 1: The four cron-driven jobs become interval jobs** - `a01e4d1` (feat)
2. **Task 2: The three event-driven jobs become watcher jobs** - `f288508` (feat)
3. **Task 3: BackupScheduler implements the contract directly; jobs/index.ts delegates to the registry** - `6ad8dad` (feat)

_No TDD tasks in this plan's frontmatter sense — each was written test-alongside-implementation in one commit per task, extending existing test files rather than a separate RED/GREEN split._

## Files Created/Modified
- `server/src/jobs/disk-checker.ts` - `DiskChecker extends IntervalJob`; exported `diskChecker` widened into a lazy `Job` facade
- `server/src/jobs/update-checker.ts` - `UpdateChecker extends IntervalJob`; constructor params typed against `DockerExecutorPort`/`RegistryClientPort`; exported `updateChecker` instance now satisfies `Job` natively
- `server/src/jobs/proxy-cert-poller.ts` - `ProxyCertPoller extends IntervalJob`; constructor `docker` param typed against `DockerodeClientPort`; exported `proxyCertPoller` instance now satisfies `Job` natively
- `server/src/jobs/state-poller.ts` - `StatePoller extends WatcherJob`; `docker` param typed against `DockerodeClientPort`; exported `statePoller` instance now satisfies `Job` natively
- `server/src/jobs/file-watcher.ts` - `FileWatcher extends WatcherJob`; exported `fileWatcher` instance now satisfies `Job` natively; `isWatching()` kept as a plain extra method
- `server/src/jobs/notification-watcher.ts` - `NotificationWatcher extends WatcherJob` with `reconcileCronExpression = null`; exported `notificationWatcher` widened into a lazy `Job` facade
- `server/src/jobs/backup-scheduler.ts` - `BackupScheduler implements Job` (`kind: "dynamic"`); `start()` delegates to `loadAll()`; health reporting added to `runScheduledBackup()`; exported `backupScheduler` widened into a `Job & {upsert, remove}` facade
- `server/src/jobs/index.ts` - Rewritten as registration (`jobRegistry.register(...)` x7 at module load) plus delegation (`startJobs()`/`stopJobs()` to `jobRegistry.startAll()`/`stopAll()`), backup recovery kept as an isolated pre-start hook
- `server/src/app.ts` - `onClose` hook: `stopJobs()` → `await stopJobs()`
- `server/test/unit/jobs/backup-scheduler.test.ts` - Added a `"Job contract (D-02, D-13 dynamic kind, PD-6)"` describe block (4 tests: name/kind, start() delegation, run/error health reporting)
- `server/test/unit/jobs/index.test.ts` - Rewritten mocks to include `name`/`kind`/`setHealthReporter`; both describe blocks now `await` the now-async `stopJobs()`; added the stop-isolation test case
- `server/test/unit/jobs/notification-watcher.test.ts` - Added a `node-cron` mock and a test asserting `start()` schedules no cron task
- `server/test/unit/architecture/layering.test.ts` - Added the "every job under jobs/ joins the Job lifecycle contract" fitness-rule describe block (7 cases, one per real job file)

## Decisions Made
- DiskChecker's own outer try/catch inside `check()` stays even though `IntervalJob.runGuarded()` would also catch the same error — `check()` is directly unit-tested (not just reached through `run()`), and the existing suite asserts the exact `"[DiskChecker] check failed:"` log line verbatim.
- UpdateChecker and ProxyCertPoller needed no `Job`-facade wrapper: both already export a direct class instance (`export const x = new X()`); once the class extends `IntervalJob`/`WatcherJob`, that instance satisfies `Job` natively. Only DiskChecker, NotificationWatcher and BackupScheduler have a lazily-constructed exported wrapper (their production dependencies need a lazy `import()` to keep `db.ts` out of the unit-test module graph) and needed widening into a `Job` facade.
- BackupScheduler reports health at the scheduler level (`recordRun`/`recordError` keyed on `this.name`, not per-stack) from inside `runScheduledBackup()`'s existing outer try/catch — a run is recorded once a tick has fired the `initiateBackup()` call (regardless of the unawaited fire-and-forget continuation's later outcome), an error only when `initiateBackup()` itself throws synchronously. This is the only reading of a single last-run/last-error field that makes sense shared across every stack's independent cron task (PD-6).
- NotificationWatcher's `reconcile()` is a documented no-op body, not left undefined — genuinely unreachable (its `reconcileCronExpression` is `null`) but PD-6's rationale needs to live where a future reader will find it.
- `app.ts`'s `onClose` hook changed from `stopJobs()` to `await stopJobs()` — the only call-site change required by `stopJobs()` becoming async, since the hook body was already `async`.
- Losing UpdateChecker's `"[UpdateChecker] started — checking every 5 minutes..."` startup log line (previously logged inside its own `start()`, now owned by `IntervalJob.start()` which logs nothing) is accepted as in-scope simplification — it's start()-level boilerplate, not tick-body behavior, and no test asserted on it.

## Deviations from Plan

None — plan executed exactly as written. All three tasks, their acceptance criteria, and the plan's own `<verification>`/`<success_criteria>` sections were satisfied without needing a Rule 1–4 deviation. `server/src/app.ts` and `server/test/unit/jobs/backup-scheduler.test.ts` were not in the plan's `<files>` lists for their respective tasks but their edits were explicitly directed by the plan's own `<action>` text (the `app.ts` call-site update) or follow directly from CLAUDE.md's TDD requirement that new behavior (BackupScheduler's Job contract and health reporting) ship with tests.

## Issues Encountered

This session was interrupted by a session rate-limit between Task 1 (committed `a01e4d1`) and Tasks 2–3. On resume, the worktree state, committed history and uncommitted in-progress edits (`state-poller.ts`, `file-watcher.ts` mid-edit) were inspected and found consistent with the plan; work continued from exactly where it left off (finishing `reconcile()`'s visibility change) with no rework needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All seven jobs now share the `Job` lifecycle contract from 10-04; `jobs/index.ts` is a thin registration + delegation layer with a compiler-and-test-enforced fitness rule preventing a future job from bypassing the contract.
- Per-job health state (last run, last error, running/stopped status) is now populated by every real job in production, not just synthetic test doubles — ready groundwork for Phase 14 (HTTP health probes + uptime view) to build a surface on, per D-14's explicit scope boundary (this phase adds no UI/endpoint for it).
- No blockers. `yarn workspace @docktor/server test:unit` (51 files, 851 passed + 2 todo) and `yarn typecheck` both exit zero on the full tree after all three tasks.

---
*Phase: 10-backend-architecture-refactor*
*Completed: 2026-09-23*

## Self-Check: PASSED

All 13 modified files confirmed present on disk with the expected class/export shapes (`extends IntervalJob`/`WatcherJob`/`implements Job` verified via grep); all three task commits (`a01e4d1`, `f288508`, `6ad8dad`) confirmed present in `git log`; `git rev-list --count ac86dc1..HEAD` = 3, matching the 3 task commits with no docs-only or uncommitted changes.
