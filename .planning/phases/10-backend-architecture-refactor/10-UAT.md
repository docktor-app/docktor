---
status: testing
phase: 10-backend-architecture-refactor
source: [10-VERIFICATION.md]
started: "2026-09-24T16:50:00Z"
updated: "2026-09-24T16:50:00Z"
---

## Current Test

number: 3
name: Notification isolation under a real mail outage (deferred by plan 10-12 — D-17)
expected: |
  Configure an unreachable mail server, run a backup that fails. The backup's own
  status/log/notification-row outcomes are unaffected by the mail failure — identical to a
  working-mail-server run — and the notification row is still written to the log.
awaiting: user response

## Tests

### 1. Job startup and shutdown (deferred by plan 10-07 — D-02, D-13, D-14)
expected: Startup log names all seven jobs in sequence; a shutdown signal exits the process cleanly with no orphaned container-event stream or file watcher.
result: issue
reported: "startup was successful, but I didnt see the proxy cert poller. Here is the log: [FileWatcher] Starting file watcher on: ....; [FileWatcher] Polling mode enabled (interval: 1000ms) [DOCKTOR_FS_POLLING override]; [NotificationWatcher] Started - subscribed to the domain-event bus; [FileWatcher] Chokidar is ready and watching; [BackupScheduler] Registered 0 backup schedule(s); [StatePoller] Starting reconcile...; [StatePoller] Found 9 total containers; [FileWatcher] Reconcile: file not found for stack docktor-proxy, skipping; [StatePoller] Processing stack=memos...; [StatePoller] Reconcile: stack=memos, derived=STOPPED...; [NotificationWatcher] Received status change: stackId=memos status=STOPPED; [StatePoller] Processing stack=docktor-proxy...; [StatePoller] Reconcile: stack=docktor-proxy, derived=RUNNING..."
severity: major

### 2. Live-state stream sequences (deferred by plan 10-11 — D-18)
expected: |
  Connect an SSE client to the live-state endpoint and perform: deploy a stack, stop a stack,
  edit a stack's compose file directly on disk (outside the app), and run a backup. Each
  operation's event sequence has the same types, fields, and order as before the refactor; the
  outside-edit config_changed event arrives tagged as external.
result: pass
note: |
  User exercised deploy + stop (redeploy) on stack "memos" via EventStream devtools tab.
  Observed: stack_status DEPLOYING->RUNNING, container_state running/exited transitions with
  statusLog, stack_status STOPPED, then a second DEPLOYING->RUNNING cycle, plus periodic
  stack_status heartbeats every ~60s (StatePoller reconcile tick) — all shapes consistent with
  state-broadcast-subscriber.test.ts's asserted payloads. No config_changed/config_error
  (external compose edit) or backup-triggered event was exercised in this pass — user had no
  pre-refactor baseline to diff against for exact parity, which is expected (no human has one).
  Recorded as pass on "events fire and look sane, nothing wrong observed"; the external-edit and
  backup sub-cases remain formally unexercised but are not reported as failing.

### 3. Notification isolation under a real mail outage (deferred by plan 10-12 — D-17)
expected: |
  Configure an unreachable mail server, run a backup that fails. The backup's own
  status/log/notification-row outcomes are unaffected by the mail failure — identical to a
  working-mail-server run — and the notification row is still written to the log.
result: [pending]

### 4. Audit-log freshness after an external edit (deferred by plan 10-13 — D-15 item 2, PD-11)
expected: |
  With a stack detail page open, edit the stack's compose file directly on disk (valid, then
  invalid). New StackEvent entries (config_changed, then config_error) appear in the event log
  section without a manual refresh, rendered identically to pre-refactor entries.
result: [pending]

### 5. The five integration test files against a live database (deferred by plan 10-09, consolidated at 10-15 Task 2)
expected: |
  On a host with a reachable PostgreSQL/Docker, `yarn workspace @docktor/server test:integration`
  passes all five files unmodified, including `setup-concurrency.test.ts`'s first-run exclusive-
  insert lock. Both this session's sandbox (no Docker daemon) and the execution session's sandbox
  (Docker present, but Postgres wire-protocol handshake blocked, Prisma P1001) independently hit
  the same long-standing host-level block documented in STATE.md since Phase 05.1 — an
  unrestricted host is needed to actually run this to a pass/fail outcome.
result: [pending]

## Summary

total: 5
passed: 1
issues: 1
pending: 3
skipped: 0
blocked: 0

## Gaps

- gap_id: G-10-1
  truth: "Startup log names all seven jobs in sequence (state poller, file watcher, update checker, disk checker, notification watcher, backup scheduler, proxy cert poller)"
  status: failed
  reason: "User reported: startup was successful, but I didnt see the proxy cert poller. Log shows FileWatcher, NotificationWatcher, BackupScheduler, and StatePoller lines but no ProxyCertPoller line."
  severity: major
  test: 1
  artifacts: []
  missing: []

## Non-Blocking Advisory (from 10-REVIEW.md)

Code review (standard depth, 79 files) found 1 Critical + 3 Warning findings, all pre-existing
`backup-service.ts` behavior outside this phase's own scope (no behavior change introduced by
Phase 10):

- **CR-01 (Blocker):** `BackupService.buildEnv()` always overrides `RESTIC_REPOSITORY` to a
  local path when a stack path is available, so a configured SFTP/S3 backup repository is
  silently never used — a real data-safety/disaster-recovery gap. Recommended: file a GitHub
  issue and track separately; does not block Phase 10 completion since it is not a regression
  introduced by this phase.
- **WR-01..WR-03:** path-boundary check missing a separator guard, a repository composition-root
  bypass in `onboarding-service.ts`, and unguarded `JSON.parse()` on stored retention-policy JSON
  (two call sites) — see `10-REVIEW.md` for details and suggested fixes.
