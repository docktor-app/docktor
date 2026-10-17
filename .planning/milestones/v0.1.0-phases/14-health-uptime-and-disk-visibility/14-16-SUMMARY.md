---
phase: 14-health-uptime-and-disk-visibility
plan: 16
subsystem: infra
tags: [health-probe, container-identity, docker, state-poller, redeploy, tdd, gap-closure]

requires:
  - phase: 14-health-uptime-and-disk-visibility
    provides: ServiceHealthService, probe ownership (D-07) and the container-state catch-up (14-09, 14-13, 14-15)
provides:
  - isReplacedContainer and probeOwnedHealth pure rules (D-07/D-08) in domain/service-health
  - ServiceHealthService drops a probe result whose containerId differs from the Service row (WR-01)
  - ServiceHealthService continues from the row when an observer reset it
  - post-deploy catch-up and StatePoller (start event, reconcile) reset a probe-owned service on a new container to `starting` (WR-05)
  - every StatePoller health transition attributed by ownership, including the 404 clear (WR-11)
affects: [14-17, phase-14-verification, incident tracking, notifications]

plan_head_before: 03d09233c326a857118db4ccf8c79e6b133d04aa
plan_head_after: ee390824161abb6914951354a4fcfe059e39809b

actuals:
  tokens: 13400
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "Pure ownership rules in the domain, called by every Docker observer, so one definition of 'a new container starts as starting'"
    - "Writer follows the row: probe state is trusted only while it agrees with the persisted Service row"

key-files:
  created:
    - server/test/unit/application/probe-container-identity.test.ts
    - server/test/unit/jobs/state-poller-probe-identity.test.ts
  modified:
    - server/src/domain/service-health.ts
    - server/src/application/container-state-catch-up.ts
    - server/src/application/service-health-service.ts
    - server/src/jobs/state-poller.ts
    - server/test/unit/domain/service-health.test.ts
    - server/test/unit/application/service-health-service.test.ts

key-decisions:
  - "A probe result is applied only when row.containerId === event.containerId; a null row id drops the result (nothing can be attributed)"
  - "Id-based reset applies only to a single-container service; a scaled service keeps its stored health (T-14-65)"
  - "Docker's start event resets a probe-owned service regardless of container id, because it fires for both a new container and a restart of the same one"
  - "ServiceHealthService seeds from the row whenever the remembered probe health disagrees with the stored health"

requirements-completed: ["#23", "#24"]

coverage:
  - id: D1
    description: "After a deploy-family operation a probe-owned service on a new container shows `starting` and its stack RUNNING; the old container's unhealthy value no longer carries over and the next probe decides"
    requirement: "#24"
    verification:
      - kind: unit
        ref: "server/test/unit/application/probe-container-identity.test.ts#never writes UNHEALTHY after the catch-up and lets the first probe of the new container decide"
        status: pass
      - kind: unit
        ref: "server/test/unit/application/probe-container-identity.test.ts#resets a probe-owned service on a new container to starting, derives RUNNING and records an http-probe transition"
        status: pass
    human_judgment: false
  - id: D2
    description: "A probe result for a replaced container (or a row with no container id) never reaches the Service row, history, stack status or events"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "server/test/unit/application/service-health-service.test.ts#drops a result for a container the row no longer describes (WR-01)"
        status: pass
      - kind: unit
        ref: "server/test/unit/application/probe-container-identity.test.ts#ignores a late result for the replaced container and then accepts the new container's"
        status: pass
    human_judgment: false
  - id: D3
    description: "StatePoller resets a probe-owned service to `starting` on Docker's start event and on a replaced single container in reconcile, and attributes the 404 clear to the probe"
    requirement: "#24"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/state-poller-probe-identity.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "A failed probe after a same-id restart never writes healthy (probe state follows the reset row)"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "server/test/unit/application/service-health-service.test.ts#continues from the row, not from remembered state, after an observer reset it on a same-id restart"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-07 behaviour preserved: unchanged container, scaled service, null stored id and non-owned services behave as before; the health-probe pipeline integration suite is green"
    verification:
      - kind: integration
        ref: "yarn workspace @docktor/server test:integration test/integration/health-probe.test.ts"
        status: pass
      - kind: unit
        ref: "server/test/unit/jobs/state-poller.test.ts and server/test/unit/application/container-state-catch-up.test.ts (unmodified)"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-10-09
status: complete
---

# Phase 14 Plan 16: Container identity for probe-owned health Summary

**A probe-owned service's health now always belongs to the running container: stale probe results are dropped by containerId (WR-01), every Docker observer resets a new or restarted container to `starting` (WR-05), and the 404 clear is attributed to the probe (WR-11).**

## Performance

- **Duration:** about 12 min (start time was not captured at the very start; estimated from the first read to the last commit)
- **Completed:** 2026-10-09T06:33Z
- **Tasks:** 3 (1 tracer, 2 auto), all TDD with separate RED and GREEN commits
- **Files modified:** 8 (2 created, 6 modified)

## Accomplishments

- Two pure domain rules, `isReplacedContainer` and `probeOwnedHealth`, with the file still import-free.
- The post-deploy catch-up writes `starting` (null when not running) for a probe-owned service whose single container id changed, derives RUNNING, and records an `http-probe` transition. Tracer verified end to end: after the catch-up the stack never goes UNHEALTHY, and the first probe of the new container turns it HEALTHY.
- `ServiceHealthService.applyProbeResult` returns early when `row.containerId !== event.containerId`, so a result queued for a replaced container cannot write the old id, history or health. `advance()` seeds from the row when the remembered health disagrees with it.
- StatePoller applies the same reset on Docker's `start` event and in `reconcile` (single replaced container only), and picks the history source by ownership at every call site, including the container-gone (404) branch.

