---
status: diagnosed
trigger: "G-10-1 (10-UAT.md Test 1): startup was successful, but I didnt see the proxy cert poller. Log shows FileWatcher, NotificationWatcher, BackupScheduler, and StatePoller lines but no ProxyCertPoller line."
created: "2026-09-25T20:54:54Z"
updated: "2026-09-25T21:10:00Z"
goal: find_root_cause_only
---

## Current Focus

hypothesis: CONFIRMED (see Resolution)
test: n/a — diagnose-only mode, no fix applied
expecting: n/a
next_action: n/a — return ROOT CAUSE FOUND to caller

## Symptoms

expected: "Startup log names all seven jobs in sequence (state poller, file watcher, update checker, disk checker, notification watcher, backup scheduler, proxy cert poller); a shutdown signal exits the process cleanly with no orphaned container-event stream or file watcher." (10-UAT.md Test 1 / 10-VERIFICATION.md)
actual: "startup was successful, but I didnt see the proxy cert poller." Log showed FileWatcher, NotificationWatcher, BackupScheduler, StatePoller lines. No ProxyCertPoller line. (DiskChecker and UpdateChecker lines are also absent from the captured log, though not called out by name by the reporter.)
errors: None — no crash, no exception, silent absence of a log line.
reproduction: Start the server fresh (no TLS-enabled ProxyConfig rows in DB yet) and watch console output.
started: Reported during Phase 10 UAT (10-UAT.md Test 1), against the finished state of Phase 10 (D-02/D-13/D-14 job migration).

## Eliminated

- hypothesis: "ProxyCertPoller lost a pre-existing startup log line during the D-02/D-13 IntervalJob migration (commit a01e4d1, plan 10-07) — a genuine Phase 10 regression specific to this job."
  evidence: |
    `git show 3718e3f:server/src/jobs/proxy-cert-poller.ts` (the file's original content, predating Phase 10 entirely — created under Phase 06's proxy work) shows its original hand-rolled `start()` method:
    ```
    async start(): Promise<void> {
        this.cronTask = cron.schedule("*/60 * * * * *", async () => {
            try {
                await this.reconcile()
            } catch (err) {
                console.error("[ProxyCertPoller] reconcile error:", err)
            }
        })
    }
    ```
    Zero `console.log` calls — only a `console.error` on failure. `git show a01e4d1 -- server/src/jobs/proxy-cert-poller.ts` (the actual 10-07 migration diff) confirms the same: the old `start()`/`stop()` pair being deleted had no log line to lose. ProxyCertPoller has never, at any point in its history, logged a startup line.
  timestamp: "2026-09-25T21:00:00Z"

## Evidence

