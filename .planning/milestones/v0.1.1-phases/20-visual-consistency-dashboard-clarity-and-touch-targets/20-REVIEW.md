---
phase: 20-visual-consistency-dashboard-clarity-and-touch-targets
reviewed: 2026-10-21T00:00:00Z
depth: standard
files_reviewed: 68
files_reviewed_list:
  - client/package.json
  - client/src/components/common/data/table/data-table.tsx
  - client/src/components/common/data/table/index.ts
  - client/src/components/common/data/table/sortable-head.tsx
  - client/src/components/common/data/table/table-cards.tsx
  - client/src/components/common/data/table/table-content.tsx
  - client/src/components/common/data/table/table-frame.tsx
  - client/src/components/common/data/table/table-pagination.tsx
  - client/src/components/common/data/table/table-rows.tsx
  - client/src/components/common/data/table/table-sort.ts
  - client/src/components/common/data/table/use-column-sort.ts
  - client/src/components/common/form-layout.tsx
  - client/src/components/common/stat-card.tsx
  - client/src/components/common/theme-toggle.tsx
  - client/src/components/domain/stack/brownfield-import.tsx
  - client/src/components/domain/stack/deploy-warnings-alert.tsx
  - client/src/components/domain/stack/env-editor.tsx
  - client/src/components/domain/stack/service-status-badge.tsx
  - client/src/components/domain/stack/service-update-badge.tsx
  - client/src/components/domain/stack/stack-breadcrumb.tsx
  - client/src/components/domain/stack/stack-list.tsx
  - client/src/components/domain/stack/stack-status-badge.tsx
  - client/src/components/sidebar-version-block.tsx
  - client/src/hooks/use-backup-defaults.ts
  - client/src/hooks/use-stacks.ts
  - client/src/index.css
  - client/src/lib/dashboard-stats.ts
  - client/src/lib/stacks-api.ts
  - client/src/lib/status-labels.ts
  - client/src/lib/touch-target.ts
  - client/src/routes/app/account/components/disable-two-factor-dialog.tsx
  - client/src/routes/app/account/components/enroll-dialog.tsx
  - client/src/routes/app/account/components/regenerate-codes-dialog.tsx
  - client/src/routes/app/dashboard/components/dashboard-stat-cards.tsx
  - client/src/routes/app/settings/components/backup-defaults-card.tsx
  - client/src/routes/app/settings/components/certificates-card.tsx
  - client/src/routes/app/settings/components/general-settings-card.tsx
  - client/src/routes/app/settings/components/notification-log-card.tsx
  - client/src/routes/app/stacks/[id].tsx
  - client/src/routes/app/stacks/backups/components/backup-detail-header.tsx
  - client/src/routes/app/stacks/components/activity-timeline.tsx
  - client/src/routes/app/stacks/components/backup-history.tsx
  - client/src/routes/app/stacks/components/backup-schedule-dialog.tsx
  - client/src/routes/app/stacks/components/config-tab.tsx
  - client/src/routes/app/stacks/components/create-stack-form.tsx
  - client/src/routes/app/stacks/components/health-probe-form.tsx
  - client/src/routes/app/stacks/components/incident-list.tsx
  - client/src/routes/app/stacks/components/proxy-assign-dialog.tsx
  - client/src/routes/app/stacks/components/proxy-domains-table.tsx
  - client/src/routes/app/stacks/components/proxy-tab.tsx
  - client/src/routes/app/stacks/components/services-section.tsx
  - client/src/routes/app/stacks/components/snapshots-section.tsx
  - client/src/routes/app/stacks/components/stack-actions.tsx
  - client/src/routes/app/stacks/components/stack-detail-header.tsx
  - client/src/routes/app/stacks/components/stack-tab-bar.tsx
  - client/src/routes/app/storage/components/storage-backups-section.tsx
  - client/src/routes/app/storage/components/storage-stacks-table.tsx
  - client/src/routes/auth/components/login-form.tsx
  - client/src/routes/auth/components/signup-form.tsx
  - client/src/routes/auth/components/two-factor-step.tsx
  - client/src/routes/setup/components/account-step.tsx
  - client/src/routes/setup/components/backup-step.tsx
  - client/src/routes/setup/components/notifications-step.tsx
  - client/src/routes/setup/components/proxy-step.tsx
  - client/src/routes/setup/components/settings-step.tsx
  - server/src/application/index.ts
  - server/src/application/stack-service.ts
  - server/src/repositories/backup-repository.ts
findings:
  critical: 0
  warning: 6
  info: 7
  total: 13
status: issues_found
---

# Phase 20: Code Review Report

**Reviewed:** 2026-10-21
**Depth:** standard
**Files Reviewed:** 68
**Status:** issues_found

## Summary

The server change is sound. `hasBackup` comes from one `groupBy` over COMPLETED rows with MANUAL or SCHEDULED trigger. The `BackupStatus` and `BackupTrigger` enums match the Prisma schema. `StackService` depends on a narrow port, and `index.ts` is the only construction site in `src`. The backup-complete path writes the COMPLETED row before it emits `stack_status`, so the client refetch after `BACKING_UP` does not race it.

