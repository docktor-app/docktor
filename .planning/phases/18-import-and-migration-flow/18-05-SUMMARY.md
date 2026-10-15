---
phase: 18-import-and-migration-flow
plan: 05
subsystem: ui
tags: [react, vitest, playwright, dialog, switch, migration, accessibility]

requires:
  - phase: 18-import-and-migration-flow
    provides: plan 18-03 migrate endpoints validating backup and stopOldStack via the shared MigrationExecuteInput schema
  - phase: 18-import-and-migration-flow
    provides: plan 18-04 widened dialog shell with the real-diff review step
provides:
  - Four-step migration dialog (Select data, Review changes, Backup, Old stack) ending in a single Confirm & Migrate
  - Default-on backup and stop-old-stack switches with off-state warnings and a read-only step-4 summary
  - ConfirmMigrateParams and both executeMigration clients carrying backup and stopOldStack, typed by the shared MigrationExecuteInput
  - Step indicator, focus management, stale-preview guard and 44px rows in the dialog shell
  - Toasts that name the kept backup and stopped old stack, and show the server rollback message verbatim
affects: [import-flow, setup-wizard, verify-work]

plan_head_before: 744b2cc505c2c394fc56610c755c09d0f59c0348
plan_head_after: 34dfea698a43425579496b27432b0af447a6d36d

actuals:
  tokens: 14000
  tasks: 3
  commits: 7

tech-stack:
  added: []
  patterns:
    - "Dialog shell orchestrates one section component per step (select, review, backup, old stack) plus a pure indicator"
    - "Step transitions typed with PREVIOUS_STEP / NEXT_STEP records instead of numeric casts"
    - "Request-id ref guards async preview responses against cancel/close"

key-files:
  created:
    - client/src/routes/setup/components/migration-backup-step.tsx
    - client/src/routes/setup/components/migration-old-stack-step.tsx
    - client/src/routes/setup/components/migration-step-indicator.tsx
    - client/src/routes/setup/components/migration-select-step.tsx
    - client/test/unit/components/domain/stack/brownfield-import.test.tsx
  modified:
    - client/src/routes/setup/components/migration-wizard.tsx
    - client/src/components/domain/stack/brownfield-import.tsx
    - client/src/lib/setup-api.ts
    - client/src/lib/import-api.ts
    - client/test/unit/routes/setup/migration-wizard.test.tsx
    - client/test/integration/setup-wizard.spec.ts

key-decisions:
  - "Step transitions use PREVIOUS_STEP/NEXT_STEP lookup records so the 1|2|3|4 union is never widened by a cast"
  - "The zero-volume note in the step-4 summary sits below the dl (a p inside a dl is invalid HTML) so each row's text is exactly 'Label: value'"
  - "Success toast spreads description only when non-empty, so the options object has no description key when neither backup nor stop was chosen"
  - "Stale-preview guard is a request-id ref bumped on every request, on close/cancel, when open turns false and on unmount"

patterns-established:
  - "Switch rows: flex min-h-11 items-start gap-3 md:min-h-0 with Label htmlFor and aria-describedby helper text"

requirements-completed: [MIG-03, MIG-04, MIG-01]

coverage:
  - id: D1
    description: "Steps 3 and 4 expose default-on backup and stop-old-stack switches whose values reach executeMigration as backup and stopOldStack (on/on and off/off)"
    requirement: MIG-03
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/stack/brownfield-import.test.tsx#sends backup and stopOldStack as true by default and closes the dialog"
        status: pass
      - kind: unit
        ref: "client/test/unit/components/domain/stack/brownfield-import.test.tsx#sends backup and stopOldStack as false when both switches are turned off"
        status: pass
    human_judgment: false
  - id: D2
    description: "Declining the backup or the stop shows the UI-SPEC warning (no backup / ports can conflict)"
    requirement: MIG-04
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/stack/brownfield-import.test.tsx#warns on step 3 when the backup switch is off"
        status: pass
      - kind: unit
        ref: "client/test/unit/components/domain/stack/brownfield-import.test.tsx#warns on step 4 when the stop switch is off"
        status: pass
    human_judgment: false
  - id: D3
    description: "Step indicator, focus move, selection/toggle retention across Back, stale-preview guard, summary (incl. zero-volume note) and single hand-off/close"
    requirement: MIG-03
    verification:
      - kind: unit
        ref: "client/test/unit/routes/setup/migration-wizard.test.tsx#four-step flow"
        status: pass
    human_judgment: false
  - id: D4
    description: "Toasts: start, success description naming backup/stop, verbatim server failure message and the generic fallback"
    requirement: MIG-04
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/stack/brownfield-import.test.tsx#toasts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Dialog fits a 360px viewport with the diff visible on step 2 and Confirm & Migrate in view on step 4; Playwright flow walks four steps and asserts the sent flags"
    requirement: MIG-01
    verification:
      - kind: e2e
        ref: "client/test/integration/setup-wizard.spec.ts#Migration wizard flow"
        status: unknown
    human_judgment: true
    rationale: "Playwright (chromium and mobile-chromium) was not run locally per the no-heavy-actions rule; CI must be green before /gsd-verify-work. Visual quality at 360px is a human judgment"

