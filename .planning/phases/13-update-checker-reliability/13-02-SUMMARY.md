---
phase: 13-update-checker-reliability
plan: 02
subsystem: api
tags: [docker, state-poller, sse, fastify, vitest, container-state, tdd]

requires:
  - phase: 13-update-checker-reliability
    provides: plan 01 moving-tag dialog (no code dependency; wave ordering only)
provides:
  - Pure shared stack-status derivation (deriveStackStatus, TRANSITIONAL_STATES, isTransitionalStatus) in server/src/domain/stack-state-derivation.ts
  - ContainerStateCatchUp application service that reads real container state from Docker and broadcasts per-service container_state_changed events
  - StackService.finishOperation as the single exit from DEPLOYING/UPDATING for deployStack, updateImages and upgradeServiceImage
affects: [13-update-checker-reliability, state-poller, stack-service, live-state-sse]

actuals:
  tokens: 13264
  tasks: 2
  commits: 4
plan_head_before: f47d4ce78a810d7858c102d24356db58ff911462
plan_head_after: 58095bbd9d0fb16bd11b8630453d966d1422c4dc

tech-stack:
  added: []
  patterns:
    - "Observed-state derivation is a pure domain function shared by the poller and the application catch-up"
    - "Narrow application port (StackStateCatchUp) injected as the 10th StackService dependency, same style as DeployPreflight"
    - "Best-effort post-action refresh that never rejects (try/catch inside the catch-up, plus a second guard in finishOperation)"

key-files:
  created:
    - server/src/domain/stack-state-derivation.ts
    - server/src/application/container-state-catch-up.ts
    - server/test/unit/domain/stack-state-derivation.test.ts
    - server/test/unit/application/container-state-catch-up.test.ts
  modified:
    - server/src/jobs/state-poller.ts
    - server/src/application/stack-service.ts
    - server/src/application/index.ts
    - server/src/repositories/stack-repository.ts
    - server/test/unit/application/stack-service.test.ts

key-decisions:
  - "D-09: StatePoller and the catch-up share one deriveStackStatus in domain/; state-poller.test.ts passes unmodified"
  - "finishOperation also swallows a catch-up rejection (logged), so a misbehaving catch-up port can never push a successful deploy into its ERROR catch"
  - "Pitfall 2 kept intentional: on a failure branch the catch-up may replace the just-set ERROR with the status derived from real containers, exactly as the 60s reconcile would; the action's failure result, Deployment record and ERROR log entry are untouched"
  - "A service with no container after the operation is written exited/null/null and still emits its own event (Pitfall 3); no optimistic running placeholder"

patterns-established:
  - "Deploy-family exits go through finishOperation; stop/restart keep calling transitionStatus directly"

requirements-completed: ["#34"]

coverage:
  - id: D1
    description: "A successful deploy, update or upgrade writes each service's real container state, derives the stack status with the shared rule and emits one container_state_changed per service before the request returns"
    requirement: "#34"
    verification:
      - kind: unit
        ref: "server/test/unit/application/container-state-catch-up.test.ts#ContainerStateCatchUp happy path"
        status: pass
      - kind: unit
        ref: "server/test/unit/application/stack-service.test.ts#post-operation container state catch-up (#34)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every failure branch of deploy/update/upgrade also runs the catch-up while the action still reports failure with its original error, Deployment record and ERROR log entry"
    requirement: "#34"
    verification:
      - kind: unit
        ref: "server/test/unit/application/stack-service.test.ts#post-operation container state catch-up (#34) > deployStack/updateImages/upgradeServiceImage failure cases"
        status: pass
    human_judgment: false
  - id: D3
    description: "Stop, restart, idempotent no-op upgrade and guard-rejected requests never run the catch-up; the catch-up skips stacks owned by another operation, vanished stacks and stacks with no services, and never rejects"
    requirement: "#34"
    verification:
      - kind: unit
        ref: "server/test/unit/application/container-state-catch-up.test.ts#guards, never rejects"
        status: pass
      - kind: unit
        ref: "server/test/unit/application/stack-service.test.ts#post-operation container state catch-up (#34) > stop and restart"
        status: pass
    human_judgment: false
  - id: D4
    description: "StatePoller behaviour is unchanged after extracting the derivation to the domain layer"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/state-poller.test.ts (unmodified)"
        status: pass
      - kind: unit
        ref: "server/test/unit/domain/stack-state-derivation.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "In a live deployment a second open tab (stack list or dashboard) shows the redeployed services' real container states within seconds of a deploy/update/upgrade finishing, without a reload"
    requirement: "#34"
    verification: []
    human_judgment: true
    rationale: "Multi-tab live SSE behaviour against a real Docker host is not asserted by any unit test; it is the manual UAT item in 13-VALIDATION.md and must run on a host without unrelated production containers (STATE.md 05.1-03 incident)."

