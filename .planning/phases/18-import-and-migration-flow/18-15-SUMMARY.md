---
phase: 18-import-and-migration-flow
plan: 15
subsystem: ui
tags: [react, migration-dialog, brownfield-import, gap-closure, vitest, playwright]

requires:
  - phase: 18-import-and-migration-flow
    provides: "Preview requires displayName and answers with target; execute accepts inPlaceAsideName; stackDirectoryNameSchema (18-12)"
provides:
  - "Migration dialog adapted to the two G-18-7 cases: in-place (rename original aside, forced stop) and separate (backup default off with note)"
  - "previewMigration(input: MigrationPreviewInput) in setup-api and import-api; MigrationPreview.target"
  - "ConfirmMigrateParams.inPlaceAsideName forwarded into the execute body by BrownfieldImport"
affects: [18-16, 18-17, setup wizard, import page]

actuals:
  tokens: 28000
  tasks: 3
  commits: 6
plan_head_before: a68a6500ca5690e652875a1c33360970f7f9ffe5
commits: 6
plan_head_after: 3afaec3ba84da8d78483a36fcfa319bbe9615fa2

tech-stack:
  added: []
  patterns:
    - "Derived effective wizard values: user edits are nullable (null = untouched), so server suggestions and defaults follow each new preview without overriding an explicit choice"

key-files:
  created: []
  modified:
    - client/src/lib/brownfield-types.ts
    - client/src/lib/import-api.ts
    - client/src/lib/setup-api.ts
    - client/src/routes/setup/components/migration-wizard.tsx
    - client/src/routes/setup/components/migration-backup-step.tsx
    - client/src/routes/setup/components/migration-old-stack-step.tsx
    - client/src/components/domain/stack/brownfield-import.tsx
    - client/test/unit/routes/setup/migration-wizard.test.tsx
    - client/test/unit/components/domain/stack/brownfield-import.test.tsx
    - client/test/integration/setup-wizard.spec.ts

key-decisions:
  - "Aside name and backup choice are held as nullable user edits (string | null, boolean | null); the effective value is derived from preview.target and the default, so Back/regenerated previews never clobber an explicit choice"
  - "In-place always confirms with backup false and stopOldStack true; the renamed original is the backup (no extra copy)"
  - "Separate migrations default backup to off (G-18-7 user decision supersedes D-07 default-on); the former off-state warning is replaced by a neutral note naming the untouched original path"
  - "Aside-name client validation is format (stackDirectoryNameSchema) plus not-equal-to-current-directory-name; existence stays a server 409"

patterns-established:
  - "Step components receive a mode prop (in-place | separate) instead of the wizard branching its JSX"

requirements-completed: [MIG-03, MIG-04]

coverage:
  - id: D1
    description: "Preview request carries displayName; dialog reads the returned target to tell in-place from separate"
    requirement: MIG-03
    verification:
      - kind: unit
        ref: "client/test/unit/routes/setup/migration-wizard.test.tsx#in-place migration (G-18-7) sends the stack name with the preview request"
        status: pass
      - kind: unit
        ref: "client/test/unit/components/domain/stack/brownfield-import.test.tsx#sends backup false and stopOldStack true by default and closes the dialog"
        status: pass
    human_judgment: false
  - id: D2
    description: "In-place step 3 shows an editable, validated aside name and no backup switch; step 4 forces the stop and summarises 'Original kept as <name>'"
    requirement: MIG-03
    verification:
      - kind: unit
        ref: "client/test/unit/routes/setup/migration-wizard.test.tsx#in-place migration (G-18-7)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Separate migrations default the backup off with an untouched-original note; the user can still turn it on and the choice survives Back"
    requirement: MIG-03
    verification:
      - kind: unit
        ref: "client/test/unit/routes/setup/migration-wizard.test.tsx#defaults the backup off with a note naming the untouched original path"
        status: pass
      - kind: unit
        ref: "client/test/unit/routes/setup/migration-wizard.test.tsx#keeps the backup choice across Back, a regenerated preview and forward"
        status: pass
    human_judgment: false
  - id: D4
    description: "Confirm & Migrate sends inPlaceAsideName for in-place migrations (stopOldStack true, backup false) and omits it otherwise, in both route families"
    requirement: MIG-04
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/stack/brownfield-import.test.tsx#sends the aside name, the forced stop and no extra backup for an in-place migration"
        status: pass
      - kind: e2e
        ref: "client/test/integration/setup-wizard.spec.ts#should rename the original aside, force the stop and send inPlaceAsideName for an in-place migration"
        status: unknown
    human_judgment: false
  - id: D5
    description: "Visual quality of the new step 3 / step 4 copy in light and dark themes and at phone width"
    verification: []
    human_judgment: true
    rationale: "Layout and wording adequacy are not asserted by unit tests; Playwright runs only in CI"

