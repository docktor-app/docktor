---
phase: 18-import-and-migration-flow
plan: 01
subsystem: api
tags: [docker, compose, brownfield-scan, onboarding, fast-glob, vitest]

requires:
  - phase: 10-architecture-hardening
    provides: BrownfieldScannerPort, OnboardingService.scan shared by setup and imports routes
provides:
  - Pure self-stack-paths domain module (label/mount mapping, exact-file exclusion)
  - SelfStackPort and fail-open DockerSelfStack adapter (5s inspect timeout)
  - OnboardingService.scan hides Docktor's own compose file (STK-03)
  - Scanner ignore entry for pre-migration-backup/ (protects the 18-03 backup location)
affects: [18-02, 18-03, 18-04, 18-05, import-flow, setup-wizard]

actuals:
  tokens: 12500
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Fail-open self-detection: any unknown means exclude nothing, no heuristic fallback"
    - "Pure domain path rules over path.posix, fed plain data by an infrastructure adapter"

key-files:
  created:
    - server/src/domain/self-stack-paths.ts
    - server/src/application/ports/self-stack-port.ts
    - server/src/infrastructure/docker-self-stack.ts
    - server/test/unit/domain/self-stack-paths.test.ts
    - server/test/unit/infrastructure/docker-self-stack.test.ts
  modified:
    - server/src/application/onboarding-service.ts
    - server/src/infrastructure/probe-transport.ts
    - server/src/infrastructure/brownfield-scanner.ts
    - server/test/unit/application/onboarding-service.test.ts
    - server/test/unit/infrastructure/brownfield-scanner.test.ts

key-decisions:
  - "Own-stack exclusion is exact compose-file equality, matched through Docktor's own bind mounts plus the identical path (D-01)"
  - "Lookup is fail-open at two levels, adapter and service (D-02); no container-name or image heuristic"
  - "Filter lives in OnboardingService.scan so setup and imports routes behave identically without route changes (D-03)"
  - "Exclusion is silent: skippedDirectories is not changed and no hidden-row note is added"

patterns-established:
  - "Trailing optional constructor port with a singleton default keeps existing positional constructions compiling"

requirements-completed: [STK-03]

coverage:
  - id: D1
    description: "A scan through OnboardingService with the real DockerSelfStack adapter drops Docktor's own compose file (resolved via /host mount) and keeps other stacks"
    requirement: STK-03
    verification:
      - kind: unit
        ref: "server/test/unit/application/onboarding-service.test.ts#scan excludes Docktor's own stack (STK-03, #13)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Label/mount mapping, comma lists, working-dir resolution, Windows separators and same-directory siblings staying offered"
    requirement: STK-03
    verification:
      - kind: unit
        ref: "server/test/unit/domain/self-stack-paths.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Fail-open when Docktor cannot identify its own container (not containerized, inspect rejects, labels or mounts missing, faulty port)"
    requirement: STK-03
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/docker-self-stack.test.ts"
        status: pass
      - kind: unit
        ref: "server/test/unit/application/onboarding-service.test.ts#scan excludes Docktor's own stack (STK-03, #13)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A pre-migration-backup directory is never offered as an importable stack"
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/brownfield-scanner.test.ts#should exclude pre-migration-backup directories from scan"
        status: pass
    human_judgment: false
  - id: D5
    description: "Behaviour inside a real Docktor container with a real dockerd (actual label and mount shapes)"
    verification: []
    human_judgment: true
    rationale: "Unit tests use fake inspect results; the real Docker label and mount shapes are only exercised in a deployed container (CI integration covers the fail-open path only)"

plan_head_before: 43ade9989750c0b3735c351d3330fe4f5f77c8c1
plan_head_after: a3702a5e0b9f2a2eacb365ef1b25f0154ba9ef97

duration: 4min
completed: 2026-10-14
status: complete
---

# Phase 18 Plan 01: Hide Docktor's own stack from the import scan Summary

**Brownfield scan drops Docktor's own compose file by inspecting its own container labels and mapping them through bind mounts, fail-open, plus a scanner ignore for `pre-migration-backup/`**

## Performance

