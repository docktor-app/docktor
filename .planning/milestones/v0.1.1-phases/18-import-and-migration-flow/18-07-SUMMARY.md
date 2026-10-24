---
phase: 18-import-and-migration-flow
plan: 07
subsystem: api
tags: [fastify, ddd, self-stack, guard, brownfield, migration]

requires:
  - phase: 18-import-and-migration-flow
    provides: SelfStackPort and excludeOwnComposeFiles (18-01), MigrationService preflight/execute split (18-06), shared scan contract fixtures (18-09)
provides:
  - "isOwnComposeFile(composePath, ownPaths) pure domain rule on top of excludeOwnComposeFiles"
  - "own-stack-guard module: lookupOwnComposeFiles (fail-open) and assertNotOwnStack (BadRequestError)"
  - "MigrationService.preflight and OnboardingService.adoptInPlace refuse Docktor's own compose file"
  - "requireAdminAccount preHandler on POST /api/setup/migrate and /api/setup/migrate/preview"
affects: [18-11 already-managed refusal (goes right after the own-stack refusal), 18-14 setup operation-status routes (reuse requireAdminAccount)]

actuals:
  tokens: 9500
  tasks: 3
  commits: 6
plan_head_before: 8d2a42442f6201503eb1e1ef5be63c5ca27a178e
commits: 6
plan_head_after: 5ac3200afb62a708ea60927f3b49c64d87d5b03b

tech-stack:
  added: []
  patterns:
    - "One shared fail-open own-stack lookup for scan, adopt and migrate (D-03)"
    - "Route-level preHandler guard throwing a typed BadRequestError instead of an inline status literal"

key-files:
  created:
    - server/src/application/own-stack-guard.ts
  modified:
    - server/src/domain/self-stack-paths.ts
    - server/src/application/migration-service.ts
    - server/src/application/onboarding-service.ts
    - server/src/routes/setup.ts
    - server/test/unit/domain/self-stack-paths.test.ts
    - server/test/unit/application/migration-service.test.ts
    - server/test/unit/application/onboarding-service.test.ts
    - server/test/unit/routes/brownfield-routes.test.ts

key-decisions:
  - "Own-stack refusal sits in MigrationService.preflight directly after the empty-slug check, so it precedes the record-exists and target-directory checks and any stop"
  - "selfStack is the trailing defaulted constructor parameter of MigrationService so existing positional callers compile unchanged"
  - "requireAdminAccount throws BadRequestError; the global handler maps it to 400, so no HTTP status literal is added to the route"
  - "Requiring a full session on setup brownfield routes after admin creation stays out of scope (T-18-23, accepted)"

requirements-completed: [STK-03, MIG-04]

duration: 8min
completed: 2026-10-16
status: complete
---

# Phase 18 Plan 07: Own-stack refusal and setup migrate admin guard Summary

**Adopt and migrate now refuse Docktor's own compose file (400, before any read or stop) via one shared fail-open own-stack lookup, and the setup migrate routes answer 400 until an admin account exists.**

## Performance

- **Duration:** about 8 min
- **Started:** 2026-10-16T07:20Z
- **Completed:** 2026-10-16T07:28Z
- **Tasks:** 3 (all TDD: RED test commit then GREEN feat commit)
- **Files modified:** 9 (1 created)

## Accomplishments
- WR-09 closed: `migrate`/`preflight` and `adoptInPlace` throw `BadRequestError` for Docktor's own compose file before any stop, copy, read or record; a sibling compose file in the same directory and an unknown own stack (empty list or rejecting lookup, with a `console.warn`) behave as before (D-01, D-02).
- Scan, adopt and migrate share `lookupOwnComposeFiles`; the private duplicate in `OnboardingService` was removed (D-03).
- WR-03 closed: both setup migrate routes reject with 400 while `hasAnyUser()` is false, the 410 wizard-complete hook still runs first, and `/api/stacks/import/*` is unaffected.

## Task Commits

1. **Task 1 (tracer): migrating the own stack is refused** - `b09e980` (test), `0fe43ae` (feat)
2. **Task 2: adopting the own stack is refused, scan uses shared lookup** - `4d28391` (test), `b0ade54` (feat)
3. **Task 3: setup migrate/preview require an admin account** - `a20e40c` (test), `5ac3200` (feat)

**Plan metadata:** docs commit following this summary.

## TDD Gate Compliance

- RED, Task 1: 7 target tests failed on the planned behaviour (4 `isOwnComposeFile` cases with "is not a function"; own-stack migrate/preflight, backslash form, and the missing `console.warn` on lookup failure). Semantic assessment: failures are the planned assertions, not load errors.
- RED, Task 2: the two new adopt tests failed (own file not refused; no warn on rejecting lookup). The sibling-file test passed already (existing behaviour, a guard against over-blocking).
- RED, Task 3: the two "answers 400 and never reaches MigrationService" cases failed; the 410 ordering and import-family cases passed already because they pin unchanged behaviour.
- GREEN and RED commits present in order for every task; no REFACTOR commit needed. Tracer gate: Task 1 verify (domain, migration-service, layering tests) re-ran green before expansion.

## Files Created/Modified
- `server/src/application/own-stack-guard.ts` - `lookupOwnComposeFiles` (fail-open) and `assertNotOwnStack`
- `server/src/domain/self-stack-paths.ts` - `isOwnComposeFile`
- `server/src/application/migration-service.ts` - trailing `selfStack` port, refusal in `preflight`
- `server/src/application/onboarding-service.ts` - adopt refusal, scan uses shared lookup
- `server/src/routes/setup.ts` - `requireAdminAccount` preHandler on two routes
- four unit test files covering each of the above

## Decisions Made
See key-decisions in the frontmatter. No deviations in design from the plan.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. Verification: the six-file unit run from the plan's `<verification>` block passes (296 tests), and `tsc --noEmit -p .` in `server/` reports no errors.

## Left for CI
Per the project rule against heavy local runs, not executed here: `tsc --build`, server integration suite (`imports.test.ts`; no integration spec references `/api/setup/migrate`, so no spec change was needed), Playwright, and the Windows unit job.

## Known Stubs
None.

## Threat Flags
None. T-18-21 and T-18-22 are mitigated as planned; T-18-23 and T-18-24 remain accepted (recommend a follow-up GitHub issue, area:auth and area:server, for requiring the step-1 session on setup brownfield routes).

## Next Phase Readiness
Ready for 18-11 (already-managed refusal slots in right after `assertNotOwnStack`) and 18-14 (reuse `requireAdminAccount`).

## Self-Check: PASSED
