---
phase: 17-backup-repository-and-port-check-fixes
plan: 02
subsystem: server
tags: [ports, preflight, ddd, domain, docker-proxy]
requires: []
provides:
  - "isPublishedByDeployingStack: tier-3 self-exclusion in resolvePortConflicts keyed on the deploying stack's own running containers"
affects: []
tech-stack:
  added: []
  patterns: ["self-exclusion kept in the pure domain function; PortConflictService unchanged"]
key-files:
  created: []
  modified:
    - server/src/domain/port-conflicts.ts
    - server/test/unit/domain/port-conflicts.test.ts
    - server/test/unit/application/deploy-preflight-service.test.ts
    - server/test/unit/application/port-conflict-service.test.ts
key-decisions:
  - "Own listening sockets are recognised through the stack's own running containers (compose project = stack id): tier-3 listeners on a (port, protocol) pair one of them publishes are dropped (D-06)"
  - "Exclusion lives in the pure domain function so PortConflictService and all exported types stay unchanged"
  - "When container listing fails, no exclusion can apply and the docker-proxy listener still warns (advisory degraded mode, pinned by a test)"
requirements-completed: [STK-01, STK-02]
status: complete
duration: 15min
completed: 2026-10-14
commits: 3
plan_head_before: accb27903bf33420d39dda3a1a6f9ddfcc96dfd8
plan_head_after: 216ba38516849aa47e1a840cecd7a441f3274dc2
actuals:
  tokens: 6000
  tasks: 2
  commits: 3
---

# Phase 17 Plan 02: Port check ignores the stack's own ports Summary

Tier 3 of `resolvePortConflicts` now skips listeners whose (port, protocol) pair is published by one of the deploying stack's own running containers, so a redeploy no longer warns about `docker-proxy` holding the stack's own ports (issue #76), while other stacks, other containers and external processes still produce a warning naming the holder.

## What was built

- `server/src/domain/port-conflicts.ts`: new private `isPublishedByDeployingStack(listener, input)` and a `continue` at the top of the `resolveListenerHolder` loop. Tiers 1 and 2, `TIER_RESOLVERS` order and every exported type are untouched. Module header and tier-3 doc comments describe the own-socket rule.
- Tests at three levels: domain (`port-conflicts.test.ts`), service (`port-conflict-service.test.ts`), and deploy preflight with a real `PortConflictService` (`deploy-preflight-service.test.ts`).

## Tasks and commits

| Task | Commit | Type |
|------|--------|------|
| 1 RED: own-port tests (domain x2, preflight x1) | 3e2b123 | test |
| 1 GREEN: tier-3 self-exclusion (tracer) | ffd8ef3 | fix |
| 2: boundary tests (real conflicts still warn) | 216ba38 | test |

Task 1 failed first with exactly the three expected tests (docker-proxy reported as a process holder, unidentified listener reported as `unknown`, preflight returned a conflict) before the fix. Task 2 tests passed on the Task 1 implementation, so `port-conflicts.ts` needed no further change in Task 2.

## Verification

`corepack yarn workspace @docktor/server vitest run --project unit test/unit/domain/port-conflicts.test.ts test/unit/application/deploy-preflight-service.test.ts test/unit/application/port-conflict-service.test.ts`: 3 files, 34 tests, all passing. Full typecheck and remaining suites are left to CI per project memory. Tracer gate: the automated verify was re-run end-to-end after the tracer commit and passed before Task 2.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Built `@docktor/shared` so the preflight test file could load**
- **Found during:** Task 1 (RED run)
- **Issue:** `deploy-preflight-service.test.ts` imports `ComposeReviewService`, which imports `@docktor/shared`; `shared/dist` did not exist in this checkout, so the file reported 0 tests ("Failed to resolve entry for package @docktor/shared").
- **Fix:** ran `yarn workspace @docktor/shared build` (small, light `tsc` of the shared workspace). Output is gitignored; no tracked file changed.
- **Files modified:** none tracked
- **Commit:** none

Otherwise: plan executed as written. Vitest was run with coverage disabled (`--coverage.enabled=false`) after the first run, because the coverage provider logs unrelated parse noise for some source files.

## Threat Model

T-17-07 (over-broad exclusion) mitigated: exclusion keys on exact (port, protocol) pairs of the deploying stack's own containers only; Task 2 tests pin different protocol, unpublished port, other stack, non-Docktor container, external process, and no-running-container cases. T-17-06 accepted as planned.

## Known Stubs

None.

## Self-Check: PASSED