- timestamp: "2026-09-25T20:56:00Z"
  checked: server/src/jobs/proxy-cert-poller.ts (current, post-refactor)
  found: |
    `reconcile()` (line 149-167): `const rows = allRows.filter((row) => row.tlsEnabled); if (rows.length === 0) return` — returns with zero console output whenever no TLS-enabled ProxyConfig rows exist. No log line anywhere in the class fires on a successful/no-op tick, and `start()` is entirely inherited from `IntervalJob` with no override.
  implication: On a fresh install with no TLS-enabled proxy config yet (the UAT test's actual condition), there is categorically no code path in this file that ever prints anything to the console, at startup or on any subsequent tick.

- timestamp: "2026-09-25T20:58:00Z"
  checked: server/src/jobs/job.ts — IntervalJob.start() and WatcherJob.start()/attach()
  found: |
    `IntervalJob.start()` (lines 61-73): schedules the cron task and, if `runImmediatelyOnStart`, calls `runGuarded()` — no `console.log` anywhere in this method or in `runGuarded()`'s success path (only `console.error` on a thrown error, line 85).
    `WatcherJob.start()` (lines 119-132): calls `attach()` then optionally schedules a reconcile cron — no `console.log` anywhere in this method either.
  implication: Neither base class the Phase 10 refactor introduced emits any "job started" log line. Whether a job appears to log anything at startup depends entirely on whether that job's own `attach()`/`run()` override happens to contain a `console.log`.

- timestamp: "2026-09-25T21:01:00Z"
  checked: All 7 job files for console.log/console.error calls (grep across server/src/jobs/)
  found: |
    Jobs that DO log something at start()/attach() time: FileWatcher (`"[FileWatcher] Starting file watcher on: ..."`, attach()), NotificationWatcher (`"[NotificationWatcher] Started - subscribed to the domain-event bus"`, attach()), BackupScheduler (`"[BackupScheduler] Registered N backup schedule(s)"`, start()).
    Jobs that do NOT log anything on start/attach, ever (in the current codebase): StatePoller (attach()/startEventStream() only logs on error; the `"[StatePoller] Starting reconcile..."` line the user saw is the cron-scheduled reconcile *tick* body at line 290, not a startup line — coincidentally fired within the captured window because its 60s reconcile cron ticked shortly after boot), DiskChecker (check() only logs on error), UpdateChecker (only logs per-image-check tick lines, e.g. `"[UpdateChecker] checking..."`), ProxyCertPoller (no log anywhere in start or reconcile-when-empty).
  implication: The "missing startup line" is not specific to ProxyCertPoller — it is a systemic, pre-existing inconsistency across all `IntervalJob` subclasses (and `StatePoller`'s `WatcherJob.attach()`). 4 of 7 jobs have never had a start-time log line; only 3 of 7 happen to log something at start as an accidental side effect of unrelated job-specific logging that predates the Job/IntervalJob abstraction.

- timestamp: "2026-09-25T21:03:00Z"
  checked: server/src/jobs/job-registry.ts (JobRegistry.startAll())
  found: |
    ```
    async startAll(): Promise<void> {
        for (const job of this.jobs.values()) {
            try {
                await job.start()
                this.markRunning(job.name)
            } catch (err) {
                console.error(`[JobRegistry] ${job.name} failed to start:`, err)
                this.markFailedToStart(job.name, err)
            }
        }
    }
    ```
    No `console.log` on the success path — only `console.error` on failure. The registry itself never names any job, let alone all seven, in sequence, on a successful start.
  implication: There is no registry-level startup summary/banner anywhere in the codebase. `server/src/index.ts` and `server/src/app.ts` were also checked (grep) and contain zero `console.log` calls of their own. The "startup log names all seven jobs in sequence" behavior has no single implementation point anywhere — it does not exist as a deliberate feature at all, at the registry or bootstrap level.

- timestamp: "2026-09-25T21:05:00Z"
  checked: .planning/phases/10-backend-architecture-refactor/10-15-PLAN.md (Task 3, `<read_first>`, line 188) and 10-07-SUMMARY.md (Decisions Made, line 172)
  found: |
    10-15-PLAN.md's Task 3 `<read_first>` instructs the plan executor to consult "server/src/jobs/index.ts in its finished state (the registry's startup log lines, which are what a human reads to confirm all seven jobs registered)" — asserting, as fact, that the registry produces per-job startup log lines. This claim does not match the actual implementation (see prior evidence entry — `job-registry.ts` has no success-path logging at all).
    Separately, 10-07-SUMMARY.md's own Decisions Made section states: "Losing UpdateChecker's `"[UpdateChecker] started — checking every 5 minutes..."` startup log line (previously logged inside its own `start()`, now owned by `IntervalJob.start()` which logs nothing) is accepted as in-scope simplification — it's start()-level boilerplate, not tick-body behavior, and no test asserted on it."
  implication: |
    Two distinct facts, both load-bearing for the overall gap:
    (1) UpdateChecker DID have a genuine pre-Phase-10 startup log line, and plan 10-07 consciously deleted it during the IntervalJob migration — this is a real, acknowledged Phase 10 regression, but for UpdateChecker, not ProxyCertPoller.
    (2) The phase's own verification artifact (10-15-PLAN.md, which harvests directly into 10-VERIFICATION.md and then 10-UAT.md's Test 1 "expected" text) asserted an implementation detail ("the registry's startup log lines... confirm all seven jobs registered") that was never actually built by any of the 15 plans in this phase. No plan ever added a registry-level or bootstrap-level "job X started" log line. The UAT truth statement therefore encodes an expectation the code was never engineered to satisfy — it was inherited from an unverified assumption baked into the verification plan itself, not discovered by testing the actual jobs/index.ts output.

