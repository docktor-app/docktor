---
phase: 10-backend-architecture-refactor
plan: 16
subsystem: infra
tags: [event-bus, background-jobs, state-poller, job-registry, vitest, tdd]

# Dependency graph
requires:
  - phase: 10-backend-architecture-refactor
    provides: D-02/D-13 Job/IntervalJob/WatcherJob lifecycle abstraction, D-14 JobRegistry, D-15 per-domain-event bus emit/subscribe
provides:
  - "reconcile() gates stack.status_changed on a real transition (StatePollerRepo.updateStackStatus's non-null return), closing G-10-3"
  - "JobRegistry.startAll() logs one `[JobRegistry] Started <name> (<kind>)` line per successfully started job, closing G-10-1"
affects: [10-UAT, 10-VERIFICATION, notification-watcher, state-broadcast-subscriber]

# Actuals (#2632)
actuals:
  tokens: 3652
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "reconcile()'s status_changed emit now mirrors handleEvent()'s existing capture-and-gate pattern (const statusLog = await repo.updateStackStatus(...); if (statusLog) { ... })"
    - "JobRegistry.startAll() is the single choke point for start-time visibility across all three Job kinds (interval/watcher/dynamic) — a per-job log line here covers every job by construction instead of duplicating it into each base class"

key-files:
  created: []
  modified:
    - server/src/jobs/state-poller.ts
    - server/test/unit/jobs/state-poller.test.ts
    - server/src/jobs/job-registry.ts
    - server/test/unit/jobs/job-registry.test.ts
    - server/test/unit/jobs/index.test.ts

key-decisions:
  - "G-10-3 fixed at the emit site in reconcile() only — stack-repository.ts, domain/events.ts, event-bus.ts, notification-watcher.ts, and state-broadcast-subscriber.ts left untouched, per the plan's prohibitions and the debug session's root-cause diagnosis"
  - "G-10-1 fixed once in JobRegistry.startAll() (after markRunning()) rather than in IntervalJob/WatcherJob's success paths — the registry is the only path all seven jobs share, including BackupScheduler's `dynamic` kind which implements Job directly and would be missed by a base-class-only fix"
  - "No per-tick job logging added anywhere — both gaps are start-time-visibility and steady-state-silence fixes only, matching the plan's explicit prohibitions"

patterns-established: []

requirements-completed: ["D-02", "D-13", "D-14", "D-15"]

coverage:
  - id: D1
    description: "A steady-state reconcile tick (unchanged stack status) emits no stack.status_changed event; NotificationWatcher logs nothing for it; a real transition still emits exactly one event with the unchanged {stackId, status} payload"
    requirement: "D-15"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/state-poller.test.ts#reconcile (OBS-04) > emits stack.status_changed exactly once end-to-end, and NotificationWatcher logs it exactly once, across a real transition followed by a steady-state tick"
        status: pass
      - kind: unit
        ref: "server/test/unit/jobs/state-poller.test.ts#reconcile (OBS-04) > emits nothing on stack.status_changed when a tick's status is unchanged, but still updates the service row"
        status: pass
    human_judgment: false
  - id: D2
    description: "Server startup prints one [JobRegistry] Started <name> (<kind>) line per successfully started job, naming all seven jobs (StatePoller, FileWatcher, UpdateChecker, DiskChecker, NotificationWatcher, BackupScheduler, ProxyCertPoller) in registration order; a failed start gets no started line"
    requirement: "D-02"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/job-registry.test.ts#startAll > logs one started line per successfully started job, in registration order, naming each job's kind"
        status: pass
      - kind: unit
        ref: "server/test/unit/jobs/job-registry.test.ts#startAll > prints no started line for a job whose start() throws synchronously, or whose start() rejects, while a later job still gets one"
        status: pass
      - kind: unit
        ref: "server/test/unit/jobs/index.test.ts#startJobs > prints a started line naming all seven jobs, in registration order, on a successful boot (G-10-1)"
        status: pass
    human_judgment: false

duration: ~15min
completed: 2026-09-25
status: complete
---

# Phase 10 Plan 16: Gap Closure — Silence the Steady-State Reconcile Tick and Name Every Job at Startup