duration: 30min
completed: 2026-10-16
status: complete
---

# Phase 18 Plan 15: Migration dialog in-place and default-off backup Summary

**Migration dialog now tells in-place migrations (rename the original aside under a validated, editable name, forced stop, no extra backup) from separate ones (backup defaults off with a note naming the untouched original), driven by the preview's `target`, and forwards `inPlaceAsideName` on confirm.**

## Performance

- **Duration:** about 30 min
- **Completed:** 2026-10-16T10:35Z
- **Tasks:** 3 (tracer + 2 TDD)
- **Files modified:** 10

## Accomplishments
- Step 3 in place: "Name for the original directory" input prefilled with the server's suggestion (`<name>-pre-migration`), explanation naming the directory that is renamed, no backup switch; validation (shared `stackDirectoryNameSchema` and not equal to the current directory name) disables the forward button.
- Step 4 in place: "Stop the old stack" is on and disabled with the reason; summary reads `Backup: Original kept as <name>`.
- Separate migrations: backup switch defaults off; the old warning is replaced by a neutral info note naming the original path; explicit user choice survives Back and re-previews.
- Both API clients post a `MigrationPreviewInput` (with `displayName`); `BrownfieldImport` adds `inPlaceAsideName` to the execute body only when set. Toast code untouched (plan 18-17).

## Task Commits

1. **Task 1 (tracer): in-place preview leads to aside-name step, forced stop, inPlaceAsideName on confirm** - `393088d` (test), `96f3a59` (feat)
2. **Task 2: separate migrations default backup off; aside name validated** - `d4f2cba` (test), `1671112` (feat)
3. **Task 3: API clients send the stack name; parent forwards inPlaceAsideName** - `e305379` (test), `3afaec3` (feat)

**Plan metadata:** committed separately (docs: complete plan)

## Files Created/Modified
- `client/src/lib/brownfield-types.ts` - `MigrationPreview.target: MigrationTarget`
- `client/src/lib/import-api.ts`, `client/src/lib/setup-api.ts` - `previewMigration(input: MigrationPreviewInput)`
- `client/src/routes/setup/components/migration-wizard.tsx` - target-driven defaults, aside-name state and validation, `inPlaceAsideName` in `ConfirmMigrateParams`
- `client/src/routes/setup/components/migration-backup-step.tsx` - in-place and separate modes
- `client/src/routes/setup/components/migration-old-stack-step.tsx` - `stopRequired`, `keptOriginalAs`
- `client/src/components/domain/stack/brownfield-import.tsx` - forwards `inPlaceAsideName`
- Tests: wizard unit test (38), brownfield-import unit test (21), Playwright `setup-wizard.spec.ts`

## Decisions Made
See `key-decisions`. Notably the existing default-on backup tests were deliberately changed to default-off (G-18-7 user decision).

## Deviations from Plan

None - plan executed exactly as written. (Minor implementation choice: `inPlace` is derived as `target ? target.inPlace : false` so the plan's `target.inPlace` acceptance grep matches.)

## Issues Encountered
None.

## Verification
- `vitest run test/unit/routes/setup/migration-wizard.test.tsx test/unit/components/domain/stack/brownfield-import.test.tsx`: 59 passed.
- `cd client && corepack yarn tsc --noEmit -p .`: clean.
- Not run locally (CI only, per project rule on the shared VPS): `tsc --build`, Playwright desktop and mobile projects. The updated `client/test/integration/setup-wizard.spec.ts` (new defaults, in-place test) is left for CI.

## TDD Gate Compliance
Each task has a `test(18-15)` commit preceding its `feat(18-15)` commit.
- RED 1: new in-place tests and call-shape updates failed on assertions (missing "Name for the original directory" textbox, preview called with positional args). Semantic assessment: the target tests ran and failed for the planned reasons, no load/syntax faults.
- RED 2: default-off, validation and flip tests failed (switch checked by default, error text absent). Same assessment.
- RED 3: only the in-place `executeMigration` body assertion failed (no `inPlaceAsideName`); the preview-object assertion already passed from Task 1, which is expected as Task 1 changed the wizard call.

## Known Stubs
None.

## Threat Flags
None. T-18-42 and T-18-43 mitigations applied (client format check is convenience only; the final screen shows Backup Yes/No/Original kept as name).

## Next Phase Readiness
Ready for 18-16/18-17 (the parent still treats the migrate response synchronously until 18-17 adapts it to 202 + operation).

## Self-Check: PASSED