## Resolution

root_cause: |
  Two independent, corroborating facts jointly explain the observed gap (both confirmed by direct evidence, not inferred):

  1. (Immediate/direct cause for the ProxyCertPoller symptom specifically — NOT a Phase 10 regression) `ProxyCertPoller` has never, in any version of the file (pre-Phase-10 original at commit 3718e3f through the current post-refactor code), logged a line on `start()`, and its `reconcile()` silently returns on line 153 (`if (rows.length === 0) return`) with zero console output whenever no TLS-enabled `ProxyConfig` rows exist — the exact condition of a fresh UAT install. This is pre-existing/by-omission behavior carried unchanged through the D-02/D-13 migration, not something the refactor broke.

  2. (Systemic root cause of why the UAT "truth" statement itself is wrong/unimplemented) There is no code anywhere — not in `ProxyCertPoller`, not in `IntervalJob`/`WatcherJob` (`job.ts`), not in `JobRegistry.startAll()` (`job-registry.ts`), not in `jobs/index.ts`, not in `app.ts`/`index.ts` — that ever logs a "job registered/started" line for 4 of the 7 jobs (StatePoller, DiskChecker, UpdateChecker, ProxyCertPoller). Only 3 of 7 (FileWatcher, NotificationWatcher, BackupScheduler) happen to log something at start time, as an accidental side effect of pre-existing, job-specific logging unrelated to the Job/IntervalJob/WatcherJob abstraction Phase 10 introduced. Of the 4 silent jobs, only UpdateChecker's silence is a genuine Phase-10 regression (10-07-SUMMARY.md documents, as a conscious decision, deleting UpdateChecker's pre-existing startup log line "`[UpdateChecker] started — checking every 5 minutes...`" when migrating it onto `IntervalJob.start()`, "which logs nothing"). StatePoller, DiskChecker, and ProxyCertPoller were already silent on start before Phase 10 touched them.

  The UAT "expected" text itself ("Startup log names all seven jobs in sequence") is traceable to 10-15-PLAN.md Task 3's `<read_first>` block, which asserts as fact that "the registry's startup log lines... are what a human reads to confirm all seven jobs registered" — a claim about `jobs/index.ts`'s "finished state" that was never true of the actual implementation and was never implemented by any of Phase 10's 15 plans. That unverified assumption propagated unchecked into 10-VERIFICATION.md's hard requirement and then into 10-UAT.md's Test 1, setting an expectation the shipped code was never built to satisfy.

  Candidate causes (RCA branching, per protocol):
    - code: ProxyCertPoller.reconcile()'s early-return-on-empty-rows path and its complete absence of any start()-time log line (category: code)
    - process/spec: 10-15-PLAN.md's verification task asserted an unimplemented registry-logging behavior as an established fact, which then propagated into 10-VERIFICATION.md and 10-UAT.md without being checked against the actual jobs/index.ts / job-registry.ts source (category: process — planning/verification artifact, not runtime code)
  and_gate: |
    No — for the specific reported symptom (ProxyCertPoller line absent), a single cause (fact 1 above) fully explains it in isolation; no AND-gate combination with fact 2 is required to reproduce the user-observed absence. Fact 2 is presented because it explains *why the UAT truth statement itself was wrong to begin with* and why 3 other jobs (StatePoller, DiskChecker, UpdateChecker) are equally silent — necessary context for correctly scoping any fix (a per-job patch to ProxyCertPoller alone would not satisfy the UAT truth statement, since DiskChecker and UpdateChecker would still be silent).

fix: (not applied — goal: find_root_cause_only)
verification: (not applicable — no fix applied)
files_changed: []