On the client, `KNOWN_STACK_STATUSES` matches the Prisma `StackStatus` enum exactly. No light-only colour utilities lack a `dark:` counterpart. Every `DataTable` consumer passes the now-required `emptyMessage`.

The defects cluster in the new mobile card layout and its accessibility. `TableCards` drops column styling, the sort toolbar hides direction, and clickable rows and cards are unreachable by keyboard. There is also one missed touch target, a stale-state read in `useStacks`, and unvalidated pagination query params.

(Reviewer note: the reviewer subagent could not write this file itself; the orchestrator persisted its report verbatim. Nothing was built or run by the reviewer.)

## Warnings

### WR-01: Column `className` is ignored in the mobile card layout, so mono, tabular and truncation styling is lost

**File:** `client/src/components/common/data/table/table-cards.tsx:49-73` (compare `table-content.tsx:19-21`)
**Issue:** `cellClass(col)` applies `col.className` and `align` only to `<TableCell>` in the desktop table. `CardFields` renders `col.render(item)` without any column class. Consumers that moved to `DataTable` in this phase put technical-value styling in `className`, so it silently disappears below `md`:
- `certificates-card.tsx:185` Domain Pattern `font-mono text-xs`
- `snapshots-section.tsx:86` Snapshot ID `font-mono text-xs`
- `services-section.tsx:206` Ports `font-mono text-xs text-muted-foreground`
- `backup-history.tsx` Started, Duration and Size (`text-muted-foreground`, `tabular-nums`)
- `notification-log-card.tsx:12` Message `max-w-xs truncate`, so long messages now wrap and squeeze the label in the `justify-between` row
- `storage-*` Size `tabular-nums`

This defeats UI-03 (technical values in mono) on mobile.
**Fix:** Apply the non-layout part of `className` in `CardFields`:
```tsx
<span className={cn(col.className)}>{col.render(item)}</span>
```
and use `cn(title.className)` on the title div. Alternatively, move typographic styling into each column's `render`, and keep `className` for table-only layout such as `w-full max-w-0`. Add a card-layout test that asserts the mono class.

### WR-02: Clickable rows and cards are not keyboard or screen-reader operable

**File:** `client/src/components/common/data/table/table-content.tsx:104-107`, `client/src/components/common/data/table/table-cards.tsx:86-89`, `client/src/components/domain/stack/stack-list.tsx:26-37`
**Issue:** `itemRoute` is implemented only as `onClick={() => navigate(...)}` on a `<tr>` or `<Card>`. There is no `role`, `tabIndex` or key handler, and the `StackList` Name column renders a plain `<span>`, so no link exists. A keyboard or assistive-tech user cannot open a stack from the stacks list at all. The behaviour pre-dates the phase, but the phase rewrote both code paths and is explicitly about accessibility.
**Fix:** Render the key column as a `<Link to={itemRoute(item)}>` and make the row click a progressive enhancement. A smaller option is to add `tabIndex={0}`, `role="link"` and an `onKeyDown` handler for Enter and Space when `itemRoute` is set.

### WR-03: Mobile sort toolbar does not expose the sort direction to assistive tech

**File:** `client/src/components/common/data/table/table-cards.tsx:32-43`
**Issue:** The direction icon is `aria-hidden`, and the button only carries `aria-pressed={direction !== "none"}`. Ascending versus descending is therefore never announced. Desktop has `aria-sort` on `SortableHead`, so the two layouts are not equivalent.
**Fix:**
```tsx
aria-label={direction === "none" ? `Sort by ${col.name}` : `Sort by ${col.name}, ${direction === "asc" ? "ascending" : "descending"}`}
```

### WR-04: Pagination query params accept negative and fractional page sizes

**File:** `client/src/components/common/data/table/data-table.tsx:70-75`
**Issue:** `Number(searchParams.get("pageSize")) || defaultPageSize` accepts any truthy number.
- `?pageSize=-3` makes `slice(start, start + pageSize)` drop the last three rows silently. `totalPages` clamps to 1 and the footer renders a Select whose value matches no option.
- `?pageSize=0.5` yields an empty page with `totalPages = 2n`.

The shared `pageSize` and `page` params are user-controlled URL input. This is pre-existing logic that the phase touched.
**Fix:** Parse against the allowed set:
```ts
const requested = Number(searchParams.get("pageSize"));
const pageSize = pagination
    ? (PAGE_SIZE_OPTIONS.includes(requested) ? requested : defaultPageSize)
    : sortedData.length;
```
Export `PAGE_SIZE_OPTIONS` from `table-pagination.tsx`. Also floor `page` with `Math.floor`.

### WR-05: Copy-setup-key icon button misses the 44px touch target (A11Y-01)

**File:** `client/src/routes/app/account/components/enroll-dialog.tsx:169-177`
**Issue:** It is `size="icon"` (36px) with no `TOUCH_TARGET`, while every other icon-only control touched in this phase was migrated. The success and failure feedback comes from `copyToClipboard` in `@/lib/clipboard`, so only the target size is missing.
**Fix:** Add `className={TOUCH_TARGET}` (`import {TOUCH_TARGET} from "@/lib/touch-target"`).

