---
status: diagnosed
phase: 10-backend-architecture-refactor
source: [10-VERIFICATION.md]
started: "2026-09-24T16:50:00Z"
updated: "2026-09-25T00:00:00Z"
---

## Current Test

[testing complete]

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
result: issue
reported: "when opening the backup tab, infinite requests are fired, and the page gets super slow. I think there is still a bug. Regarding the test: i have tested with an unhealthy container and the log stated: Received status change: stackId=memos status=UNHEALTHY. Seems good. However, I regularly get the following message: \"Received status change: stackId=docktor-proxy status=RUNNING\", it appears always directly after the state poller. The issue is that the status before was also RUNNING. I think this is a bug."
severity: major
note: |
  Did not exercise the literal expected scenario (unreachable mail server + a failing backup) —
  tested an UNHEALTHY container transition instead (worked: notification received correctly),
  then surfaced two separate, unrelated problems along the way. Investigated both immediately:
  (1) client/src/routes/app/stacks/components/backup-history.tsx:107 — the polling useEffect's
  dependency array is `[stackId, backups]`, and the effect itself calls `setBackups(...)` and
  unconditionally re-fetches on every run (line 84) — `backups` changing is what the effect
  itself causes, so it retriggers itself in a tight loop, matching "infinite requests / page
  gets super slow" exactly. (2) server/src/jobs/state-poller.ts:349 — `reconcile()` emits
  `stack.status_changed` unconditionally on every 60s tick for every stack, with no comparison
  against the stack's previous status, so a steady-state stack re-broadcasts "changed" every
  tick even when nothing changed — matches the repeated docktor-proxy RUNNING->RUNNING report.
  Unclear yet whether either is a Phase 10 regression or pre-existing behavior carried over
  from before the refactor; full diagnosis deferred to the standard diagnose_issues sub-flow.

### 4. Audit-log freshness after an external edit (deferred by plan 10-13 — D-15 item 2, PD-11)
expected: |
  With a stack detail page open, edit the stack's compose file directly on disk (valid, then
  invalid). New StackEvent entries (config_changed, then config_error) appear in the event log
  section without a manual refresh, rendered identically to pre-refactor entries.
result: pass

### 5. The five integration test files against a live database (deferred by plan 10-09, consolidated at 10-15 Task 2)
expected: |
  On a host with a reachable PostgreSQL/Docker, `yarn workspace @docktor/server test:integration`
  passes all five files unmodified, including `setup-concurrency.test.ts`'s first-run exclusive-
  insert lock. Both this session's sandbox (no Docker daemon) and the execution session's sandbox
  (Docker present, but Postgres wire-protocol handshake blocked, Prisma P1001) independently hit
  the same long-standing host-level block documented in STATE.md since Phase 05.1 — an
  unrestricted host is needed to actually run this to a pass/fail outcome.
result: issue
reported: |
  4 tests failed in test/integration/proxy.test.ts (16 tests, 4 failed, rest passed):
  - "assigns a domain, writes the routing env vars + network into the compose file, and creates a ProxyConfig row" — expected 500 to be 201
  - "returns 409 and leaves the target compose file untouched when the domain is already assigned to another service" — expected 500 to be 201 (on the first, setup assignment call)
  - "returns the created row" (GET /api/stacks/:id/proxy-configs) — expected [] to have length 1 but got 0
  - "removes the domain and returns 204, then returns 404 on a repeat delete" — expected 500 to be 201 (on the setup assignment call)
  All 4 failures trace back to the same root action: POST /api/stacks/:id/services/:serviceName/proxy (domain assignment) returns 500 instead of 201. Every other test in the file (401 checks, deploy checks, settings checks, 400 validation checks) passed. This is on the user's own unrestricted host with a reachable live database — not the environmental Docker/Postgres connectivity block documented for this phase's sandboxed sessions; the DB is clearly reachable (other tests in the same file write real rows). Other 4 of the 5 integration test files were not reported as failing.