**Reconcile now gates `stack.status_changed` on a real stored-status transition (mirroring `handleEvent()`'s existing pattern), and `JobRegistry.startAll()` prints one `Started <name> (<kind>)` line per job so all seven — including ProxyCertPoller and UpdateChecker — are visible at boot.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-09-25T21:43:49Z
- **Tasks:** 2 (both TDD, RED then GREEN)
- **Files modified:** 5

## Accomplishments

- **G-10-3 closed:** `state-poller.ts` `reconcile()` now captures `repo.updateStackStatus()`'s return value into `const statusLog` and only emits `stack.status_changed` when it's non-null — a steady-state tick (unchanged status) is silent on both the notification log and the SSE stream; a real transition still emits exactly one event with the unchanged `{stackId, status}` payload.
- **G-10-1 closed:** `job-registry.ts` `startAll()` now logs `[JobRegistry] Started ${job.name} (${job.kind})` immediately after `markRunning()`, for every job whose `start()` resolved successfully. A job whose `start()` throws or rejects gets only its existing `failed to start` error line, never a started line.
- Both former `it.todo` placeholders in `state-poller.test.ts`'s `reconcile (OBS-04)` describe block became real tests, plus two new tests: an end-to-end `StatePoller` → real `InMemoryEventBus` → real `NotificationWatcher` tracer proving the steady-state tick produces zero `Received status change` log lines (down from the pre-fix count of 2), and a focused test that a null-returning tick emits nothing on the bus while still updating the service row.
- `index.test.ts` gained a test pinning the exact seven production job names in registration order — the literal UAT truth statement from `10-UAT.md` Test 1, now enforced as a regression test.

## Task Commits

Each task was committed atomically, RED (test-first) and GREEN (implementation) combined per commit since both tasks are small single-purpose fixes with tests added and made to pass in the same commit (following this repo's existing single-commit-per-task convention observed in prior Phase 10 plans):

1. **Task 1: A steady-state stack no longer re-announces an unchanged status on every reconcile tick (G-10-3)** - `c529427` (fix)
2. **Task 2: Server startup names every background job as it comes up (G-10-1)** - `4075560` (fix)

_Note: RED evidence for both tasks is recorded below under "RED Evidence" since this repo's TDD convention (per `[Phase 07]` STATE.md decision) uses manual RED confirmation, not a separate RED commit — `gsd_run check tdd-red-evidence` is documented as incompatible with this project's vitest TAP output._

## RED Evidence

**Task 1 (G-10-3), before the `state-poller.ts` production edit:**
```
 ❯ StatePoller > reconcile (OBS-04) > emits stack.status_changed exactly once end-to-end, and NotificationWatcher logs it exactly once, across a real transition followed by a steady-state tick
   AssertionError: expected [ …(2) ] to have a length of 1 but got 2
   - Expected: 1
   + Received: 2

 ❯ StatePoller > reconcile (OBS-04) > emits nothing on stack.status_changed when a tick's status is unchanged, but still updates the service row
   AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
   Received: 1st vi.fn() call: [{ "stackId": "docktor-proxy", "status": "RUNNING" }]

 Test Files  1 failed (1)
      Tests  2 failed | 14 passed (16)
```

**Task 2 (G-10-1), before the `job-registry.ts` production edit:**
```
 FAIL  job-registry.test.ts > JobRegistry > startAll > logs one started line per successfully started job, in registration order, naming each job's kind
   AssertionError: expected [] to deeply equal [ …(2) ]
 FAIL  job-registry.test.ts > JobRegistry > startAll > prints no started line for a job whose start() throws synchronously, or whose start() rejects, while a later job still gets one
   AssertionError: expected [] to deeply equal [ Array(1) ]
 FAIL  job-registry.test.ts > JobRegistry > startAll > prints the started line only after start() has resolved, not before
   AssertionError: expected [] to deeply equal [ Array(1) ]
 FAIL  index.test.ts > startJobs > prints a started line naming all seven jobs, in registration order, on a successful boot (G-10-1)
   AssertionError: expected [] to deeply equal [ 'StatePoller', 'FileWatcher', …(5) ]

 Test Files  2 failed (2)
      Tests  4 failed | 17 passed (21)
```

Both sets of failures went GREEN after the corresponding one-line production edit, with no other test in either file affected.

## Files Created/Modified

- `server/src/jobs/state-poller.ts` - `reconcile()` now captures `updateStackStatus()`'s return value and gates the `stack.status_changed` emit on it being non-null
- `server/test/unit/jobs/state-poller.test.ts` - replaced the two `reconcile (OBS-04)` `it.todo` placeholders with real tests; added an end-to-end tracer test (real `InMemoryEventBus` + real `NotificationWatcher`) and a focused null-tick test
- `server/src/jobs/job-registry.ts` - `startAll()` logs `[JobRegistry] Started ${job.name} (${job.kind})` after `markRunning()` on the success path only
- `server/test/unit/jobs/job-registry.test.ts` - three new `startAll` tests: started-line template/ordering, failed-start exclusion (sync throw + async reject), and started-line-only-after-resolve timing
- `server/test/unit/jobs/index.test.ts` - one new `startJobs` test pinning all seven production job names, in registration order, as the literal UAT truth

## Decisions Made

- G-10-3's fix stays confined to `state-poller.ts`'s `reconcile()` emit site — no change to `stack-repository.ts`, `domain/events.ts`, `event-bus.ts`, `notification-watcher.ts`, or `state-broadcast-subscriber.ts`, per the plan's explicit prohibitions and the debug session's diagnosis that the defect is a single discarded-return-value bug at one call site.
- G-10-1's fix lives once in `JobRegistry.startAll()`, not duplicated into `IntervalJob`/`WatcherJob`'s `start()` methods — the registry is the only code path all seven jobs (including `BackupScheduler`, a `dynamic`-kind job that implements `Job` directly per 10-04 PD-6) pass through, so one line there covers every job by construction rather than by convention.
- No per-tick logging was added to any job for either fix — both gaps are about start-time visibility (G-10-1) and steady-state silence (G-10-3) respectively, matching the plan's `prohibitions`.
- `reconcile()`'s emitted payload stays byte-identical (`{stackId, status}`, no `previousStatus`/`message` added) for real transitions, verified with `toEqual` (no extra keys) in the tracer test.

## Accepted Behavioral Trade-off (per plan's D-18 scope note)

Removing the redundant per-tick emit also removes the incidental ~60s `stack_status` re-broadcast that `10-UAT.md` Test 2 recorded as a "heartbeat." This is the intended fix, not a regression: every real transition still emits exactly as before (proven by the tracer test's `toEqual` payload assertion). The one accepted trade-off: a browser whose SSE connection dropped during a real transition no longer gets a free re-sync within 60s from the next steady-state tick — it now picks up the next real transition, or re-reads on page load. This is outside D-18's scope, which only constrains the refactor's rewiring to keep identical events at identical points for real transitions; it does not obligate the codebase to keep a discovered bug's incidental re-sync side effect.

## Deviations from Plan

None — plan executed exactly as written. Both tasks' `<action>` sections were followed verbatim: RED tests added first and observed failing, then the single guarded-emit / single-log-line production fix applied, then re-verified GREEN. No `Rule 4` architectural questions arose; no auto-fixes were needed under Rules 1-3.

## Issues Encountered

None. Both defects were pre-diagnosed by prior debug sessions (`.planning/debug/status-change-spam-every-tick.md`, `.planning/debug/missing-proxycertpoller-log.md`), so this plan was pure fix-application with test coverage, not further investigation.

## Verification

- `server/test/unit` (full server unit suite): **58 files, 1009 tests, all passed** (via `node_modules/.bin/vitest run --project unit` from `server/`, direct-binary form — `yarn` is blocked in this sandbox by the documented corepack/egress-proxy limitation).
- `tsc --build` (monorepo typecheck, via `node_modules/.bin/tsc --build` from the repo root, direct-binary form): **exit 0, silent**.
- `git diff --name-only 68bc7ec..HEAD -- server/` lists exactly the five files in this plan's `files_modified` — no file outside scope touched.
- Live confirmation (boot log naming all seven jobs; no repeated `Received status change` for a stable stack after 2+ minutes) is deferred to the gap's re-test in `/gsd-verify-work`, per the plan's own `<verification>` item 5 — not performed in this session.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G-10-1 and G-10-3 are both code-complete and unit-test-covered; ready for live re-verification in `/gsd-verify-work` against the original UAT test 1 and test 3 scenarios.
- Sibling gap-closure plan 10-17 runs next (sequentially, per this session's worktree-isolation degradation) to close any remaining Phase 10 UAT gaps before STATE.md/ROADMAP.md are updated by the orchestrator for both plans together.
- No new blockers introduced.

---
*Phase: 10-backend-architecture-refactor*
*Completed: 2026-09-25*

## Self-Check: PASSED

All 5 modified files and this SUMMARY.md confirmed present on disk; both task commits (`c529427`, `4075560`) confirmed present in `git log --oneline --all`.
