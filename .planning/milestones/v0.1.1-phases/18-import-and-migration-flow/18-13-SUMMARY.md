---
phase: 18-import-and-migration-flow
plan: 13
subsystem: ui
tags: [react, react-router, vitest, playwright, brownfield-import, gap-closure, tone-badge]

requires:
  - phase: 18-import-and-migration-flow
    provides: "ScanResult.skipped / SkippedDirectory reasons (18-09), DiscoveredStack.managedStack and server refusal of managed paths (18-11)"
provides:
  - "ScanSkippedDirectories: every skipped scan root with its reason plus the /host container-path hint, shown after every scan"
  - "DiscoveredStackActions: row action cell with Imported, Already managed badge + 'View <name>' link, disabled Migrate/Adopt"
  - "BrownfieldImport composes both; stale '(permission denied)' header line removed"
  - "Playwright coverage of skip reasons and managed rows in the setup wizard and the post-setup import page"
affects: [18-15, 18-17, import page, setup wizard]

actuals:
  tokens: 6250
  tasks: 3
  commits: 5
plan_head_before: 4a2fc57781648854399ea81cef4024688ecbb723
commits: 5
plan_head_after: 484d97927ee825c6158124214bac5536a60ad27e

tech-stack:
  added: []
  patterns:
    - "Section components extracted from brownfield-import.tsx per the page-composition rule"
    - "Reason labels in a typed Record keyed by the shared SkippedDirectory reason union"

key-files:
  created:
    - client/src/components/domain/stack/scan-skipped-directories.tsx
    - client/src/components/domain/stack/discovered-stack-actions.tsx
  modified:
    - client/src/components/domain/stack/brownfield-import.tsx
    - client/test/unit/components/domain/stack/brownfield-import.test.tsx
    - client/test/integration/setup-wizard.spec.ts
    - client/test/integration/stacks-import.spec.ts

key-decisions:
  - "Skipped list is always rendered after a completed scan (above the empty state or table), not only when stacks were found"
  - "Reason type taken from SkippedDirectory['reason'] via client brownfield-types instead of a new import, keeping a single source in @docktor/shared"
  - "Disabled buttons are convenience only; the server (18-11) remains the guard for managed paths"

patterns-established:
  - "Managed rows stay listed: disable actions, show ToneBadge + link, never hide"

requirements-completed: [STK-03]

coverage:
  - id: D1
    description: "Every skipped scan root is listed with its real reason and the /host hint after every scan, also with zero stacks found"
    requirement: STK-03
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/stack/brownfield-import.test.tsx#skipped scan roots (G-18-3-scan)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Already-managed rows stay listed with Migrate/Adopt disabled, an Already managed badge and a link to the stack"
    requirement: STK-03
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/stack/brownfield-import.test.tsx#already-managed rows (G-18-2)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Playwright specs follow the new scan contract and cover both cases (left for CI)"
    verification:
      - kind: e2e
        ref: "client/test/integration/setup-wizard.spec.ts, client/test/integration/stacks-import.spec.ts"
        status: unknown
    human_judgment: true
    rationale: "Playwright specs are written but not executed locally (shared VPS rule); CI runs them"

duration: 9min
completed: 2026-10-16
status: complete
---

# Phase 18 Plan 13: Skipped Roots and Already-Managed Rows Summary

**Scan results now list every skipped root with its real reason and a /host container-path hint, and already-managed stacks stay in the table with disabled Migrate/Adopt, an "Already managed" ToneBadge and a link to the managing stack.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-10-16T07:47:00Z
- **Completed:** 2026-10-16T07:56:00Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- G-18-3-scan UI half: `ScanSkippedDirectories` renders a "Skipped directories (N)" region after every scan with "Not found inside the Docktor container" / "Permission denied" / "System directory, never scanned" and the /host hint; ENOENT is no longer labelled permission denied. The directories help text and the empty-scan toast say the same.
- G-18-2 UI half: `DiscoveredStackActions` keeps managed rows listed, disables Migrate and Adopt, shows `ToneBadge tone="blue"` "Already managed" and a `View <name>` link to `/stacks/<id>`. Unmanaged rows behave as before.
- `brownfield-import.tsx` shrank (25 insertions vs 58 deletions) by delegating to both section components.
- Playwright specs updated: every scan mock carries `skipped`, the old "N directories skipped (permission denied)" test is replaced, and managed-row tests added to both specs.

## TDD Gate Compliance

- **RED (Task 1):** `76d2a55` `test(18-13)`; four new tests failed on the planned assertions (missing "Skipped directories" region, missing /host help text). The "no skipped region when nothing skipped" guard test passes by design. Semantic assessment: failures were on the target behavior, not on setup/import errors.
- **GREEN (Task 1):** `619c624` `feat(18-13)`; 43 tests pass across brownfield-import and migration-wizard.
- **RED (Task 2):** `41d8df9`; three new tests failed (no "Already managed", buttons enabled, dialog opened).
- **GREEN (Task 2):** `598d3d8`; 46 tests pass.
- No REFACTOR commit needed.
- Tracer gate (Task 1): verify command re-run end-to-end green before expanding.

## Task Commits

1. **Task 1: skipped roots with reasons and /host hint** - `76d2a55` (test), `619c624` (feat)
2. **Task 2: already-managed rows** - `41d8df9` (test), `598d3d8` (feat)
3. **Task 3: Playwright specs** - `484d979` (test)

**Plan metadata:** committed separately (docs: complete plan)

## Files Created/Modified
- `client/src/components/domain/stack/scan-skipped-directories.tsx` - Alert-based skipped-roots section with typed reason labels and the /host hint
- `client/src/components/domain/stack/discovered-stack-actions.tsx` - row actions: Imported, Already managed + link, Migrate/Adopt
- `client/src/components/domain/stack/brownfield-import.tsx` - `skipped` state replaces `skippedDirs`; composes both sections
- `client/test/unit/components/domain/stack/brownfield-import.test.tsx` - skipped-root and managed-row suites (scan mock gains `skipped: []`)
- `client/test/integration/setup-wizard.spec.ts`, `client/test/integration/stacks-import.spec.ts` - new scan contract and both cases

## Decisions Made
- Region lookup relies on `<section aria-label="Skipped directories">` (role region) so both unit and Playwright tests query by role and name.
- Reason union derived from `SkippedDirectory["reason"]` rather than importing a second type name.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. Playwright specs (setup-wizard, stacks-import) were written but intentionally not executed locally per the shared-VPS rule; they are left for CI along with the full `tsc --build`. A single-workspace `tsc --noEmit -p .` of `client/src` was clean.

## Known Stubs
None.

## Threat Flags
None. Paths and names render as React text nodes; the link target uses the server-provided stack id (T-18-36); the server remains the guard for managed paths (T-18-37).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 18-15 can wire the preview `displayName` on the client; plan 18-17 adds the running-migration state to `DiscoveredStackActions`.
- CI must run the two edited Playwright specs (desktop and mobile projects).

## Self-Check: PASSED

- FOUND: scan-skipped-directories.tsx, discovered-stack-actions.tsx
- FOUND commits: 76d2a55, 619c624, 41d8df9, 598d3d8, 484d979
- Unit verify (brownfield-import + migration-wizard): 46 passed

---
*Phase: 18-import-and-migration-flow*
*Completed: 2026-10-16*
