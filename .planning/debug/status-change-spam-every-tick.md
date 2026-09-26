---
status: diagnosed
trigger: "G-10-3 (10-UAT.md test 3): \"I regularly get the following message: 'Received status change: stackId=docktor-proxy status=RUNNING', it appears always directly after the state poller. The issue is that the status before was also RUNNING. I think this is a bug.\""
created: "2026-09-25T20:54:58Z"
updated: "2026-09-25T20:54:58Z"
---

## Current Focus

hypothesis: CONFIRMED - see Resolution
test: n/a (goal: find_root_cause_only)
expecting: n/a
next_action: return ROOT CAUSE FOUND to caller

## Symptoms

expected: A notification "status change" is only received/processed when a stack's status actually changed, not on every poll tick.
actual: Every ~60s StatePoller reconcile tick, `[NotificationWatcher] Received status change: stackId=docktor-proxy status=RUNNING` logs even though the stack was already RUNNING before the tick.
errors: None - spurious/duplicate log + trivial reprocessing, not a crash.
reproduction: Leave server running with a stable (non-transitioning) stack; watch console every StatePoller cron tick (60s); the log line reappears every tick regardless of any real change.
started: Not a regression - present in the earliest captured commit (pre-Phase-10 squash checkpoint) and unchanged through the Phase 10 refactor. Long-standing.

## Eliminated

- hypothesis: "Phase 10 event-bus migration (D-04/D-15/D-18) dropped a status-comparison check that the pre-refactor StateBroadcaster/state-poller had."
  evidence: |
    Diffed the current `state-poller.ts` reconcile() (lines 289-357) against the pre-Phase-10
    version captured at commit 3718e3f (the earliest available squash checkpoint, predates
    f288508 "migrate event-driven jobs onto WatcherJob" and 6f4dcb9 "the four job publishers
    emit domain events" - the two Phase 10 commits that touched this file). The reconcile()
    method's status-update-then-broadcast logic is byte-identical between the two versions:
    both discard the return value of `repo.updateStackStatus(...)` and unconditionally call
    `broadcaster.publish(...)` / `bus.emit(...)` afterward. Also diffed pre/post NotificationWatcher
    (3718e3f's `handleStateEvent` vs current `handleStatusChange`): both unconditionally log
    "Received event/status change" and run the same active-incident bookkeeping for every event
    received, with no dedup against the previous status in either version. The repository's
    `updateStackStatus()` (stack-repository.ts:277-311) already had its "if (fromStatus ===
    status) return null" short-circuit at 3718e3f too - this signal existed pre-refactor and was
    already being ignored by reconcile() pre-refactor.
  timestamp: "2026-09-25T20:54:58Z"

- hypothesis: "This causes actual notification spam (emails / persisted notification rows) for a steady-state RUNNING stack."
  evidence: |
    Read NotificationWatcher.handleStatusChange() in full (notification-watcher.ts:77-139). The
    RUNNING/HEALTHY/STOPPED branch (lines 131-138) only clears any pending unhealthy timer and
    deletes the stackId from `activeIncidents` - it never calls `this.notificationService.notify(...)`
    for these statuses. `notify()` is only called from the ERROR branch (on first entry, deduped
    by `active.has("error")`) and from the UNHEALTHY branch's 120s timer (deduped by
    `active.has("unhealthy")` / `unhealthyTimers.has(stackId)`). So the repeated RUNNING event
    produces the console.log line and cheap no-op Map operations only - no persisted notification
    row, no email. Confirmed via grep that `stack.status_changed` has exactly two subscribers in
    the whole codebase: NotificationWatcher and state-broadcast-subscriber.ts (SSE forwarding) -
    no third consumer creates a notification row off this event.
  timestamp: "2026-09-25T20:54:58Z"

## Evidence

