---
phase: 20-visual-consistency-dashboard-clarity-and-touch-targets
plan: 03
subsystem: ui
tags: [react, a11y, touch-targets, tailwind, pagination, vitest]
status: complete

requires:
  - phase: 20-visual-consistency-dashboard-clarity-and-touch-targets
    provides: "Plan 20-02 shared DataTable (renders TablePagination; props unchanged here)"
provides:
  - "TOUCH_TARGET (max-md:size-11) in client/src/lib/touch-target.ts: the single source of the 44px-below-md rule"
  - "TablePagination with named buttons (First/Previous/Next/Last page), 44px-below-md buttons and select, wrapping footer"
  - "Stack actions trigger and theme toggle on the shared constant"
affects: [20-08, 20-09, 20-10, 20-11]

commits: 4
plan_head_before: cf5a171bf0d66bdc87cbadee04762439fd3fd2cd
plan_head_after: 66441b7fa32fd1164401200fbdc4958af6bf4ebf

actuals:
  tokens: 4700
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Per-site touch target: cn(<compact Button size>, TOUCH_TARGET); max-md: variant leaves the compact size at md and up"
    - "Non-square controls (select trigger) inline the height variant (max-md:h-11) instead of the square constant"

key-files:
  created:
    - client/src/lib/touch-target.ts
    - client/test/unit/lib/touch-target.test.ts
    - client/test/unit/components/common/table-pagination.test.tsx
  modified:
    - client/src/components/common/data/table/table-pagination.tsx
    - client/src/routes/app/stacks/components/stack-actions.tsx
    - client/src/components/common/theme-toggle.tsx
    - client/test/unit/routes/stacks/stack-actions.test.tsx
    - client/test/unit/components/common/theme-toggle.test.tsx
    - client/test/integration/components/data/table/data-table.spec.ts

key-decisions:
  - "One constant max-md:size-11 applied per site through cn(); no wrapper component, SidebarTrigger untouched (CONTEXT D-11)"
  - "Pagination buttons moved from size=icon + h-8 w-8 to size=icon-sm (size-8) so the constant overrides the same size property"
  - "Playwright helper now returns {first, previous, next, last} located by accessible name instead of xpath + index"

patterns-established:
  - "Icon-only controls get their 44px mobile target from TOUCH_TARGET, never a local min-h-11/min-w-11 literal"

requirements-completed: [A11Y-01, UI-08]
---

# Phase 20 Plan 03: Touch targets and compact pagination footer Summary

**One shared `TOUCH_TARGET` (`max-md:size-11`) now gives the pagination buttons, the Stack actions trigger and the theme toggle a 44px target below md while keeping their compact size at md and up, and the pagination footer is a named, wrapping footer.**

## Performance

- **Tasks:** 2 (1 tracer, 1 auto), each as RED test commit then feat commit
- **Tests:** touch-target (2), table-pagination (6), stack-actions and theme-toggle (13 including the new ones), data-table (25) all green locally

## Accomplishments

- Tracer: `TOUCH_TARGET` -> `TablePagination` buttons and select -> DataTable footer -> Playwright helper, end to end.
- Pagination buttons are `outline` / `icon-sm` with `className={TOUCH_TARGET}`, carry `aria-label` "First page", "Previous page", "Next page", "Last page" and hidden icons. The rows-per-page select trigger is `h-8 ... max-md:h-11`.
- Footer root and right-hand group wrap (`flex-wrap`, `gap-y-2`); the button group uses `gap-2 md:gap-1` so 44px hit areas stay 8px apart on phones (T-20-05). Copy ("{n} item(s)", "Rows per page", "Page x of y") and `?page=` / `?pageSize=` behaviour unchanged.
- Stack actions trigger uses `TOUCH_TARGET`; its row already had `gap-2` toward the Deploy button, now asserted by a test.
- Theme toggle renders `cn("relative hover:text-primary", TOUCH_TARGET)` instead of its own `min-h-11 min-w-11 ... md:min-h-9 md:min-w-9` literals; rendered sizes are the same (44px below md, size-9 at md and up).
- `data-table.spec.ts` drives pagination by role and name; the grandparent-xpath helper is gone.

## Task Commits

1. Task 1 RED: `9e4681f` test(20-03) pin touch-target constant and pagination names, sizes and navigation
2. Task 1 GREEN: `0dfaa56` feat(20-03) 44px-below-md pagination controls with names and a wrapping footer
3. Task 2 RED: `0fc466a` test(20-03) pin the 44px-below-md touch target of the stack actions trigger and theme toggle
4. Task 2 GREEN: `66441b7` feat(20-03) stack actions trigger and theme toggle use the shared touch-target constant

## Deviations from Plan

### Notes

**1. [Branch namespace] Pre-commit allow-list**
- The worktree branch is the orchestrator-assigned `worktree-bridge-cse_...`, outside the `agent-*` allow-list but not a protected branch, and identical to the prior plans' commits; commits proceeded on it.

None otherwise - plan executed as written.

## Deferred Verifications (project resource constraint)

Per the shared-VPS constraint, not run locally; left to GitHub Actions CI:
- `tsc --build` / `yarn typecheck`
- Full `yarn test:unit`
- Playwright `chromium` on `components/data/table/data-table.spec.ts` (the eight pagination tests now use named buttons)
- Real pixel sizes (44x44 below md, 32x32 / 36x36 at md and up) and the 320px wrap check: plan 20-11's `mobile.spec.ts`

Local verification: targeted vitest on touch-target, table-pagination, stack-actions, theme-toggle and data-table tests only.

## Known Stubs

None.

## Threat Flags

None. `components/ui/` unchanged since 7cc2dec; no new network, auth or file surface.

## Self-Check: PASSED

All created files exist and all four commits are ancestors of HEAD.
