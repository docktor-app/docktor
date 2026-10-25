---
phase: 20-visual-consistency-dashboard-clarity-and-touch-targets
fixed_at: 2026-10-21T00:00:00Z
review_path: .planning/phases/20-visual-consistency-dashboard-clarity-and-touch-targets/20-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 20: Code Review Fix Report

**Fixed at:** 2026-10-21
**Source review:** .planning/phases/20-visual-consistency-dashboard-clarity-and-touch-targets/20-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (Critical + Warning; Info excluded)
- Fixed: 6
- Skipped: 0

**Verification location:** Edits, commits and targeted vitest runs happened in the existing harness worktree (`.claude/worktrees/bridge-cse_01GoBQizyDtQbVBYvsPj9rQt`, branch `worktree-bridge-cse_01GoBQizyDtQbVBYvsPj9rQt`). No nested review-fix worktree was created: the session already runs in an isolated worktree, and a nested one would have no `node_modules` to run the tests. Per project constraints, no `tsc --build` or integration/Playwright tests were run; only targeted unit tests. CI should run the full type check.

## Fixed Issues

### WR-01: Column `className` is ignored in the mobile card layout

**Files modified:** `client/src/components/common/data/table/data-table.tsx`, `client/src/components/common/data/table/table-cards.tsx`, `client/src/components/common/data/table/table-content.tsx`, `client/src/routes/app/settings/components/notification-log-card.tsx`, `client/src/routes/app/storage/components/storage-backups-section.tsx`, `client/src/routes/app/storage/components/storage-stacks-table.tsx`, `client/test/unit/components/common/data-table.test.tsx`
**Commit:** 5cac0b4
**Applied fix:** `CardFields` now applies `col.className` to the title, labelled and hideHeader fields (the `min-w-0` lets truncation work in the flex row). The reviewer's plain pass-through would have collapsed the storage Stack column, whose `w-full max-w-0` is a table-only width trick. So a new `TableColumn.tableClassName` holds table-only layout classes and is applied only to desktop cells. The storage tables and the notification log Message column were split accordingly. Added card-layout and desktop tests.
**Status:** fixed

### WR-02: Clickable rows and cards are not keyboard or screen-reader operable

**Files modified:** `client/src/components/common/data/table/item-link.tsx` (new), `client/src/components/common/data/table/table-cards.tsx`, `client/src/components/common/data/table/table-content.tsx`, `client/test/unit/components/common/data-table.test.tsx`
**Commit:** 7469160
**Applied fix:** When `itemRoute` is set, the key column (or the first visible column) is wrapped in a new `ItemLink`, a real react-router `Link` with a focus ring. This applies to both the table and the card title. The existing row/card click stays as a pointer shortcut. The link calls `stopPropagation` so a click does not navigate twice. `StackList` benefits without changes. Added tests for table links, `isKey` preference, no links without `itemRoute`, and card-title links.
**Status:** fixed

### WR-03: Mobile sort toolbar does not expose the sort direction

**Files modified:** `client/src/components/common/data/table/table-cards.tsx`, `client/test/unit/components/common/data-table.test.tsx`
**Commit:** e0d0a7c
**Applied fix:** The sort buttons now carry `aria-label` "Sort by {name}" with ", ascending" or ", descending" appended when active. The existing toolbar test was updated for the new accessible names and now covers asc to desc.
**Status:** fixed

### WR-04: Pagination query params accept negative and fractional page sizes

**Files modified:** `client/src/components/common/data/table/data-table.tsx`, `client/src/components/common/data/table/table-pagination.tsx`, `client/test/unit/components/common/data-table.test.tsx`
**Commit:** eef32ef
**Applied fix:** `PAGE_SIZE_OPTIONS` is now exported from `table-pagination.tsx`. `pageSize` is only accepted if it is in that set, otherwise it falls back to `defaultPageSize`. `page` is floored and must be a finite number of at least 1. Added tests for -3, 0.5, abc, 7, 0, a valid size, a fractional page and a negative page.
**Status:** fixed

### WR-05: Copy-setup-key icon button misses the 44px touch target

**Files modified:** `client/src/routes/app/account/components/enroll-dialog.tsx`, `client/test/unit/routes/account/enroll-dialog.test.tsx`
**Commit:** f3a1fc7
**Applied fix:** Added `className={TOUCH_TARGET}` to the Copy setup key button and imported `TOUCH_TARGET` from `@/lib/touch-target`. Added a test that asserts the `max-md:size-11` class.
**Status:** fixed

### WR-06: `useStacks` decides on a render-time snapshot of `stacks` inside the SSE handler

**Files modified:** `client/src/hooks/use-stacks.ts`, `client/test/unit/hooks/use-stacks.test.ts`
**Commit:** 3c8b56e
**Applied fix:** A `useRef<Map<string, string>>` holds the last-known status per stack. It is seeded from each fetch and updated by both `stack_status` and `container_state` events. A single `recordStatus` helper reports when a known stack leaves `BACKING_UP`. The handler no longer reads `stacks` from the closure, and `container_state` events can now trigger the `hasBackup` refetch. Added tests for two events landing before a re-render (one refetch) and for a `container_state` event ending `BACKING_UP`.
**Status:** fixed: requires human verification (event-ordering logic; unit tests pass but the real SSE ordering is not exercised)

## Notes

- Targeted unit runs passed: `data-table.test.tsx` (31), `stack-list.test.tsx`, the storage table tests, `enroll-dialog.test.tsx` (22) and `use-stacks.test.ts` (11).
- Under load, two unrelated tests timed out on a first full-folder run (`storage-stacks-table` sorting, `theme-toggle` Light). `storage-stacks-table` passed when re-run alone, and `theme-toggle` shares no code with these changes. Both look like VPS resource contention, not regressions.
- Info findings IN-01 to IN-07 were out of scope (`fix_scope: critical_warning`).

---

_Fixed: 2026-10-21_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
