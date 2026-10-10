---
phase: 14-health-uptime-and-disk-visibility
plan: 11
subsystem: api
tags: [state-poller, docker-healthcheck, domain-events, reconcile]

requires:
  - phase: 14-health-uptime-and-disk-visibility
    provides: service.health_changed event, normalizeHealth / isHealthTransition, history subscriber (plan 14-01)
provides:
  - StatePoller.reconcile writes each container's real inspected Docker health and keeps the stored value when inspect fails
  - ContainerStateCatchUp keeps stored health on inspect failure and emits one service.health_changed per changed service
  - handleEvent 404 path records the health clear as a service.health_changed transition
affects: [14-12 incident tracking/pruning, 24 uptime, 23 notification criterion 4]

actuals:
  tokens: 5200
  tasks: 1
  commits: 1
plan_head_before: 9241a697da77e547f1e5a8ca79612dd678c730d2
plan_head_after: 470cb6799fbc07d8d45cc8f7b0b52c5628259b20

tech-stack:
  added: []
  patterns:
    - "Per-container observe step (inspect, persist, then emit) extracted into a private method so reconcile stays short"
    - "Inspect failure falls back to list summary state plus stored health, never to null"

key-files:
  created: []
  modified:
    - server/src/jobs/state-poller.ts
    - server/src/application/container-state-catch-up.ts
    - server/test/unit/jobs/state-poller.test.ts
    - server/test/unit/application/container-state-catch-up.test.ts

key-decisions:
  - "One private emitHealthTransition helper in StatePoller is shared by handleEvent (inspect and 404 paths) and reconcile, so all three apply the same write-before-emit, row-exists, normalized-change rule"
  - "reconcile derives the stack status from the first observed container per service, matching the previous find() semantics, while still writing every labelled container"
  - "A rejected inspect in reconcile is swallowed silently inside the observe step (no extra logging) and falls back to list state plus stored health; the per-project catch is reserved for failures that abort the project"

patterns-established:
  - "Health transitions are always emitted after the Service row write, and only for services that already have a row"

requirements-completed: ["#23"]

coverage:
  - id: D1
    description: "reconcile writes the real inspected health, derives HEALTHY/UNHEALTHY from it, and emits service.health_changed after the write only when health changed"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/state-poller.test.ts#reconcile (OBS-04) > real Docker health (#23, RESEARCH Finding 4)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A rejected inspect keeps the stored health, emits nothing, and reconcile continues with the next project; a steady UNHEALTHY stack emits no stack.status_changed so NotificationWatcher's timer is not cancelled"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/state-poller.test.ts#reconcile (OBS-04) > real Docker health (#23, RESEARCH Finding 4)"
        status: pass
    human_judgment: false
  - id: D3
    description: "handleEvent 404 path emits healthy -> null after the write (nothing when stored health was already null)"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/state-poller.test.ts#handleEvent — 404 path clears health (#23, D-12)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Catch-up keeps stored health on inspect failure, emits one service.health_changed per changed service after all writes and before container_state_changed, and records a missing container as healthy -> null"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "server/test/unit/application/container-state-catch-up.test.ts#health transitions (#23, D-12)"
        status: pass
    human_judgment: false

duration: ~10min
completed: 2026-10-08
status: complete
---

# Phase 14 Plan 11: Stable Docker health across reconcile and catch-up Summary

**The 60s StatePoller reconcile and the post-deploy catch-up now persist real Docker health (stored value kept on inspect failure) and record every observed transition as service.health_changed, so HEALTHY/UNHEALTHY stacks no longer flap to RUNNING**

## Performance

- **Duration:** ~10 min (start time not captured; estimated)
- **Completed:** 2026-10-08T08:38Z
- **Tasks:** 1
- **Files modified:** 4

## Accomplishments
- `StatePoller.reconcile` inspects each matched container in a private `observeContainer` step, writes the inspected state and health, and derives the stack status from those same observations. Services with no container keep the `exited` / `null` default.
- On a rejected inspect, reconcile falls back to the list summary state and the stored health of that service (never null), emits nothing, and carries on with the next project.
- `emitHealthTransition` (private) is the single rule for emitting `service.health_changed` (source `docker-healthcheck`) after the Service row write; it is used by the handleEvent inspect path, the handleEvent 404 branch (clear to null) and reconcile.
- `ContainerStateCatchUpRepo.findByComposeProject` services now carry `healthStatus`; `observe()` keeps the stored health on inspect failure; one `service.health_changed` per changed service is emitted after all writes and before the `container_state_changed` loop.
- The `stack.status_changed` / `stack.container_state_changed` payloads and emission conditions are untouched. A steady UNHEALTHY stack gets `updateStackStatus(..., "UNHEALTHY")` returning null, so no `stack.status_changed` is emitted and NotificationWatcher's UNHEALTHY timer survives (unit-asserted).

## Task Commits

1. **Task 1: Stable health state** - `470cb67` (fix)

_Tests were written first and confirmed failing (9 failures, RED) before the implementation; they landed in the same commit because CLAUDE.md forbids committing failing tests._

## Files Created/Modified
- `server/src/jobs/state-poller.ts` - `observeContainer`, `emitHealthTransition`, reconcile uses observations, 404 branch emits the clear
- `server/src/application/container-state-catch-up.ts` - widened repo port, stored health kept on inspect failure, health events after all writes
- `server/test/unit/jobs/state-poller.test.ts` - reconcile fixtures now carry stored health and a default `inspectContainer`; new reconcile and 404 cases
- `server/test/unit/application/container-state-catch-up.test.ts` - `givenStack` carries stored health; new health-transition cases

## Decisions Made
See `key-decisions` in the frontmatter. The pinned reconcile expectation (`healthStatus: null`) needed no edit: the new default `inspectContainer` fake resolves a healthless running container, so the inspected health is still null.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- The full `test:unit` run shows 4 failures in `git-executor.test.ts` (3) and `template-source-reader.test.ts` (1), all Windows git/temp-dir timing in infrastructure files this plan does not touch. Logged in `deferred-items.md`. All five verification files (315 tests) pass and `yarn typecheck` is clean.
- `eslint` is not installed in this workspace (noted in 14-01), so lint was not run.

## User Setup Required
None.

## Known Stubs
None.

## Threat Flags
None. No new endpoints, auth paths or schema; T-14-49 (one inspect per already-listed container, rejection falls back without retry) and T-14-50 (no flap, notification files untouched) are covered by unit tests and the empty `git diff --stat` gate.

## Next Phase Readiness
- Health state is stable across the 60s reconcile, so 14-12 (incident tracking/pruning) and the uptime work in #24 can rely on `ServiceHealthEvent` history that captures every Docker-health transition Docktor sees.

## Self-Check: PASSED

- Modified files exist; commit `470cb67` is an ancestor of HEAD.
- Verification: state-poller, catch-up, notification-watcher, stack-service and layering unit files 315/315; `yarn typecheck` exit 0.
- Acceptance: `grep -c inspectContainer server/src/jobs/state-poller.ts` = 4 (>= 2); `git diff --stat` for notification-watcher.ts, its test and stack-state-derivation.ts prints nothing.

---
*Phase: 14-health-uptime-and-disk-visibility*
*Completed: 2026-10-08*