### WR-06: `useStacks` decides on a render-time snapshot of `stacks` inside the SSE handler

**File:** `client/src/hooks/use-stacks.ts:61-72`
**Issue:** `previousStatus` is read from the `stacks` closure, while the update is done with a functional `setStacks`. If two events arrive before a re-render (for example a `container_state` and then a `stack_status` for the same stack), the second handler sees the stale pre-first-event status. The refetch that keeps Backup Coverage honest can then be skipped or fire spuriously. Only `stack_status` events trigger the refetch, so a `container_state` event that carries `stackStatus` out of `BACKING_UP` would never refresh `hasBackup`.
**Fix:** Keep a `useRef<Map<string, string>>` of last-known status. Update it from every event type that carries a status, and compare against it in the handler. Do not read `stacks` from the closure.

## Info

### IN-01: The uncontrolled sort path has no consumer

**File:** `client/src/components/common/data/table/use-column-sort.ts`, `table-sort.ts`, `data-table.tsx:28-29`, `index.ts:8,10`
**Issue:** No consumer sets `sortValue`. The only sortable consumer, `storage-stacks-table.tsx`, uses the controlled `sort`. `useColumnSort`'s resolve and sort logic, `nextSortDirection`, `sortRows` and the `SortableHead` re-export are exercised only by tests. That is speculative surface in a shared component.
**Fix:** Remove it until a second consumer needs it, or keep it and mark why in a comment.

### IN-02: `ExpiryCell` labels already-expired certificates as "Expiring soon"; non-null assertions in upload

**File:** `client/src/routes/app/settings/components/certificates-card.tsx:45-50` and `:145-147`
**Issue:** `daysUntilExpiry <= CERTIFICATE_EXPIRY_WARNING_DAYS` is also true for negative values, so an expired cert shows a yellow "Expiring soon" pill. Separately, `certFile!` and `keyFile!` rely on a flag computed earlier, which CLAUDE.md discourages.
**Fix:** Add an "Expired" red `ToneBadge` when `daysUntilExpiry < 0`. Narrow the files with `if (!certFile || !keyFile) { ...; return; }` and drop the assertions.

### IN-03: Stacked per-domain values lose row alignment in card layout

**File:** `client/src/routes/app/stacks/components/proxy-domains-table.tsx:67-160`
**Issue:** On desktop the `Stacked` columns line up row by row. In cards each column is a separate labelled line, so a service with two domains shows "Internal Port 80 / 8080" with no mapping back to a domain.
**Fix:** In card mode render one card per domain, or use `layout.mode` through `renderExpanded` to render a per-domain list.

### IN-04: `BrownfieldImport` hand-rolls a non-responsive table beside the shared `DataTable`

**File:** `client/src/components/domain/stack/brownfield-import.tsx:215-261`
**Issue:** It imports `ui/table` directly and has no mobile card layout, unlike the other migrated lists. The Directory cell uses `min-w-48` and the Actions cell can overflow narrow screens.
**Fix:** Move it to `DataTable` with `hideHeader` on Actions, or document why it is excluded.

### IN-05: Dashboard stats comment contradicts the logic

**File:** `client/src/lib/dashboard-stats.ts:15-26`
**Issue:** The comment says the code "mirrors" the server's `stack.backupSchedule ?? globalDefault`. The server's `??` does not fall back for `""`, but the client treats `""` as unset and falls back to the global default. The UI never stores `""` because it saves `|| null`, so this is latent only.
**Fix:** Align the comment, or make the check `stackSchedule ?? globalDefault`.

### IN-06: Proxy step blames port conflicts for any deploy error

**File:** `client/src/routes/setup/components/proxy-step.tsx:64-67`
**Issue:** The copy always says "ports 80/443 are already in use" while the prop comment says the error is "raw server error, unwrapped". A Docker outage or compose error would be misattributed.
**Fix:** Use generic copy such as "Could not deploy the proxy stack." and show the raw error. Only mention ports when the error indicates a conflict.

### IN-07: `describeServiceUpdate` duplicates the badge copy; redundant re-exports; `listStacks` coupling

**File:** `client/src/components/domain/stack/service-update-badge.tsx:9-34`, `service-status-badge.tsx:5`, `stack-status-badge.tsx:5`, `server/src/application/stack-service.ts:227-233`
**Issue:**
- `ServiceUpdateBadge` re-types the "Update available →" string instead of using `describeServiceUpdate`, so the copy can drift.
- The two status badge files re-export the presentation helpers from `@/lib/status-labels` for no in-file reason.
- `listStacks()` now fails entirely if the extra `findStackIdsWithSnapshot()` query rejects, because it sits in the same `Promise.all`. An auxiliary flag can take the dashboard list down.

**Fix:** Build the JSX from `describeServiceUpdate`'s parts, or export one constant prefix. Import helpers from `status-labels` at call sites. Consider catching the backup query and logging, with a documented `hasBackup: false` fallback, if degraded listing is preferred.

---

_Reviewed: 2026-10-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
