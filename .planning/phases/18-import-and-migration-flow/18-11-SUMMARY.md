---
phase: 18-import-and-migration-flow
plan: 11
subsystem: api
tags: [fastify, ddd, zod, brownfield-import, gap-closure, vitest]

requires:
  - phase: 18-import-and-migration-flow
    provides: "own-stack-guard (assertNotOwnStack) in preflight/adoptInPlace (18-07) and the shared scan contract (18-09)"
provides:
  - "Pure findManagingStack/annotateManagedStacks matcher (one Docktor stack per directory)"
  - "StackRepository.listLocations() and shared assertNotManaged (ConflictError, 409)"
  - "managedStack ({id, displayName} | null) on every scanned row (shared contract)"
  - "adopt and migrate refuse an already-managed compose path before any side effect"
affects: [18-13, 18-14, import page, setup wizard]

actuals:
  tokens: 14000
  tasks: 3
  commits: 5
plan_head_before: 996440e182cf404a537266b991c86d280c39693b
commits: 5
plan_head_after: fd17ff65524e1c7a1f96f043fac32db20931db3b

tech-stack:
  added: []
  patterns:
    - "Scanner port returns un-annotated rows (ScannedStack); OnboardingService.scan adds the managedStack annotation, since only the application layer knows Docktor's records"
    - "Guards run in a fixed order: own stack (400, fail-open) before already-managed (409)"

key-files:
  created:
    - server/src/domain/managed-stack-paths.ts
    - server/src/application/managed-stack-guard.ts
    - server/test/unit/domain/managed-stack-paths.test.ts
  modified:
    - server/src/repositories/stack-repository.ts
    - server/src/application/migration-service.ts
    - server/src/application/onboarding-service.ts
    - server/src/application/ports/brownfield-scanner-port.ts
    - server/src/infrastructure/brownfield-scanner.ts
    - shared/src/validation/brownfield.ts
    - shared/test/unit/validation/brownfield.test.ts
    - server/test/unit/application/migration-service.test.ts
    - server/test/unit/application/onboarding-service.test.ts
    - server/test/integration/imports.test.ts
    - client/test/unit/components/domain/stack/brownfield-import.test.tsx
    - client/test/unit/routes/setup/migration-wizard.test.tsx
    - client/test/integration/setup-wizard.spec.ts
    - client/test/integration/stacks-import.spec.ts

key-decisions:
  - "A compose file is managed when its directory equals a stack's hostPath after separator normalisation and trailing-slash stripping; exact, case-sensitive; a sibling compose file in a managed directory counts as managed"
  - "Scan rows are always annotated (managedStack null when unmanaged), so scan results no longer keep object identity with the scanner's result; tests updated deliberately"
  - "The scanner port gets ScannedStack/DirectoryScanResult types (Omit managedStack) because the filesystem scanner cannot know Docktor's records"

requirements-completed: [STK-03]

coverage:
  - id: D1
    description: "Migrating a compose file in a managed stack's directory is refused with a ConflictError (409) in preflight, before anything is stopped or created"
    requirement: STK-03
    verification:
      - kind: unit
        ref: "server/test/unit/application/migration-service.test.ts#already-managed refusal (G-18-2)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Adopting such a compose file is refused with a ConflictError before the file is read or a record created"
    requirement: STK-03
    verification:
      - kind: unit
        ref: "server/test/unit/application/onboarding-service.test.ts#adoptInPlace (BF-03)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every scanned row carries managedStack (ref or null); managed stacks stay listed; own-stack exclusion still runs first and fails open"
    requirement: STK-03
    verification:
      - kind: unit
        ref: "server/test/unit/application/onboarding-service.test.ts#scan marks already-managed stacks (G-18-2)"
        status: pass
      - kind: unit
        ref: "shared/test/unit/validation/brownfield.test.ts#scan result schemas"
        status: pass
    human_judgment: false
  - id: D4
    description: "Real-DB path (adopt, rescan marks managed, re-adopt 409, migrate 409, only one stack exists)"
    requirement: STK-03
    verification:
      - kind: integration
        ref: "server/test/integration/imports.test.ts#marks an adopted stack as managed on the next scan"
        status: unknown
    human_judgment: false

duration: 18min
completed: 2026-10-16
status: complete
---

# Phase 18 Plan 11: Already-managed stack detection Summary

**Pure directory matcher plus shared `assertNotManaged` guard: scan rows carry `managedStack`, and adopt/migrate of a directory Docktor already manages is refused with a 409 before any side effect.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-10-16T07:22:00Z
- **Completed:** 2026-10-16T07:41:00Z
- **Tasks:** 3
- **Files modified:** 17