duration: 8min
completed: 2026-10-15
status: complete
---

# Phase 18 Plan 05: Migration Dialog Backup and Old-Stack Steps Summary

**Four-step migration dialog with default-on backup and stop-old-stack switches, a recap before the single Confirm & Migrate, and both choices sent to the server through the shared `MigrationExecuteInput`.**

## Performance

- **Duration:** about 8 min
- **Started:** 2026-10-15T07:27:00Z
- **Completed:** 2026-10-15T07:35:00Z
- **Tasks:** 3 (all TDD; 7 commits)
- **Files modified:** 11 (5 created, 6 modified)

## Accomplishments
- `MigrationBackupStep` (MIG-03, D-07) and `MigrationOldStackStep` (MIG-04, D-10) with UI-SPEC copy, off-state warnings (`dark:` counterparts on the warning icon) and a "Migration summary" recap (stack name, volumes to copy always rendered with the zero-volume note, Backup Yes/No, Stop old stack Yes/No).
- `ConfirmMigrateParams`, `BrownfieldImportApi.executeMigration` and both API clients now take/post the shared `MigrationExecuteInput`, so the server's required `backup`/`stopOldStack` are always sent explicitly (T-18-16).
- Shell: `MigrationStepIndicator` ("Step n of 4" + "Migration progress" list with `aria-current`), step 1 extracted to `MigrationSelectStep` (44px rows below `md`, wrapping paths), focus moves to the step body on every step change, a request-id guard ignores previews that resolve after cancel/close, and all state survives Back.
- Parent toasts: `Migrating {name}…`, success description naming the kept backup and/or stopped old stack, server failure message verbatim, fallback "Migration failed. Your original stack directory was not modified. Check the error and try again."
- Playwright "Migration wizard flow" updated: four-step walk, recorded request bodies for on/on and off/off, rollback-message failure case, 360px viewport test.

## Task Commits

1. **Task 1 (tracer, TDD): switches -> params -> API body**
   - RED `b57278d` (test), GREEN `e5964da` (feat)
2. **Task 2 (TDD): indicator, extracted step 1, focus, retention, stale-preview guard**
   - RED `658bdc6` (test), GREEN `c529516` (feat)
3. **Task 3 (TDD): toasts and Playwright coverage**
   - RED `4accb06` (test), GREEN `16e8386` (feat), spec `34dfea6` (test)

Tracer gate (auto-approved, `human_verify_mode` default): the end-to-end unit flow (scan -> four steps -> payload) was re-run green before expansion.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan acceptance count for `JSON.stringify(input)` in setup-api.ts**
- **Found during:** Task 1
- **Issue:** AC expects exactly 1 match in `setup-api.ts`, but the file already uses `JSON.stringify(input)` in five wizard-step submitters, so the count is 6. The intended change (executeMigration posts `JSON.stringify(input)`) is in place.
- **Fix:** none needed; criterion was mis-specified.

**2. [Rule 3 - Test organisation] Playwright literal-count criteria**
- **Found during:** Task 3
- **Issue:** `grep -c "Choose Old Stack Action"` is 3 (plan: at least 4) and `grep -c postDataJSON` is 1 (plan: at least 2), because the walk and the request-body recording live in shared helpers (`openAndWalkToStep4`, `mockMigrate`) used by all tests rather than being duplicated per test.
- **Fix:** none; all required scenarios are covered (default-on body, off/off body, summary text, failure message, 360px).

**3. [Process] Task 1 RED commit also held Task 3's toast tests**
- The first RED commit contained the toast cases; they were removed from the Task 1 GREEN commit so its verify command stayed green, and re-added fixed (lazy rejected promises, success-call matching) as the Task 3 RED commit `4accb06`.

**Total deviations:** 3 minor (no behavioural changes). **Impact:** none on scope.

## Issues Encountered
- Deferred to CI (project memory rule, no heavy local actions): client `tsc --build` (new `MigrationExecuteInput` type-only import, `setup-wizard.spec.ts` typing) and Playwright `chromium` + `mobile-chromium` for the updated/new migration specs, including the 360px test. These must be green before `/gsd-verify-work`.
- Verified locally: `brownfield-import.test.tsx`, `migration-wizard.test.tsx`, `env-mask.test.ts`, `diff-confirm-dialog.test.tsx` -> 66 tests pass.

## Known Stubs

None.

## Threat Flags

None. T-18-16 mitigated (visible default-on switches, step-4 recap, flags always sent, tests assert on/on and off/off bodies); T-18-17 accepted as planned.

## User Setup Required

None.

## Next Phase Readiness
Phase 18 plans are complete. MIG-01, MIG-03 and MIG-04 depend on CI confirming typecheck and Playwright before verification.

## Self-Check: PASSED

- Created files exist: migration-backup-step.tsx, migration-old-stack-step.tsx, migration-step-indicator.tsx, migration-select-step.tsx, brownfield-import.test.tsx (verified).
- Commits b57278d, e5964da, 658bdc6, c529516, 4accb06, 16e8386, 34dfea6 are ancestors of HEAD.
- Task acceptance greps pass except the two literal-count items noted in Deviations; verify commands exit 0.

---
*Phase: 18-import-and-migration-flow*
*Completed: 2026-10-15*
