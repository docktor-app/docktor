---
phase: 18-import-and-migration-flow
plan: 25
subsystem: server
tags: [migration, state-poller, docker-labels, gap-closure, directory-identity]
requires:
  - phase: 18-import-and-migration-flow
    provides: identifyLabel and DirectoryIdentityPort (18-22); per-project ordered handleEvent/reconcileProject (18-23)
provides:
  - Pure compose label helper (label names, composeProjectDirectory)
  - StackContainerMatcher.belongsTo, attributing a container to a stack by compose directory via canonical identity
  - StatePoller events and reconcile, and the post-deploy catch-up, ignore same-project containers of another directory
affects: [G-18-22-status, MIG-04, 18-26]
actuals:
  tokens: 14000
  tasks: 2
  commits: 4
plan_head_before: 0205378e76ff45ce89f20bda4e44919da6062322
plan_head_after: c2593722178bf7a9de6114f3e88d83cc77f0bb7e
commits: 4
tech-stack:
  added: []
  patterns:
    - "Application matcher injected as trailing constructor parameter with a singleton default"
    - "Fail-open to the project-only rule for unlabelled containers and unknown own mounts"
key-files:
  created:
    - server/src/domain/compose-labels.ts
    - server/src/application/stack-container-matcher.ts
    - server/test/unit/domain/compose-labels.test.ts
    - server/test/unit/application/stack-container-matcher.test.ts
    - server/test/unit/jobs/state-poller-stack-ownership.test.ts
  modified:
    - server/src/jobs/state-poller.ts
    - server/src/application/container-state-catch-up.ts
    - server/test/unit/application/container-state-catch-up.test.ts
key-decisions:
  - "A container belongs to a stack only when its compose directory (working_dir, else dirname of first absolute config_files entry) is the stack's directory by relateDirectories === same"
  - "No location label, or mountsKnown false on either identity, keeps today's project-only rule so no stack silently loses containers"
  - "reconcileProject filters before counting, so a service whose only container is the old copy counts as exited"
requirements-completed: [MIG-04]
status: complete
---

# Phase 18 Plan 25: Container-to-stack attribution by directory Summary

A migrated stack's status and service rows now reflect only its own containers: a same-project container left running from the old directory is ignored by live events, the 60 s reconcile and the post-deploy catch-up (G-18-22-status, matching half).

## What was done

- **Task 1 (tracer, TDD):** `state-poller-stack-ownership.test.ts` was written and committed first (RED: the matcher module did not exist). Then `domain/compose-labels.ts` (label names and `composeProjectDirectory`), `application/stack-container-matcher.ts` (`StackContainerMatcher.belongsTo`, singleton `stackContainerMatcher`) and the StatePoller wiring: `StackWithServices.hostPath`, a trailing `matcher` constructor parameter, and an early return in `handleEvent` (after the transitional skip, before inspect) with a log line of stack id, short container id and reason only.
- **Task 2 (TDD):** tests for compose-labels, the matcher (host view, container view with `/host` and same-path mounts, unknown mounts), reconcile and catch-up were committed first (RED: 2 reconcile tests and 1 catch-up test failed). Then `reconcileProject` filters the project's containers through a private `ownContainersOf` before counting and observing (logs a skipped count only), and `ContainerStateCatchUp` takes the matcher as a fifth constructor parameter (default applies in `application/index.ts`), filters after the project filter, and imports the label names from `domain/compose-labels.ts` instead of local constants. The 18-22 `identifyLabel` and 18-23 per-project lock in `dispatch`/`reconcileProject` are preserved.

## Verification

- `vitest run --project unit --coverage.enabled=false` over compose-labels, stack-container-matcher, state-poller-stack-ownership, state-poller, state-poller-event-stream, container-state-catch-up, probe-container-identity and layering: 8 files, 284 tests passed. state-poller-probe-identity.test.ts (named in Task 1 verify) passed too in the Task 1 run (5 files, 244 tests).
- Acceptance greps: `belongsTo(` appears 2x in state-poller.ts and 1x in container-state-catch-up.ts; `compose-labels.js` 1x in the catch-up; both new test files exist; the `test(18-25)` commit precedes the first `feat(18-25)` commit.
- Not run, per project memory: full `tsc --build`, integration tests and Playwright (CI). `health-probe.test.ts` integration builds a StatePoller with the real repository and is CI-only.
- Human re-test still required: 18-UAT.md test 8 with the old stack left running under a different project name (allowed after 18-26).

## Deviations from Plan

None - plan executed exactly as written. Note: the per-plan commit ledger (protocol 0c) was not created before the first commit, so `plan_head_before` was taken as the parent of the first plan commit (`0205378`, HEAD at plan start); `git rev-list --count 0205378..c259372` gives 4.

## Known Stubs

None.

## Threat Flags

None. The change narrows which containers write state (T-18-74, T-18-75 mitigated; T-18-77: logs carry the stack id, short container id and counts, never label paths).

## Self-Check: PASSED

- FOUND: server/src/domain/compose-labels.ts, server/src/application/stack-container-matcher.ts, server/test/unit/domain/compose-labels.test.ts, server/test/unit/application/stack-container-matcher.test.ts, server/test/unit/jobs/state-poller-stack-ownership.test.ts
- FOUND commits: 4ed91f4 (test), 277afb2 (feat), 48cd530 (test), c259372 (feat)