## Accomplishments

- `findManagingStack`/`annotateManagedStacks` in `server/src/domain/managed-stack-paths.ts` (pure, tested for trailing separators, backslashes, sibling compose files, prefix and parent directories).
- `StackRepository.listLocations()` (id, displayName, hostPath only) and `assertNotManaged` in `application/managed-stack-guard.ts`, wired into `MigrationService.preflight` and `OnboardingService.adoptInPlace` directly after the own-stack refusal.
- `OnboardingService.scan` runs scanner, own-stack lookup and `listLocations` in parallel, drops own rows, then annotates every remaining row; shared `discoveredStackSchema` gains a required nullable `managedStack`.
- Integration test and all client fixtures extended; the UI itself reads the field in plan 18-13.

## Task Commits

1. **Task 1 (tracer): migrate refuses a managed stack** - `fcc4f14` (test, RED), `8d2bce9` (feat, GREEN)
2. **Task 2: scan annotation and adopt refusal** - `af44eec` (test, RED), `45ef081` (feat, GREEN)
3. **Task 3: integration coverage and fixtures** - `fd17ff6` (test)

**Plan metadata:** docs commit following this summary.

## TDD Notes

- RED (Task 1): the migration-service ConflictError test failed with "promise resolved instead of rejecting"; the matcher tests failed on assertions against a null-returning stub (the stub was included in the RED commit so the target tests fail on the planned assertions rather than on an import error). Semantic assessment: correct assertions, intended reason.
- RED (Task 2): the shared schema tests failed with "expected true to be false", scan tests on missing/extra `managedStack`, adopt test failed because the call proceeded instead of throwing ConflictError. The TAP-format `check tdd-red-evidence` classifier was not run (vitest default reporter output was inspected manually).
- GREEN: all listed unit files pass. REFACTOR: none needed.

## Decisions Made

See `key-decisions` above. Server scan now needs the database (`listLocations`) in addition to the filesystem; a database failure fails the scan, which is acceptable since every other import path already requires it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test builder used an invalid compatibility value**
- **Found during:** Task 2
- **Issue:** `discoveredStack()` in onboarding-service.test.ts used `compatibility: "compatible"`, not part of the `green|yellow|red` enum it is typed against.
- **Fix:** Changed to `"green"` while retyping the builder to `ScannedStack`.
- **Files modified:** server/test/unit/application/onboarding-service.test.ts
- **Committed in:** af44eec

**2. [Rule 3 - Blocking] Existing own-stack scan tests asserted unannotated rows**
- **Found during:** Task 2
- **Issue:** The 18-07 own-stack scan tests compared against raw scanner rows (`toEqual(stacks)`); rows are always annotated now.
- **Fix:** Added an `unmanaged()` test helper and updated those expectations (extension of the deliberate contract change the plan names for the identity tests).
- **Files modified:** server/test/unit/application/onboarding-service.test.ts
- **Committed in:** af44eec

---

**Total deviations:** 2 auto-fixed (1 bug in test data, 1 blocking test expectation)
**Impact on plan:** Test-only; no scope creep.

## Issues Encountered

None. `server` and `client` `tsc --noEmit -p .` were clean (these include `src` only).

## Left for CI

Not executed locally per the shared-VPS rule: server integration (`server/test/integration/imports.test.ts`), Playwright specs (`setup-wizard.spec.ts`, `stacks-import.spec.ts`), full `tsc --build`, Windows unit job.

## Known Stubs

None.

## Threat Flags

None. T-18-31 mitigated (guard in preflight and adoptInPlace before any read, stop or write); T-18-32 accepted as planned.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 18-13: the client can read `managedStack` on scan rows to disable Adopt/Migrate and link to the managing stack.

## Self-Check: PASSED

- Created files exist: managed-stack-paths.ts, managed-stack-guard.ts, managed-stack-paths.test.ts.
- Commits fcc4f14, 8d2bce9, af44eec, 45ef081, fd17ff6 are ancestors of HEAD.
- Acceptance greps: findManagingStack/annotateManagedStacks exports (2), `async listLocations(` (1), `assertNotManaged` export (1) and call sites in both services (1 each), `managedStack` in shared schema (>=2), `Omit<DiscoveredStack` in port (1), `managedStack: null` counts (3/1/1) and 409 count (2) in test files.

---
*Phase: 18-import-and-migration-flow*
*Completed: 2026-10-16*
