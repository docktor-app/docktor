---
phase: 20-visual-consistency-dashboard-clarity-and-touch-targets
plan: 08
subsystem: ui
tags: [react, data-table, storage, backups, sorting, vitest]
status: complete

requires:
  - phase: 20-visual-consistency-dashboard-clarity-and-touch-targets
    provides: "20-02 DataTable (frame, controlled sort, renderExpanded, footer, hideHeader) and 20-03 TOUCH_TARGET"
provides:
  - "Storage backups, storage stacks, backup history and snapshots tables rendered through DataTable in the shared frame"
  - "Env editor and brownfield import tables framed with TableFrame and the shared header/row-hover look"
  - "snapshots-section unit test (new)"
affects: [20-09, 20-10, 20-11]

commits: 6
plan_head_before: b29db6a1c3a6b1ccb47b46d9926d07d04ea7b135
plan_head_after: f35bee89143c4f56e9b86ff632c630477ad754fd

actuals:
  tokens: 9000
  tasks: 3
  commits: 6

key-files:
  created:
    - client/test/unit/routes/stacks/snapshots-section.test.tsx
  modified:
    - client/src/routes/app/storage/components/storage-backups-section.tsx
    - client/src/routes/app/storage/components/storage-stacks-table.tsx
    - client/src/routes/app/stacks/components/backup-history.tsx
    - client/src/routes/app/stacks/components/snapshots-section.tsx
    - client/src/components/domain/stack/env-editor.tsx
    - client/src/components/domain/stack/brownfield-import.tsx
    - client/test/unit/routes/storage/storage-backups-section.test.tsx
    - client/test/unit/routes/storage/storage-stacks-table.test.tsx
    - client/test/unit/routes/stacks/backup-history.test.tsx

key-decisions:
  - "Planner decision 1 applied in full: storage stacks use DataTable with controlled sort (pre-sorted via sortStorageStacks, columns carry sort {direction, onToggle}); the TableFrame + SortableHead fallback was not needed"
  - "Volume rows come from renderExpanded: aligned TableRows with bg-muted/50 and the group id on the first row in table mode, a 'name · size' list carrying the group id in card mode"
  - "ariaSortFor stays in storage-view.ts (still unit-tested) but the component derives the header direction directly; aria-sort now comes from the shared SortableHead"

requirements-completed: [UI-08]
---

# Phase 20 Plan 08: Storage and backup tables on the shared table look Summary

**Storage backups (with footer subtotal), storage stacks (controlled domain sort plus aligned volume rows), backup history and snapshots now render through DataTable in the bordered frame; the env editor and brownfield import tables carry the same frame and header look.**

## Accomplishments

- Tracer: StorageBackupsSection -> DataTable footer -> TableFrame renders the "Backups subtotal" row inside the frame; empty/loading branches come from DataTable with the UI-SPEC copy.
- Storage stacks keep the exact domain sort (default size desc, natural direction on first click, unmeasured last, name tie-break), per-stack multi-expansion, the "Show/Hide volumes for {name}" toggle, aria-controls pointing at the first volume row, and the "not measured yet" empty state. The local SortableHead, sort icon helper and min-size literal are gone; `TOUCH_TARGET` is used for the expander and the `size-9` spacer.
- Backup history keeps pills, "View details" links and the 384px ScrollArea around the frame; snapshots keep the mono short id, tags fallback, Restore with confirmation dialog, and the locked/loading/error branches.
- Env editor: TableFrame, muted thead, row hover, `TOUCH_TARGET` replaces `ICON_BUTTON_CLASS`. Brownfield import: bordered div replaced with TableFrame plus the same classes.
- None of the migrated tables paginates (`pagination={false}`).

## Task Commits

1. `8e9bf91` test(20-08) storage backups in the shared frame with a footer subtotal (RED)
2. `5b7fca7` feat(20-08) storage backups through DataTable
3. `9556915` test(20-08) storage stacks frame, hidden expander header, touch target (RED)
4. `b7faf67` feat(20-08) storage stacks on DataTable with controlled sort
5. `12164ef` test(20-08) backup history and snapshots in the shared frame (RED)
6. `f35bee8` feat(20-08) backup history, snapshots, framed editable tables

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Structure] Spacer slot sizing via `size-9` + `TOUCH_TARGET`**
- The plan allowed this directly; noted only because a bare `TOUCH_TARGET` on a span would collapse to 0px at md and up.

**2. [Branch namespace] Pre-commit allow-list**
- The worktree branch is the orchestrator-assigned `worktree-bridge-cse_...`, outside the `agent-*` allow-list; it is not a protected branch and matches prior plans' commits.

Otherwise the plan executed as written. `SnapshotsSection` props are now wrapped in `Readonly` as requested.

## Deferred Verifications (project resource constraint)

Not run locally; left to GitHub Actions CI:
- `tsc --build` / `yarn typecheck`
- Full `yarn test:unit`; Playwright `chromium` specs (`storage.spec.ts`, `backups.spec.ts`, `stacks-import.spec.ts`, `stacks.spec.ts`)
- Visual check of light/dark mode at 1280px and the card layout at 375px (plan 20-11)

Local verification: targeted vitest on storage-backups-section, storage-stacks-table, storage-page, storage-view, backup-history, snapshots-section, env-editor and brownfield-import (all green). One run of `brownfield-import.test.tsx` hit a 5s timeout in a slow, load-affected run alongside other files; it passed 31/31 when re-run alone.

## Known Stubs

None.

## Threat Flags

None. The storage link keeps `encodeURIComponent(stackId)` (T-20-15); Restore still opens `RestoreConfirmDialog` before `triggerRestore` and the new test asserts no restore call on the first click (T-20-16).

## Self-Check: PASSED
