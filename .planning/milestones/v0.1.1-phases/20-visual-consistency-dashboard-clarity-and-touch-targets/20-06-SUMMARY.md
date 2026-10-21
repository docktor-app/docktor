---
phase: 20-visual-consistency-dashboard-clarity-and-touch-targets
plan: 06
subsystem: client-ui
tags: [tabs, overflow, scrollbar, stack-detail, ui-04]
requires: []
provides:
  - "StackTabBar section component: scrollbar-free, swipeable stack tab bar"
  - "Active tab scrolled into view (inline/block nearest, instant), jsdom-safe"
affects: [20-11]
tech-stack:
  added: []
  patterns: ["Overflow wrapper with 4px padding + negative margin to contain focus ring and trigger underline", "Optional-call scrollIntoView as jsdom guard"]
key-files:
  created:
    - client/src/routes/app/stacks/components/stack-tab-bar.tsx
    - client/test/unit/routes/stacks/stack-tab-bar.test.tsx
  modified:
    - client/src/routes/app/stacks/[id].tsx
    - client/test/unit/routes/stacks/stack-detail-page.test.tsx
decisions:
  - "Tab bar extracted into StackTabBar; [id].tsx shrank from 90 to 85 lines"
  - "No global scrollIntoView stub in test setup; optional call is the guard"
metrics:
  tasks: 2
  files: 4
status: complete
actuals:
  tokens: 5000
  tasks: 2
  commits: 4
plan_head_before: 7ded646b6f6becdb705c819b7b4ff730c16ac1f2
plan_head_after: 4a3a19aec88cca2d843ae700277ba36aee12471c
commits: 4
completed: 2026-10-21
---

# Phase 20 Plan 06: Scrollbar-free stack tab bar Summary

`StackTabBar` wraps the stack tabs in `-mx-1 -my-1 overflow-x-auto overflow-y-hidden px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden` so no vertical scrollbar appears from the focus ring or underline, the horizontal scrollbar is hidden, swipe scrolling remains, and the active tab is scrolled into view.

## Tasks

| Task | Name | Commits |
| ---- | ---- | ------- |
| 1 | Tracer: StackTabBar wrapper, [id].tsx wiring | 44b4ce2 (test), c5da521 (feat) |
| 2 | Active tab scrolled into view, jsdom-safe | 1fd7b63 (test), 4a3a19a (feat) |

## Deviations from Plan

None - plan executed exactly as written. (In Task 1 the component's prop was temporarily `_props` until Task 2 consumed `activeTab`, to avoid an unused-parameter error at the intermediate commit.)

## Verification

- `vitest run` on stack-tab-bar.test.tsx and stack-detail-page.test.tsx: 14 passed.
- Acceptance greps pass; `components/ui/` unchanged since 7cc2dec.
- Tracer gate: verify re-run end to end after Task 1, passed.

## Deferred Verifications (CI, per project constraint)

- `tsc --build` / `yarn typecheck`, full unit suite.
- Playwright `mobile-chromium` tab walk (`mobile.spec.ts`) and the three-width no-scrollbar assertions (plan 20-11).

## Known Stubs

None.

## Threat Flags

None. T-20-10 mitigated: optional-call scrollIntoView, queried from the component's own wrapper, tested with the method absent.

## Self-Check: PASSED

- stack-tab-bar.tsx, stack-tab-bar.test.tsx exist; commits 44b4ce2, c5da521, 1fd7b63, 4a3a19a in history.