## Task Commits

1. **Task 1: Redeploy end to end (tracer)**
   - RED `f92a421` (test)
   - GREEN `84f8f40` (feat)
2. **Task 2: Apply a result only to the container it was taken from**
   - RED `a12aa1d` (test)
   - GREEN `7dda8e0` (feat)
3. **Task 3: StatePoller start event, reconcile and 404 attribution**
   - RED `ef05fa3` (test)
   - GREEN `ee39082` (feat)

**Plan metadata:** committed separately as `docs(14-16): complete container identity plan`.

## Files Created/Modified

- `server/src/domain/service-health.ts` - `isReplacedContainer`, `probeOwnedHealth` (D-07/D-08).
- `server/src/application/container-state-catch-up.ts` - repo port widened with `containerId`; replaced-container reset; ownership-chosen history source.
- `server/src/application/service-health-service.ts` - containerId guard; row-following `advance()`.
- `server/src/jobs/state-poller.ts` - `ServiceState.containerId`, start-event and reconcile resets, `healthSource` helper, `emitHealthTransition(..., source)`.
- `server/test/unit/application/probe-container-identity.test.ts` - catch-up cases and the end-to-end redeploy proof over a real `ContainerStateCatchUp` and `ServiceHealthService` sharing one in-memory world.
- `server/test/unit/jobs/state-poller-probe-identity.test.ts` - start event, reconcile and 404 cases.
- `server/test/unit/application/service-health-service.test.ts`, `server/test/unit/domain/service-health.test.ts` - new cases plus the intended fixture alignment (below).

## Decisions Made

- The containerId guard drops a result for a row with a null container id: Docktor does not know the current container, so nothing can be attributed. HealthProbeJob never probes such a row.
- The id-based reset is limited to a single-container service. A scaled service has no single identity, and resetting on alternating replica ids would flap (T-14-65).
- The `start` event resets without comparing ids, because Docker emits it for both a new container and a restart of the same one, which are D-08's two cases.
- When probe memory and the row disagree, the row wins. Without this, a same-id restart reset to `starting` could be overwritten by a failed probe carrying a remembered `healthy`.

## Intended WR-01 semantic change: service-health-service.test.ts fixtures

The containerId guard changes the contract, so the pre-existing fixtures in `service-health-service.test.ts` were aligned (this is the intended change, not a deviation):

- The `createWorld` default row and every explicit row paired with a default event now use `containerId: "c1"`; the two-service concurrency case gives each row its event's id (`cw`, `cd`).
- The world's `updateServiceState` also persists `containerId`, like the real repository.
- The "container id changed" case moves the world row to `c2` before the `c2` result arrives.
- No pre-existing `expect(...)` line was removed or rewritten (checked against the RED commit diff).

## Deviations from Plan

None - plan executed exactly as written.

One addition within the plan's scope: a second WR-01 case in `service-health-service.test.ts` (a successful 200 for the replaced container), because the planned 503 case passes by coincidence on a single failure and would not have failed before the fix.

## Issues Encountered

- The full `test:unit` run shows 4 failures in `git-executor.test.ts` (3) and `template-source-reader.test.ts` (1). These are the Windows git/temp-dir timing failures already recorded in `deferred-items.md` (14-01, 14-11). They touch none of this plan's files and every file this plan changed passes.
- `yarn lint`/eslint cannot run: the repo has no `eslint.config.*` file for ESLint 10. Typecheck (`tsc --build`) is the gate used and reports zero errors.
- A heredoc-based Python edit was rejected by the shell once; the patch was rerun from a script file with no effect on the result.

## Verification

- Unit: domain service-health, probe-container-identity, container-state-catch-up, service-health-service, probe-notification-preservation, probe-result-subscriber, health-probe, state-poller, state-poller-probe-identity, notification-watcher, incident-subscriber and layering all green. Pre-existing `container-state-catch-up.test.ts` and `state-poller.test.ts` are unmodified and pass.
- `yarn typecheck`: zero errors.
- Integration: `test/integration/health-probe.test.ts` 4/4 passed (the documented Postgres block did not apply, so no unrun-verify entry is needed).
- Acceptance greps: 2 exported rules and 0 imports in service-health.ts; `probeOwnedHealth` 3x and `"http-probe"` in the catch-up; `row.containerId !== event.containerId` 1x and `seedProbeState` 3x in service-health-service.ts; `probeOwnedHealth` 3x, `isReplacedContainer` 2x, `"http-probe"` 1x in state-poller.ts; `stack-state-derivation.ts` and `notification-watcher.ts` untouched.

## Known Stubs

None.

## Threat Flags

None. Mitigations T-14-62 to T-14-65 are implemented and covered by tests; no new endpoint, auth path or schema was added.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 14-VERIFICATION.md gap 2 (WR-01, WR-05) and WR-11 are closed in code and tests; phase re-verification can confirm.
- Ready for 14-17.

## Self-Check: PASSED

- Created files exist: probe-container-identity.test.ts, state-poller-probe-identity.test.ts.
- Commits `f92a421`, `84f8f40`, `a12aa1d`, `7dda8e0`, `ef05fa3`, `ee39082` are ancestors of HEAD; measured count 6 from the persisted ledger base.

---
*Phase: 14-health-uptime-and-disk-visibility*
*Completed: 2026-10-09*