- timestamp: "2026-09-25T20:54:58Z"
  checked: server/src/jobs/state-poller.ts reconcile() (lines 289-357)
  found: |
    Line 345: `await repo.updateStackStatus(stack.id, derivedStatus)` - return value discarded
    (not assigned to a variable). Line 349: `this.bus.emit("stack.status_changed", {stackId:
    stack.id, status: derivedStatus})` - called unconditionally on every tick for every known
    stack, with no comparison against the stack's previous status. Contrast with handleEvent()
    (lines 267-286) in the same file, which DOES capture the return value
    (`const statusLog = await repo.updateStackStatus(...)`) and uses it (`...(statusLog && {...})`)
    to gate the statusLog sub-field on the container_state_changed event - the pattern exists in
    the file already, just not applied to reconcile()'s status_changed emit.
  implication: reconcile() ignores an already-available change-detection signal.

- timestamp: "2026-09-25T20:54:58Z"
  checked: server/src/repositories/stack-repository.ts updateStackStatus() (lines 277-311)
  found: |
    `if (fromStatus === status) return null` (line 289) - the repository already detects "no
    real change" and short-circuits: no DB write, returns null. Only a genuine transition writes
    the stack row + creates a statusLog row and returns the statusLog.
  implication: The dedup signal reconcile() needs already exists and is one `if` check away -
    reconcile() just needs to capture updateStackStatus()'s return value and skip the
    `bus.emit("stack.status_changed", ...)` call when it's null, mirroring the existing
    `statusLog &&` pattern used one function up in the same file.

- timestamp: "2026-09-25T20:54:58Z"
  checked: server/src/application/subscribers/state-broadcast-subscriber.ts (full file)
  found: |
    Also forwards `stack.status_changed` unconditionally with no dedup (lines 35-42) - every
    tick's emit reaches the SSE stream too, not just NotificationWatcher. This matches 10-UAT.md
    test 2's own note: "periodic stack_status heartbeats every ~60s (StatePoller reconcile tick)"
    was observed on the SSE stream and recorded as pass ("events fire and look sane, nothing
    wrong observed") - the SSE side is exposed to the identical redundant-emit problem, it's just
    less noticeable there (a heartbeat-shaped SSE event vs. a duplicate literal console.log line)
    and wasn't reported as a defect on that test.
  implication: The root cause is upstream of both consumers - fixing it at the source
    (state-poller.ts's reconcile()) fixes both the notification-log noise and the SSE heartbeat
    redundancy in one change, rather than needing a fix duplicated into each consumer.

- timestamp: "2026-09-25T20:54:58Z"
  checked: git history - server/src/jobs/state-poller.ts and server/src/jobs/notification-watcher.ts
    at commit 3718e3f (earliest available squash checkpoint, predates all Phase 10 commits)
  found: |
    reconcile()'s discard-then-unconditionally-broadcast pattern and NotificationWatcher's
    unconditional-log-and-process pattern are both already present verbatim at 3718e3f. Phase 10's
    two touching commits (f288508, 6f4dcb9) only restructured the transport (cron-in-class ->
    WatcherJob base class; single StateBroadcaster.publish -> per-domain-event bus.emit; single
    filtered subscribe -> two typed subscribes) - the actual change-detection logic (or lack of
    it) was carried over unchanged.
  implication: Not a Phase 10 regression. Pre-existing bug carried forward faithfully by the
    refactor (consistent with D-18's stated goal of preserving identical event shapes/behavior).

## Resolution

root_cause: |
  server/src/jobs/state-poller.ts reconcile() (line 345) discards the return value of
  `repo.updateStackStatus(stack.id, derivedStatus)` and then unconditionally emits
  `stack.status_changed` (line 349) on every 60s cron tick for every known stack, regardless of
  whether the derived status actually differs from the stack's previous status. The repository
  method (stack-repository.ts:277-311) already computes and acts on this exact comparison
  internally (`if (fromStatus === status) return null`, skipping the DB write) - the signal
  reconcile() needs is already being returned and simply isn't consulted before emitting. This is
  a category: code bug (a discarded-return-value / missing-guard logic error), not config,
  environment, or data - single root cause, no AND-gate (one code change at one call site
  explains the full observed symptom).

fix: (not applied - goal: find_root_cause_only)
verification: (not applicable - goal: find_root_cause_only)
files_changed: []
