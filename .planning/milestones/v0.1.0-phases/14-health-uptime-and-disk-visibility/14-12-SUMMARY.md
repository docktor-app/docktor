---
phase: 14-health-uptime-and-disk-visibility
plan: 12
subsystem: api
tags: [incidents, keyed-lock, domain-events, interval-job, retention-pruning, prisma]
requires:
  - phase: 14-health-uptime-and-disk-visibility
    provides: plan 14-04 StackIncidentRepository.findInWindow, UptimeService, windowStartFor, GET /api/stacks/:id/uptime and SettingsService.getHealthSettings
  - phase: 14-health-uptime-and-disk-visibility
    provides: plan 14-01 ServiceHealthEventRepository and the fourth registerDomainSubscribers registration
  - phase: 14-health-uptime-and-disk-visibility
    provides: plan 14-02 jobs/index.ts with DiskUsageJob registered last
provides:
  - decideIncidentAction, a pure D-11 open/keep/close rule
  - StackIncidentRepository.findOpen/open/resolve/deleteResolvedBefore
  - IncidentTracker, a per-stack keyed-lock, cached, idempotent StackIncident writer that never rejects
  - subscribeIncidentTracking on stack.status_changed and stack.container_state_changed, registered fifth in registerDomainSubscribers
  - ServiceHealthEventRepository.deleteCreatedBefore
  - HealthHistoryPruner, a daily IntervalJob (30 0 * * *, also on start) registered before DiskUsageJob
affects: [14-07 stack Overview incident list, 14-13, phase 14 verification]

actuals:
  tokens: 8200
  tasks: 2
  commits: 2
plan_head_before: 792ce91ea0020697e175dfff46ceaff0a7e85d3a
plan_head_after: e1ebcc59c04dee3e9306783918082723362c311b

tech-stack:
  added: []
  patterns:
    - "State-based, idempotent bus subscriber (decide from current state, not from transitions), mirroring NotificationWatcher"
    - "withKeyedLock with a prefixed key (incident:<stackId>) so it never queues behind ProxyService locks on the bare stack id"
    - "Plain create instead of upsert for a table whose unique key contains a nullable column (NULLs are distinct in Postgres)"
    - "Prune job whose retention read is never caught, so a failed read rejects the run instead of deleting"

key-files:
  created:
    - server/src/domain/incident-tracking.ts
    - server/src/application/incident-tracker.ts
    - server/src/application/subscribers/incident-subscriber.ts
    - server/src/jobs/health-history-pruner.ts
    - server/test/unit/domain/incident-tracking.test.ts
    - server/test/unit/application/incident-tracker.test.ts
    - server/test/unit/application/incident-subscriber.test.ts
    - server/test/unit/jobs/health-history-pruner.test.ts
  modified:
    - server/src/repositories/stack-incident-repository.ts
    - server/src/repositories/service-health-event-repository.ts
    - server/src/application/subscribers/register.ts
    - server/src/application/index.ts
    - server/src/jobs/index.ts
    - server/test/unit/application/subscriber-registration.test.ts
    - server/test/unit/jobs/index.test.ts
    - server/test/integration/uptime.test.ts

key-decisions:
  - "StatusLog is NOT pruned (D-11 over RESEARCH A9): it also feeds the activity timeline, so the pruner deletes only ServiceHealthEvent rows and resolved StackIncident rows"
  - "StackIncident.open is a plain create, never an upsert on the (stackId, triggerType, resolvedAt) unique: NULL resolvedAt values are distinct, so that key can never match an open row; serialisation per stack is the guard instead"
  - "The incident lock key is incident:<stackId>, not the bare stack id, to avoid queueing behind ProxyService operations"
  - "A write failure invalidates the stack's cached open incident and is logged; the tracker never rejects because bus listeners must not throw (Phase 10 D-17)"
  - "The retention read in HealthHistoryPruner is never wrapped in try/catch or defaulted, so a broken settings read can never trigger a deletion"
  - "STOPPED closes an incident (an intentional stop is not downtime, D-09); transitional statuses leave an open incident untouched"

