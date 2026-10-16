---
phase: 18-import-and-migration-flow
plan: 21
subsystem: ui
tags: [migration, setup-wizard, review-step, gap-closure, client]
requires:
  - phase: 18-import-and-migration-flow
    provides: 18-19 server preview field emptySources, MigrationReviewStep, migration dialog
provides:
  - MigrationPreview.emptySources on the single client preview type
  - Empty-source warning Alert on step 2 (Review changes) of the migration dialog
affects: [18-verification gap 1, MIG-01]
actuals:
  tokens: 6000
  tasks: 2
  commits: 3
plan_head_before: 1fc3ee735369979d2ec640c18a592bb911dfb782
plan_head_after: f12df2e06bdeeb0c3ff18188005c83a822390a62
commits: 3
tech-stack:
  added: []
  patterns:
    - "Warning Alert (AlertTriangle with text-yellow-600 dark:text-yellow-400) for pre-confirm notes, matching the old-stack step"
key-files:
  created: []
  modified:
    - client/src/lib/brownfield-types.ts
    - client/src/routes/setup/components/migration-wizard.tsx
    - client/src/routes/setup/components/migration-review-step.tsx
    - client/test/unit/routes/setup/migration-wizard.test.tsx
    - client/test/unit/components/domain/stack/brownfield-import.test.tsx
    - client/test/integration/setup-wizard.spec.ts
key-decisions:
  - "Empty sources render as React text in <code class=break-all> inside the existing warning Alert, so long paths wrap at 360px and nothing is injected as HTML (T-18-62)"
  - "No note is rendered for an empty list; the wizard only forwards preview.emptySources"
requirements-completed: []
status: complete
---

# Phase 18 Plan 21: Show empty bind-mount sources on the review step Summary

Step 2 of the migration dialog now names every selected bind-mount source that does not exist on the host and says the new stack starts with an empty folder for each, closing the client half of 18-VERIFICATION gap 1 (review CR-03).

## What was done

- **Task 1 (tracer):** RED tests first (`test(18-21)`): a preview with `emptySources: ["./missing", "/srv/app/cache"]` shows an alert naming both paths and the "starts with an empty folder for each" copy; an empty list shows no alert. Then `MigrationPreview.emptySources: string[]` was added, `MigrationReviewStep` gained an `emptySources` prop rendering a warning `Alert` + `AlertTriangle` (light and `dark:` icon colours, `break-all` paths) after "Compose file changes", and `MigrationWizard` passes `emptySources={preview.emptySources}`. Both dialog entry points share the one `MigrationPreview` type, so no per-entry change was needed.
- **Task 2:** every preview fixture in the unit tests (migration-wizard, brownfield-import) and in the Playwright spec carries `emptySources: []`. A new Playwright flow mocks `emptySources: ["./missing"]` and asserts the step-2 alert and the path; it runs in both the chromium and mobile-chromium projects (CI only).

## Verification

- `vitest run --coverage.enabled=false` over `migration-wizard.test.tsx` and `brownfield-import.test.tsx`: 68 passed (migration-wizard 40 including the 2 new tests).
- RED run before the feature commit failed the new alert test (1 failed, 39 passed).
- All task acceptance greps pass (emptySources in types, `emptySources={preview.emptySources}` in the wizard, `dark:text-yellow-400` and `break-all` in the review step, `/srv/app/cache` in the unit test, `./missing` and emptySources in the spec).
- Not run, per project memory: full `tsc --build`, Playwright, integration suites (CI). Client tests are not type-checked by tsc; the source change is three typed lines.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None. Paths render as escaped React text (T-18-62 mitigated); no new endpoints or trust boundaries.

## Notes

- Out of scope and unchanged: WR-06, WR-08, WR-02.
- Requirements were not marked complete; the phase has not been re-verified.

## Self-Check: PASSED

- Modified files exist; commits 91b45ae, 946a727, f12df2e are on the branch.