duration: 13min
completed: 2026-10-07
status: complete
---

# Phase 13 Plan 02: Post-Deploy Container State Catch-Up Summary

**Deploy, update and upgrade now read each service's real container state from Docker and broadcast per-service container_state events the moment they leave DEPLOYING/UPDATING, via a shared domain-layer status derivation, instead of leaving services at "unknown" for up to 60s.**

## Performance

- **Duration:** about 13 min (start time approximated; it was not captured at launch)
- **Started:** 2026-10-07T07:00:00Z (approximate)
- **Completed:** 2026-10-07T07:13:00Z
- **Tasks:** 2
- **Files modified:** 9 (4 created, 5 modified)

## Accomplishments

- Extracted `deriveStackStatus`, `TRANSITIONAL_STATES` and `isTransitionalStatus` from `jobs/state-poller.ts` into the pure `domain/stack-state-derivation.ts`. StatePoller now imports them, and its unchecked `as any` health cast became the typed `info.State.Health?.Status ?? null`. `state-poller.test.ts` is untouched and green.
- Added `ContainerStateCatchUp`, which lists containers for the stack's compose project, inspects each service's container and writes per-service state. It derives the stack status once and then emits one `stack.container_state_changed` per Service row, in row order. The status-log entry rides on the first event only. All writes complete before any event is emitted.
- Added `StackService.finishOperation` (transition, then catch-up) and routed all 10 DEPLOYING/UPDATING exits through it: deployStack 3, updateImages 3, upgradeServiceImage 4. stopStack, restartStack, the idempotent no-op upgrade and guard rejections never call it.
- Hardened the catch-up. It skips vanished stacks, stacks with zero services and stacks another operation has moved into a transitional status. A missing container becomes exited/null/null. A failed inspect falls back to the list summary state. The whole body is wrapped so it never rejects.
- Widened `StackRepository.updateServiceState`'s `containerId` to `string | null`, matching the nullable column.

## Task Commits

TDD cycle per task (RED test commit, then GREEN implementation commit):

1. **Task 1: tracer, shared derivation, catch-up happy path, deployStack success exit**
   - RED `b4145b0` (test): derivation tests, catch-up happy-path tests and the deployStack ordering test failed on the planned assertions.
   - GREEN `d58b7d8` (feat): implemented the derivation module, the catch-up and `finishOperation`, and wired it in `index.ts`.
2. **Task 2: every deploy-family exit and the catch-up edge cases**
   - RED `fefbcd5` (test): 21 target tests failed.
   - GREEN `58095bb` (feat): routed the remaining exits, added the guards and fallbacks, and widened the repo port.

**Plan metadata:** committed separately as `docs(13-02): complete post-deploy catch-up plan`.

## TDD Gate Compliance

RED evidence, assessed by inspecting the vitest output (the plan is `type: execute`, so the plan-level gate classifier was not run):