patterns-established:
  - "Incident tracking is an additional subscriber only: NotificationWatcher, deriveStackStatus and the stack.status_changed / stack.container_state_changed payloads are unchanged (#23 success criterion 4)"

requirements-completed: ["#24"]

coverage:
  - id: D1
    description: "Every UNHEALTHY/ERROR episode of a stack is recorded as exactly one StackIncident: opened on entry, kept open across UNHEALTHY and ERROR flips, resolved on RUNNING, HEALTHY or STOPPED, and listed by GET /api/stacks/:id/uptime"
    requirement: "#24"
    verification:
      - kind: unit
        ref: "server/test/unit/domain/incident-tracking.test.ts#decideIncidentAction (D-11)"
        status: pass
      - kind: unit
        ref: "server/test/unit/application/incident-tracker.test.ts#IncidentTracker.observeStackStatus (D-11)"
        status: pass
      - kind: integration
        ref: "server/test/integration/uptime.test.ts#records one incident per episode from status events and closes it on recovery"
        status: pass
    human_judgment: false
  - id: D2
    description: "Concurrent status events for one stack never produce two open incidents (keyed lock, find-open-then-create)"
    requirement: "#24"
    verification:
      - kind: unit
        ref: "server/test/unit/application/incident-tracker.test.ts#opens exactly one incident for five concurrent UNHEALTHY observations"
        status: pass
      - kind: integration
        ref: "server/test/integration/uptime.test.ts#never opens two incidents for back-to-back container-state events"
        status: pass
    human_judgment: false
  - id: D3
    description: "Incident tracking is wired as the fifth domain subscriber on both stack status events and is disposed with the others"
    requirement: "#24"
    verification:
      - kind: unit
        ref: "server/test/unit/application/incident-subscriber.test.ts"
        status: pass
      - kind: unit
        ref: "server/test/unit/application/subscriber-registration.test.ts#registers the incident tracker for both stack status events, after the service-health history subscriber"
        status: pass
    human_judgment: false
  - id: D4
    description: "A daily HealthHistoryPruner deletes ServiceHealthEvent rows created before the window start and StackIncident rows resolved before it; open incidents and all StatusLog rows survive; a failed retention read deletes nothing; it is registered before DiskUsageJob"
    requirement: "#24"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/health-history-pruner.test.ts"
        status: pass
      - kind: unit
        ref: "server/test/unit/jobs/index.test.ts#prints a started line naming all eleven jobs, in registration order, on a successful boot (G-10-1)"
        status: pass
      - kind: integration
        ref: "server/test/integration/uptime.test.ts#deletes aged-out health events and resolved incidents but keeps open incidents and every StatusLog row"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-10-08
status: complete
---

# Phase 14 Plan 12: Incident Tracking and Retention Pruning Summary

**One StackIncident per UNHEALTHY/ERROR episode written by a per-stack keyed-lock IncidentTracker fed from the domain-event bus, plus a daily HealthHistoryPruner that trims ServiceHealthEvent and resolved incidents to the retention window while leaving StatusLog alone**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-08T13:08:51Z
- **Completed:** 2026-10-08T13:14:42Z
- **Tasks:** 2
- **Files modified:** 16 (8 created, 8 modified)

## Accomplishments
- The write side of 14-04's incident list now exists: a stack entering UNHEALTHY or ERROR opens exactly one incident, which stays open across flips between the two and resolves on RUNNING, HEALTHY or STOPPED. The incident appears in `GET /api/stacks/:id/uptime` with `endedAt` and `durationMs` once resolved.
- Concurrent status events for one stack are serialised with `withKeyedLock("incident:<stackId>")` and a cached open incident, so five back-to-back events produce one row (proved in both a unit test with the real lock and an integration test through the real bus and database).
- A daily `HealthHistoryPruner` keeps the Phase 14 history within the configured window. Its retention read is unguarded so a failure rejects the run before any delete.
- Existing behavior is untouched: `notification-watcher.ts`, `stack-state-derivation.ts`, `state-poller.ts` have no diff, and the event payloads are unchanged.

