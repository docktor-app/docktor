---
phase: 18-import-and-migration-flow
plan: 24
subsystem: ui
tags: [brownfield-import, layout, tailwind, gap-closure, client]
requires:
  - phase: 18-import-and-migration-flow
    provides: BrownfieldImport card and the setup wizard brownfield step
provides:
  - Discovered-stacks card up to max-w-6xl (1152px) on /stacks/import and in the setup wizard
  - Wrapping directory cell so long scanned paths no longer force horizontal table scroll
  - Playwright proof (CI) at 1280px and 360px
affects: [G-18-22-card, STK-03]
actuals:
  tokens: 7500
  tasks: 2
  commits: 3
plan_head_before: c7cab1552f5e9d437fd9bb5af465af26a4c9f72f
plan_head_after: 599065745dacbc0ebfb462ec75789f5b9b200aa6
commits: 3
tech-stack:
  added: []
  patterns:
    - "Override shadcn TableCell whitespace-nowrap per call site via cn()/tailwind-merge (whitespace-normal), without editing components/ui"
key-files:
  created: []
  modified:
    - client/src/components/domain/stack/brownfield-import.tsx
    - client/src/routes/setup/components/brownfield-step.tsx
    - client/test/unit/components/domain/stack/brownfield-import.test.tsx
    - client/test/integration/stacks-import.spec.ts
key-decisions:
  - "Directory cell uses whitespace-normal break-all min-w-48: it wraps instead of scrolling, and the minimum keeps the column readable next to the actions"
  - "Setup wizard wrapper matches the post-setup page width (max-w-6xl); other wizard steps keep their own widths"
requirements-completed: [STK-03]
status: complete
---

# Phase 18 Plan 24: Wider discovered-stacks card Summary

The discovered-stacks card on `/stacks/import` and in the setup wizard's import step is now up to 1152px wide (was 768px), and long scanned directories wrap inside their cell, so the table no longer scrolls horizontally on every scan (G-18-22-card).

## What was done

- **Task 1 (tracer, TDD):** two tests were written and committed first (`test(18-24)`), and both failed: the card must carry `max-w-6xl` and not `max-w-3xl`, and the cell of a 70+ character directory must carry `whitespace-normal` and `break-all`. Then `brownfield-import.tsx` got `max-w-6xl` on the Card and `font-mono text-sm whitespace-normal break-all min-w-48` on the directory `TableCell`, and `brownfield-step.tsx` got `max-w-6xl` on the wizard wrapper. No other structure or colour utility changed.
- **Task 2:** `stacks-import.spec.ts` gained a `longPathStack` fixture, a `scanLongPath` helper and two tests that set their own viewport: at 1280x800 the card's `table-container` must satisfy `scrollWidth <= clientWidth` and the card must be wider than 768px; at 360x740 the page must not overflow horizontally and the row's Migrate and Adopt buttons must be visible after `scrollIntoViewIfNeeded`.

## Verification

- `vitest run --coverage.enabled=false test/unit/components/domain/stack/brownfield-import.test.tsx`: 30 passed. RED was confirmed before the feature commit (2 failed, for the intended assertions).
- Acceptance greps: `max-w-6xl` appears once in each component file, `whitespace-normal break-all` once, and the spec contains the 2 new test titles, `table-container`, 2 `setViewportSize` calls and 3 `longPathStack` references. A per-file `tsc --noEmit` of the spec reported no errors.
- Not run, per project memory: Playwright (CI), full `tsc --build`.
- Human re-test still required: 18-UAT.md test 11 on the import page and in the setup wizard.

## Deviations from Plan

None - plan executed exactly as written. One note: my first fixture path was 66 characters, below the plan's 70-character requirement. The test's own length assertion caught it before the RED commit, and I lengthened it to `.../stacks/memos-archive`.

## Known Stubs

None.

## Threat Flags

None. Layout-only change (T-18-73 accepted in the plan).

## Self-Check: PASSED

- FOUND: client/src/components/domain/stack/brownfield-import.tsx, client/src/routes/setup/components/brownfield-step.tsx, client/test/unit/components/domain/stack/brownfield-import.test.tsx, client/test/integration/stacks-import.spec.ts
- FOUND commits: 15f5e17 (test), ff97b6f (feat), 5990657 (test)