- **Task 1 RED:** the stack-service ordering test failed on the planned assertion (`expected "vi.fn()" to be called 1 times, but got 0 times`). The derivation and catch-up test files failed to load because their modules did not exist yet, which is the expected pre-implementation state for new modules. Every other test in the touched files stayed green.
- **Task 2 RED:** 21 tests failed on their planned assertions. Examples: no catch-up call on each failure branch, nothing written for a transitional-status stack, no resolve when `listContainers` rejects, and no exited default for a missing container. Tests that already held (ERROR-to-RUNNING overwrite, idempotent double run) passed, as expected, because the Task 1 happy path already satisfied them.
- GREEN: all targeted suites pass; REFACTOR was not needed.

## Files Created/Modified

- `server/src/domain/stack-state-derivation.ts` - pure status derivation plus the transitional-status set and predicate
- `server/src/application/container-state-catch-up.ts` - `ContainerStateCatchUp` service and its narrow repo port
- `server/src/jobs/state-poller.ts` - consumes the shared derivation; typed health read
- `server/src/application/stack-service.ts` - `StackStateCatchUp` port, 10th constructor dependency, `finishOperation`, 10 routed exits
- `server/src/application/index.ts` - `containerStateCatchUp` singleton, passed to `StackService`
- `server/src/repositories/stack-repository.ts` - `updateServiceState` accepts a nullable `containerId`
- `server/test/unit/domain/stack-state-derivation.test.ts`, `server/test/unit/application/container-state-catch-up.test.ts`, `server/test/unit/application/stack-service.test.ts` - new and extended unit tests

## Decisions Made

- `finishOperation` guards the catch-up call with its own try/catch in addition to the catch-up's internal one. Without it, a rejecting catch-up port on the success branch would throw into deployStack's surrounding catch and wrongly flip a successful deploy to ERROR (T-13-07).
- The failure-branch overwrite of ERROR stays as the plan specifies (Pitfall 2), since reconcile converges there within 60s anyway.

## Deviations from Plan

None - plan executed exactly as written. Two minor implementation notes, neither a rule deviation:

- The new stack-service cases live in one nested `describe("post-operation container state catch-up (#34)")` with a sub-describe per method, rather than being spread across the existing method describes. This keeps the shared ordering helpers in one place.
- The compose-edit failure branch of `upgradeServiceImage` cannot be reached with real compose content (`getServiceImageTag` and `setServiceImageTag` validate identically). The test reaches it through a delegating partial `vi.mock` of `lib/compose-editor.js` that overrides `setServiceImageTag` once.

**Total deviations:** 0

## Issues Encountered

- Pre-existing and out of scope (logged in `deferred-items.md`):
  - `yarn typecheck` reports errors from a stale generated Prisma client (`templateRepoUrl`, `deployWarnings` and `templateRepo` are missing from the generated types) and from missing client packages (`@uiw/react-codemirror` and `@codemirror/*`). None are in lines touched by this plan; `application/index.ts(94,64)` is the pre-existing `TemplateUpdateService` argument error, shifted from line 88 by this plan's added lines.
  - The full server unit run shows 4 failures in `git-executor.test.ts` and `template-source-reader.test.ts`, which this plan does not touch.
- All suites relevant to this plan pass: derivation, catch-up, stack-service, state-poller, proxy-service and layering (326 tests).

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Next Phase Readiness

- Ready for 13-03. The phase PR body should carry `Closes #34`.
- Manual UAT still owed for D5 (live multi-tab behaviour), per 13-VALIDATION.md. Run it on a host without unrelated production containers.

## Self-Check: PASSED

- Created files exist: `stack-state-derivation.ts`, `container-state-catch-up.ts` and both new test files.
- Commits `b4145b0`, `d58b7d8`, `fefbcd5` and `58095bb` are ancestors of HEAD.
- Acceptance greps: `finishOperation` appears 11 times in `stack-service.ts`, `containerId: string | null` appears in `stack-repository.ts`, and `state-poller.test.ts` has no diff.

---
*Phase: 13-update-checker-reliability*
*Completed: 2026-10-07*