- **Duration:** 4 min
- **Started:** 2026-10-14T19:10:01Z
- **Completed:** 2026-10-14T19:14:23Z
- **Tasks:** 3
- **Files modified:** 10 (5 created, 5 modified)

## Accomplishments
- `OnboardingService.scan` filters the scanner result through a new `SelfStackPort`, so the setup wizard and the post-setup import page both stop offering Docktor's own stack (STK-03, #13) with no route changes.
- `DockerSelfStack` inspects Docktor's own container (5s abort timeout), reads the Compose `config_files` and `working_dir` labels, and maps host paths through its bind mounts (host `/` at `/host`, or identical paths). Every failure mode yields an empty list, so every stack is listed.
- The scanner ignores `**/pre-migration-backup/**`, so the backup copy plan 18-03 writes can never be offered as a duplicate importable stack (#72, D-08).

## Task Commits

1. **Task 1: tracer, scan drops own compose file end-to-end** - `8a86766` (test, RED) then `5e8b23f` (feat, GREEN)
2. **Task 2: mapping edge cases and fail-open pinned by tests** - `0ad373b` (test)
3. **Task 3: pre-migration-backup never offered** - `a3702a5` (feat; its test was written and seen failing first, committed together)

**Plan metadata:** committed separately (docs: complete plan)

## Files Created/Modified
- `server/src/domain/self-stack-paths.ts` - pure `containerVisiblePaths`, `ownComposeFileCandidates`, `excludeOwnComposeFiles`, `toComparablePath`
- `server/src/application/ports/self-stack-port.ts` - `SelfStackPort.composeFilePaths()`
- `server/src/infrastructure/docker-self-stack.ts` - fail-open adapter and `dockerSelfStack` singleton
- `server/src/infrastructure/probe-transport.ts` - `createDefaultSelf` exported (no behaviour change)
- `server/src/application/onboarding-service.ts` - trailing `selfStack` ctor param, filtered `scan()`
- `server/src/infrastructure/brownfield-scanner.ts` - ignore entry for `pre-migration-backup`
- Tests: `self-stack-paths.test.ts`, `docker-self-stack.test.ts` (new); `onboarding-service.test.ts`, `brownfield-scanner.test.ts` (extended)

## Decisions Made
- Followed the plan's D-01/D-02/D-03 as specified. The service returns the scanner's result object by reference when the own list is empty, so the pre-existing `toBe(scanResult)` assertions still hold.
- `file-watcher.ts` is untouched: it watches depth 2 from the stacks root, and `<id>/pre-migration-backup/docker-compose.yml` sits at depth 3, so the backup copy is not picked up there.

## Deviations from Plan

None - plan executed exactly as written. Environment-only notes (not code deviations):
- `yarn` is not on PATH in this checkout, so the plan's `yarn workspace @docktor/server vitest run ...` commands were run as `../node_modules/.bin/vitest run --project unit --coverage.enabled=false <files>` from `server/`, which is the same runner and files.
- `server/src/generated/prisma` was missing (gitignored), so `prisma generate --config prisma/prisma.config.ts` was run once. Nothing from it is committed.

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered
- Task 3's RED/GREEN pair landed in one commit (test written first and observed failing, then implemented) instead of a separate `test` commit. The plan only requires the test-first ordering for Task 1, which was committed separately.

## Deferred to CI
Per the project memory rule (no heavy local actions on the VPS), these were not run locally:
- Full `tsc --build` type check (the new files were only exercised through vitest/esbuild, which does not type-check)
- Server integration tests, including `POST /api/stacks/import/scan` (expected to keep listing its stack through the fail-open path)
- The Windows unit CI job (the domain uses `path.posix` and comparisons normalise backslashes)
- Client and Playwright suites (no client change in this plan)

## Known Stubs

None.

## Threat Flags

None. The only new surface is a read-only Docker inspect of Docktor's own container, already covered by T-18-01 to T-18-04.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- 18-03 can write `<newStack>/pre-migration-backup/` without the scanner re-offering it.
- Targeted unit run: 6 files, 278 tests passed (self-stack-paths, docker-self-stack, onboarding-service, brownfield-scanner, probe-transport, layering).

## Self-Check: PASSED

---
*Phase: 18-import-and-migration-flow*
*Completed: 2026-10-14*
