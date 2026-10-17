---
phase: 10-backend-architecture-refactor
plan: 04
subsystem: jobs
tags: [ddd, job-abstraction, registry, node-cron, health-tracking, vitest]

# Dependency graph
requires:
  - "10-01 — repositories/index.ts and application/ports/ conventions (not directly consumed by this plan's two new modules, but the phase's established layering baseline)"
provides:
  - "server/src/jobs/job.ts — Job lifecycle contract, JobKind, JobHealthReporter, IntervalJob, WatcherJob base classes"
  - "server/src/jobs/job-registry.ts — JobRegistry, JobHealth, jobRegistry singleton"
affects: [10-07]

# Actuals (#2632)
actuals:
  tokens: 6674
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Job lifecycle contract (name/kind/start/stop/setHealthReporter) with two base classes for the two common shapes (IntervalJob, WatcherJob), plus a documented 'dynamic' kind escape hatch for jobs that manage their own schedule set (PD-6)"
    - "JobHealthReporter as a two-member interface so a job reports outcomes without importing the registry — dependency arrow points job -> reporter interface only"
    - "Registry health state stored as private mutable entries, exposed only via health() returning per-entry shallow copies"

key-files:
  created:
    - server/src/jobs/job.ts
    - server/src/jobs/job-registry.ts
    - server/test/unit/jobs/job.test.ts
    - server/test/unit/jobs/job-registry.test.ts
  modified: []

key-decisions:
  - "IntervalJob.start() guards on an existing cronTask, and WatcherJob.start() guards on a `started` boolean, both as unconditional no-ops on a second call — satisfies the 'no leaked schedule on double start()' requirement without needing to decide whether a second start() should restart or ignore (chose ignore, matching the existing jobs' single-call usage pattern)"
  - "WatcherJob's detach-failure handling uses try/catch/finally so the cron cancel and the started-flag reset always run, even when detach() throws or rejects — closes the exact stop-isolation gap 10-RESEARCH.md Pitfall 4 names, at the base-class level rather than per-job"
  - "job-registry.test.ts uses plain object literals (not real Job/WatcherJob instances) as synthetic jobs, with setHealthReporter captured via its own mock's call args to obtain the JobHealthReporter the registry handed the job — lets health-reporting tests call recordRun/recordError back on the registry exactly as a real job's base class would, without importing job.ts's concrete classes"

patterns-established:
  - "A job's health-reporting outcome (recordRun/recordError) is always routed through the base class's private runGuarded()/reconcileGuarded() helper, so every subclass gets identical logging + reporting behavior with zero duplication — this is the shape 10-07 migrates the seven real jobs onto"

requirements-completed: [D-02, D-12, D-13, D-14]

coverage:
  - id: D1
    description: "A single Job lifecycle contract (name, kind, start, stop, setHealthReporter) exists that the registry can manage uniformly (D-02, D-13)"
    requirement: "D-02"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/job.test.ts (14 tests covering IntervalJob and WatcherJob lifecycle/error paths)"
        status: pass
      - kind: unit
        ref: "server/test/unit/jobs/job-registry.test.ts#register > gives the job a health reporter"
        status: pass
    human_judgment: false
  - id: D2
    description: "Two job kinds are distinguished explicitly — IntervalJob (pure cron) and WatcherJob (event-driven, nullable reconcile fallback) — each with its own base class and internal scheduling semantics (D-13)"
    requirement: "D-13"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/job.test.ts#WatcherJob > attaches its event source first and then schedules the reconcile tick"
        status: pass
      - kind: unit
        ref: "server/test/unit/jobs/job.test.ts#WatcherJob > attaches and schedules nothing when the reconcile schedule is null"
        status: pass
    human_judgment: false
  - id: D3
    description: "The cron library is wrapped, not replaced: scheduling goes through node-cron reached only through the base classes (D-12)"
    requirement: "D-12"
    verification:
      - kind: other
        ref: "grep -cE \"^\\s*import .*['\\\"]node-cron['\\\"]\" server/src/jobs/job.ts prints 1"
        status: pass
    human_judgment: false
  - id: D4
    description: "The registry records per-job health — status, last start, last run, last error and its timestamp — with two-sided (start and stop) failure isolation and no HTTP/SSE/client surface (D-14)"
    requirement: "D-14"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/job-registry.test.ts (12 tests: registration-order start, sync/async start failure isolation, sync/async stop failure isolation, health status transitions, recordRun/recordError semantics, snapshot immutability)"
        status: pass
      - kind: other
        ref: "grep -rlE 'jobRegistry|JobRegistry' server/src/routes server/src/app.ts prints nothing"
        status: pass
    human_judgment: false
---

# Phase 10 Plan 04: Job Abstraction and Registry Summary

**A `Job` lifecycle contract with `IntervalJob`/`WatcherJob` base classes wrapping `node-cron`, plus a `JobRegistry` that starts/stops every registered job with per-job failure isolation on both sides and records internal health state — built and tested standalone against synthetic jobs, with no existing job migrated yet.**

## Performance

- **Duration:** ~15 min (includes a fresh `yarn install` and `prisma generate` this worktree needed since neither had run yet)
- **Started:** 2026-09-23T14:35:09+02:00 (worktree fast-forwarded onto feature/phase-10-backend-refactoring)
- **Completed:** 2026-09-23T14:47:52+02:00
- **Tasks:** 2
- **Files modified:** 4 (all created)

## Worktree Setup Note