severity: blocker
note: |
  Traced statically (not yet root-caused): ProxyService.assignDomain() (application/proxy-service.ts:211)
  calls syncServiceComposeProxy() (line 316), which calls this.stackService.deployStack(stackId)
  (line 330) after writing the compose file — a 500 here could originate in proxy-service.ts itself,
  compose-rewriter.ts's setServiceProxyEnv, or stack-service.ts's deployStack, all Phase 10 refactor
  surfaces. This is a genuine functional regression against the phase's own hard constraint ("the
  five existing integration test files pass unmodified against a live database") — not an
  environmental classification like the sandboxed sessions' P1001/no-daemon block. Full root-cause
  diagnosis deferred to the standard diagnose_issues sub-flow (needs the actual 500 response body /
  server-side stack trace, not available from the test's assertion-only failure output).

## Summary

total: 5
passed: 2
issues: 3
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-10-1
  truth: "Startup log names all seven jobs in sequence (state poller, file watcher, update checker, disk checker, notification watcher, backup scheduler, proxy cert poller)"
  status: failed
  reason: "User reported: startup was successful, but I didnt see the proxy cert poller. Log shows FileWatcher, NotificationWatcher, BackupScheduler, and StatePoller lines but no ProxyCertPoller line."
  severity: major
  test: 1
  root_cause: "No job in the whole Job/JobRegistry abstraction (job.ts's IntervalJob/WatcherJob base classes, job-registry.ts's startAll()) ever logs a 'started' line by design. FileWatcher/NotificationWatcher/BackupScheduler happen to log something at start as a side effect of pre-existing, job-specific logging unrelated to the Job abstraction; StatePoller/DiskChecker/ProxyCertPoller were already silent on start before Phase 10 (confirmed via git show against the pre-refactor 3718e3f version of proxy-cert-poller.ts — zero console.log in start(), unchanged by the D-02/D-13 migration). ProxyCertPoller's reconcile() additionally no-ops silently when zero TLS-enabled ProxyConfig rows exist (the fresh-install state the user tested under). The ONE genuine Phase 10 regression: UpdateChecker DID have a startup log line before the refactor and lost it during the 10-07 migration (10-07-SUMMARY.md documents this as a conscious, accepted simplification at the time). The UAT 'expected' text itself traces to an unverified assumption in 10-15-PLAN.md's Task 3 read_first block, which incorrectly asserted the job registry already had startup log lines for all seven jobs — that assumption was never implemented by any of the phase's 15 plans and propagated unchecked into 10-VERIFICATION.md and this UAT test."
  artifacts:
    - path: "server/src/jobs/job.ts"
      issue: "IntervalJob.start()/WatcherJob.start() have no console.log on their success paths"
    - path: "server/src/jobs/job-registry.ts"
      issue: "JobRegistry.startAll() has no console.log on the success path, only console.error on failure"
    - path: "server/src/jobs/proxy-cert-poller.ts"
      issue: "No startup log line (pre-existing, unchanged by Phase 10); reconcile() silently no-ops when zero TLS-enabled rows exist"
    - path: "server/src/jobs/update-checker.ts"
      issue: "Lost its genuine pre-existing startup log line during the 10-07 IntervalJob migration — the one real regression among the four silent jobs"
  missing:
    - "A deliberate log line per job at true start time — e.g. in IntervalJob.start()/WatcherJob.start()'s success path, or one line per job in JobRegistry.startAll() after job.start() succeeds — covering all seven jobs consistently by design, which also restores UpdateChecker's lost line"
  debug_session: ".planning/debug/missing-proxycertpoller-log.md"

- gap_id: G-10-2
  truth: "Opening a stack's Backups tab does not cause runaway, continuous network requests"
  status: failed
  reason: "User reported: when opening the backup tab, infinite requests are fired, and the page gets super slow."
  severity: major
  test: 3
  root_cause: "backup-history.tsx's polling useEffect (lines 44-107) lists `backups` in its own dependency array (line 107: [stackId, backups]) while the effect itself writes `backups` via setBackups(data) inside fetchBackups(). getBackups()'s apiFetch()->res.json() parses a brand-new array/object graph on every HTTP response (no cache/memoization anywhere in the fetch path), so `data !== backups` by reference on every single fetch, even when content is identical. React's reference-based dependency comparison sees this as a real change, tears down and re-runs the effect, whose first action (line 84) is an unconditional fetchBackups() call — firing immediately, not after the intended 3000ms — creating a tight loop bound only by network round-trip latency, with no terminating condition. Confirmed by tracing the actual render/effect cycle (not just static reading); ruled out SnapshotsSection (sibling component, independently scoped to [stackId] only, not involved). NOT a Phase 10 regression — git log --follow shows this file untouched by any Phase 10 plan/commit; the defect predates the phase and surfaced only incidentally during this UAT session."
  artifacts:
    - path: "client/src/routes/app/stacks/components/backup-history.tsx"
      issue: "Line 107's dependency array [stackId, backups] includes state the effect itself sets; line 84's unconditional fetchBackups() call on every effect run is what turns each reference-change into an immediate re-fetch rather than a delayed one. Secondary: the 30s stopPollingTimeout (lines 92-100) reads `backups` via a stale closure and never survives long enough to fire, since the effect is torn down/recreated before its window elapses — a symptom of the same defect, not a separate bug."
  missing:
    - "Remove `backups` from the effect's dependency array — should be [stackId] only, since the existing hasInProgress check already computes correctly off the freshly-fetched `data` inside fetchBackups()'s own closure"
    - "Re-derive the stale-closure read at line 94 (backups.some(...) in the stop-timeout callback) from a ref or from the in-closure `data`, not from the dependency-triggering state"
  debug_session: ".planning/debug/backup-tab-infinite-requests.md"

- gap_id: G-10-3
  truth: "A notification 'status change' is only received when a stack's status actually changed, not on every poll tick"
  status: failed
  reason: "User reported: I regularly get the following message: \"Received status change: stackId=docktor-proxy status=RUNNING\", it appears always directly after the state poller. The issue is that the status before was also RUNNING. I think this is a bug."
  severity: major
  test: 3
  root_cause: "state-poller.ts's reconcile() (line 345) discards the return value of await repo.updateStackStatus(stack.id, derivedStatus) and then unconditionally emits stack.status_changed (line 349) on every 60s cron tick for every known stack, with no comparison against the previous status. The dedup signal already exists one layer down: stack-repository.ts's updateStackStatus() (lines 277-311) already returns null and skips the DB write when status is unchanged — reconcile() just never checks that return value before emitting. handleEvent() in the same file (lines 267-286) already demonstrates the correct pattern (captures the return value, gates the payload on truthiness) but that pattern wasn't reused in reconcile(). NOT a Phase 10 regression — diffed against pre-Phase-10 commit 3718e3f; the discard-then-unconditionally-broadcast logic, NotificationWatcher's unconditional log-and-process logic, and the repository's if (fromStatus === status) return null short-circuit are all byte-identical pre- and post-refactor; Phase 10 only restructured the transport (cron-in-class -> WatcherJob; StateBroadcaster.publish -> per-event bus.emit), not this logic. Severity is narrower than 'notification spam' suggests: NotificationWatcher.handleStatusChange()'s RUNNING/HEALTHY/STOPPED branch never calls notificationService.notify() — only the ERROR branch and the UNHEALTHY 120s timer do, both already deduped — so the repeated RUNNING tick produces a console.log line plus cheap no-op Map bookkeeping only, no persisted notification row or email. Blast radius is wider than the notification log alone: state-broadcast-subscriber.ts (feeding the SSE stream) subscribes to the same unguarded emit with no dedup of its own, matching UAT test 2's own note about periodic ~60s stack_status 'heartbeats' on the SSE stream (recorded as pass there since nothing looked wrong) — same root cause, just less noticeable as an SSE heartbeat than as a duplicated console.log line."
  artifacts:
    - path: "server/src/jobs/state-poller.ts"
      issue: "reconcile() (lines 344-352) discards updateStackStatus()'s return value and emits stack.status_changed unconditionally with no guard"
    - path: "server/src/repositories/stack-repository.ts"
      issue: "updateStackStatus() (lines 277-311) already correctly returns null on no-change — the unused signal the caller needs"
    - path: "server/src/jobs/notification-watcher.ts"
      issue: "handleStatusChange() (lines 77-139) — the unconditional log line at 78 is the visible symptom, not itself the root cause; downstream notify() calls are correctly deduped and unaffected"
    - path: "server/src/application/subscribers/state-broadcast-subscriber.ts"
      issue: "Secondary consumer of the same unguarded emit (SSE side) — relevant to blast radius, not a separate defect"
  missing:
    - "In reconcile(), capture updateStackStatus()'s return value (e.g. const statusLog = await repo.updateStackStatus(...)) and only call this.bus.emit(\"stack.status_changed\", ...) when statusLog is non-null — mirroring the pattern already used in handleEvent() one function above. No repository or bus/schema changes needed."
  debug_session: ".planning/debug/status-change-spam-every-tick.md"

- gap_id: G-10-4
  truth: "The five existing integration test files pass unmodified against a live database (roadmap SC3 / the phase's own hard constraint)"
  status: failed
  reason: "User reported (on their own unrestricted host, live DB reachable): 4/16 tests in test/integration/proxy.test.ts fail. All 4 trace to POST /api/stacks/:id/services/:serviceName/proxy (domain assignment) returning 500 instead of 201. Every other test in the file passed."
  severity: blocker
  test: 5
  root_cause: "INVESTIGATION INCONCLUSIVE. Could not reproduce despite an unusually thorough effort against current HEAD (proxy-service.ts unmodified since Phase 10-06): (1) direct in-process call to proxyService.assignDomain() against a real Postgres succeeded; (2) app.inject() with the exact test payload returned 201; (3) the fully unmodified test/integration/proxy.test.ts run 4x in a row against a real local Postgres, zero flakiness, 16/16 passed each time; (4) got a real dockerd running in the sandbox and reran the unmodified file through genuine Testcontainers spinning up a real postgres:17 container — the user's own exact reproduction path — 16/16 passed; (5) the full yarn workspace @docktor/server test:integration suite (all 5 files, real Testcontainers) passed 35/35, twice. Ruled out: the reviewer's own DI-wiring theory (application/index.ts passes the literal stackService singleton correctly bound); DockerExecutor mock bypass (prototype methods, vi.spyOn genuinely intercepts); stale @docktor/shared dist/ for assignDomainSchema (byte-identical to a fresh compile, unlike a DIFFERENT already-resolved gap in this same test file that WAS a stale-dist issue — see .planning/debug/resolved/assigning-a-domain-with-an-invalid-hostname-returns-400.md, a precedent worth knowing but not the cause here). Most likely explanations, in order: something host-specific to the user's own machine not reproducible in this sandbox (a different resolved dependency version — Prisma 7.4.0/@prisma/adapter-pg/pg 8.18.0/testcontainers 11.12.0 are all fairly new majors — or a one-off Docker/Testcontainers resource-contention hiccup on their host at that moment); less likely, a real regression that evaded every reproduction avenue tried. Important secondary finding: app.ts's envToLogger map sets test: false, disabling Fastify's logger entirely under NODE_ENV=test — so the catch-all 500 handler's app.log.error(error) prints nothing during test runs, which is why the original report had only a status code and why nobody can currently self-diagnose further without instrumentation. One structural note for whoever resumes this: StackService.deployStack() (stack-service.ts:316-325) has its findByIdOrThrow/guardTransition/initial transitionStatus(...DEPLOYING...) calls OUTSIDE the big try/catch starting at line 342 — the one place in the whole assignDomain -> syncServiceComposeProxy -> deployStack chain where an uncaught throw is structurally possible, though nothing was found that actually throws there against the test's fixtures."
  artifacts:
    - path: "server/src/app.ts"
      issue: "envToLogger sets test: false, disabling Fastify's logger under NODE_ENV=test — the catch-all 500 handler's app.log.error(error) prints nothing, which is why the real exception was never captured in the first place"
    - path: "server/src/application/stack-service.ts"
      issue: "deployStack() (lines 316-325) has its early guard/transition calls outside the try/catch starting at line 342 — the one structurally-possible uncaught-throw site in the traced chain, though nothing reproduced a throw there"
  missing:
    - "The actual server-side exception/stack trace from a live occurrence — needs either a one-off console.error(error) added to app.ts's catch-all branch, or NODE_ENV temporarily flipped so the logger isn't suppressed, on the user's own host where the 500 was originally observed"
    - "Confirmation of exact dependency versions resolved on the user's host (yarn.lock) vs. this sandbox, in case it's a version-specific interaction"
  debug_session: ".planning/debug/proxy-assign-domain-500-g10-4.md"

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