## Task Commits

1. **Task 1: Incident tracking** - `69f4714` (feat)
2. **Task 2: Retention pruning** - `e1ebcc5` (feat)

**Plan metadata:** recorded in the docs commit that follows this summary.

## Files Created/Modified
- `server/src/domain/incident-tracking.ts` - pure `decideIncidentAction` (open/close/none)
- `server/src/repositories/stack-incident-repository.ts` - `findOpen`, `open` (plain create), `resolve`, `deleteResolvedBefore`
- `server/src/application/incident-tracker.ts` - `IncidentTracker.observeStackStatus`, keyed lock, open-incident cache, never rejects
- `server/src/application/subscribers/incident-subscriber.ts` - `subscribeIncidentTracking` for both status events
- `server/src/application/subscribers/register.ts` and `server/src/application/index.ts` - fifth registration and `incidentTracker` construction
- `server/src/repositories/service-health-event-repository.ts` - `deleteCreatedBefore`
- `server/src/jobs/health-history-pruner.ts` - `HealthHistoryPruner` and `healthHistoryPruner`
- `server/src/jobs/index.ts` - registered immediately before `diskUsageJob`
- `server/test/...` - unit tests for each new module, updated registration and jobs index tests, and uptime integration cases for incident tracking and pruning

## Decisions Made
- **For the phase verifier: StatusLog is intentionally not pruned.** D-11 keeps StatusLog as the activity timeline's source, which takes precedence over RESEARCH A9. The pruner touches only `ServiceHealthEvent` and resolved `StackIncident` rows, and an integration test proves the StatusLog row count is unchanged after a prune.
- `open()` is a plain `create`, not an upsert, because the compound unique contains a nullable `resolvedAt` and Postgres treats NULLs as distinct (RESEARCH Finding 6).
- Lock keys are prefixed (`incident:`) to stay independent of ProxyService's bare-stackId locks.
- `triggerType` keeps the entering status for the whole episode (RESEARCH A11), so an UNHEALTHY-to-ERROR flip does not change the recorded cause.

## Deviations from Plan

None - plan executed exactly as written.

Task commits each hold the tests with their implementation (one `feat` commit per task, matching the earlier Phase 14 plans) rather than separate RED and GREEN commits, since the plan is `type: execute`.

## Issues Encountered
- The full `test:unit` run reports 2 failures in `server/test/unit/infrastructure/git-executor.test.ts` ("pull on second sync", "re-clone fallback"; 5s timeouts on a Windows temp checkout). These are pre-existing, unrelated to this plan's files, and already recorded in `deferred-items.md` by 14-01 and 14-11. Every other file (95 of 96, 1606 of 1608 tests) passes.

## Known Stubs

None.

## Threat Flags

None. The only new surface is in-process (a bus subscriber) and scheduled deletes driven by the stored retention value, both covered by T-14-32 and T-14-33 in the plan's threat model.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Incidents now appear in the uptime incident list that 14-07's Overview already renders, so the server half of #24 is complete together with 14-04.
- No blockers.

## Self-Check: PASSED

- Created files verified present: incident-tracking.ts, incident-tracker.ts, incident-subscriber.ts, health-history-pruner.ts and their four unit test files.
- Commits `69f4714` and `e1ebcc5` are ancestors of HEAD; `git rev-list --count 792ce91..HEAD` was 2 before this summary.
- Acceptance criteria: `withKeyedLock` and `incident:` present in incident-tracker.ts; `stackIncident.create` count 1; `subscribeIncidentTracking` count 2 in register.ts; no diff in notification-watcher.ts, stack-state-derivation.ts, state-poller.ts; last `jobRegistry.register(` is still `diskUsageJob` with `healthHistoryPruner` before it; `deleteCreatedBefore` and `deleteResolvedBefore` each appear once.
- Plan verification: Task 1 and Task 2 unit commands (193 and 156 tests), the uptime integration suite (19 tests) and `yarn typecheck` (zero errors) all pass.

---
*Phase: 14-health-uptime-and-disk-visibility*
*Completed: 2026-10-08*