This worktree's branch (`worktree-agent-ae8a2dd51082c736a`) was created off a base that predated plans 10-01/10-02/10-03. Before starting: confirmed the branch was a clean ancestor of `feature/phase-10-backend-refactoring` (`git merge-base --is-ancestor` passed) and fast-forward merged (`git merge --ff-only`) to bring in the 10-01–10-03 plan/summary files and their source changes, including `10-04-PLAN.md` itself, which did not exist in the worktree until this merge. No divergent history, no rebase, no force-push.

The worktree also had no `node_modules` (git worktrees don't share them) and no generated Prisma client, both required before `yarn typecheck` or any test could run. Ran `yarn install` and `yarn db:generate` before Task 1 — both are environment setup, not scope creep, and are not part of any task commit.

## Accomplishments
- `server/src/jobs/job.ts`: `Job` interface, `JobKind` union (`interval`/`watcher`/`dynamic`), `JobHealthReporter` interface, `IntervalJob` and `WatcherJob` abstract base classes — each owning its schedule handle, try/catch-per-invocation, and health reporting, with `node-cron` imported exactly once in the whole module (D-12)
- `server/src/jobs/job-registry.ts`: `JobRegistry implements JobHealthReporter`, `JobHealth`/`JobStatus` types, and a `jobRegistry` singleton — `startAll()`/`stopAll()` run sequentially in registration order with per-job try/catch on both sides, closing the stop-isolation gap 10-RESEARCH.md Pitfall 4 named (only `start()` was isolated before)
- 26 tests total across the two new suites (14 in `job.test.ts`, 12 in `job-registry.test.ts`), all against synthetic subclasses/objects — no real job (disk-checker, state-poller, etc.) was touched or imported
- Confirmed the health state has zero HTTP/SSE/client surface: `grep -rlE 'jobRegistry|JobRegistry' server/src/routes server/src/app.ts` prints nothing (D-14)

## Task Commits

Each task was committed atomically:

1. **Task 1: The Job contract and the IntervalJob / WatcherJob base classes** - `75ee87c` (feat)
2. **Task 2: JobRegistry with per-job health tracking and two-sided failure isolation** - `c4e0558` (feat)

_No TDD tasks in this plan's frontmatter sense (tdd="true" on both tasks, but each was written test-alongside-implementation in one commit per task, matching this plan's own `<action>` instructions to write the test file as part of building each module — not a separate RED/GREEN split)._

## Files Created/Modified
- `server/src/jobs/job.ts` - `Job`, `JobKind`, `JobHealthReporter`, `IntervalJob`, `WatcherJob`
- `server/src/jobs/job-registry.ts` - `JobRegistry`, `JobHealth`, `JobStatus`, `jobRegistry` singleton
- `server/test/unit/jobs/job.test.ts` - 14 tests against synthetic `TestIntervalJob`/`TestWatcherJob` subclasses defined in-file
- `server/test/unit/jobs/job-registry.test.ts` - 12 tests against synthetic plain-object `Job` doubles

## Decisions Made
- `IntervalJob.start()` and `WatcherJob.start()` both treat a second call as an unconditional no-op (guarded on `cronTask !== null` / a `started` boolean respectively) rather than restarting — satisfies the plan's "no leaked schedule on double start()" requirement with the simplest semantics, matching how every existing job is actually called today (once, at process startup).
- `WatcherJob.stop()`'s detach failure is caught in a try/catch wrapping only the `detach()` call, with the cron cancel and `started` reset moved to a `finally` block — guarantees both halves of stop() run even when `detach()` throws or its promise rejects, which is the literal shutdown-leak gap 10-RESEARCH.md Pitfall 4 describes.
- `job-registry.test.ts`'s synthetic jobs are plain object literals with `vi.fn()` members (as the plan's `<action>` specifies), not instances of `IntervalJob`/`WatcherJob` — this keeps the registry's test suite decoupled from Task 1's concrete classes, so a future change to the base classes' internals can't silently break registry tests for the wrong reason.

## Deviations from Plan

None - plan executed exactly as written. Both tasks, their acceptance criteria, and the plan's own `<verification>`/`<success_criteria>` sections were satisfied without needing a Rule 1-4 deviation. The `yarn install` / `yarn db:generate` steps were pre-existing environment setup required by every worktree, not a plan deviation.

## Issues Encountered

None beyond the worktree environment setup described above (stale base branch, missing `node_modules`, missing generated Prisma client) — all resolved before Task 1 began and none caused by this plan's own changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `Job`, `JobKind`, `JobHealthReporter`, `IntervalJob`, `WatcherJob` (from `job.ts`) and `JobRegistry`, `JobHealth`, `jobRegistry` (from `job-registry.ts`) are ready for plan 10-07 to migrate the seven real jobs onto and rewire `jobs/index.ts`'s `startJobs()`/`stopJobs()` through `jobRegistry.startAll()`/`stopAll()`.
- PD-6's taxonomy resolution is recorded here for 10-07 to apply directly: `NotificationWatcher` → `WatcherJob` with `reconcileCronExpression = null`; `BackupScheduler` → implements `Job` directly as the `dynamic` kind (not a base class); the other five real jobs → `IntervalJob` or `WatcherJob` as their existing shape already suggests.
- PD-7 (`"BackupRecovery"` stays a pre-start hook, not a `Job`) is unaffected by this plan and remains 10-07's responsibility.
- No blockers. `yarn workspace @docktor/server test:unit` (51 files, all green, no job migrated) and `yarn typecheck` both exit zero on the full tree.

---
*Phase: 10-backend-architecture-refactor*
*Completed: 2026-09-23*

## Self-Check: PASSED

All 4 created files and this SUMMARY.md itself confirmed present on disk; both task commits (`75ee87c`, `c4e0558`) confirmed present in git history.
