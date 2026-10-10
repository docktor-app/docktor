---
phase: 14-health-uptime-and-disk-visibility
plan: 05
subsystem: ui
tags: [react, vite, vitest, playwright, react-router, tailwind, shadcn-table]

requires:
  - phase: 14-health-uptime-and-disk-visibility
    provides: 14-02 GET /api/storage (per-stack and per-volume sizes, local backups, totals)
  - phase: 14-health-uptime-and-disk-visibility
    provides: 14-03 fixtures.ts default health-events stub (ownership ordering only)
provides:
  - getStorageOverview() API client and StorageOverview / StorageStack / StorageVolume / StorageBackup / StorageTotals types
  - formatBytes(bytes | null) base-1024 formatter
  - pure Storage view helpers (sort, aria-sort, next-sort, staleness, age and volume-count wording)
  - useStorage() hook with loading / error / retry
  - Storage page at /storage with three totals, a sortable Stacks table with per-volume expansion, a Backups section with subtotal, and empty / loading / error / stale / unmeasured states
  - Storage sidebar item between Stacks and Settings
  - generic EmptyState common component
  - default Playwright stub for /api/storage
affects: [14-07 stack overview disk card (reuses formatBytes), 14-14 phase verification]

actuals:
  tokens: 17040
  tasks: 2
  commits: 2
plan_head_before: c3c621f09ea9af352691ee87cd58c8123583e4cc
plan_head_after: b436890effacb92328f45fa8985f5e1863b39452

tech-stack:
  added: []
  patterns:
    - "One sort comparator shared by stacks and volumes: unmeasured (null) entries always last, ties by name ascending"
    - "Expandable table rows as a Fragment per record; aria-controls names the first child row"
    - "Failed load hides the data sections and shows only the alert and em-dash totals"

key-files:
  created:
    - client/src/lib/storage-api.ts
    - client/src/lib/format-bytes.ts
    - client/src/lib/storage-view.ts
    - client/src/hooks/use-storage.ts
    - client/src/routes/app/storage.tsx
    - client/src/routes/app/storage/components/storage-totals.tsx
    - client/src/routes/app/storage/components/storage-stacks-table.tsx
    - client/src/routes/app/storage/components/storage-backups-section.tsx
    - client/src/routes/app/storage/components/storage-status-alerts.tsx
    - client/src/components/common/empty-state.tsx
    - client/test/integration/storage.spec.ts
  modified:
    - client/src/router.tsx
    - client/src/components/app-sidebar.tsx
    - client/test/integration/fixtures.ts

key-decisions:
  - "formatBytes renders null as an em dash (UI-SPEC section B says en dash once, but every copy row uses the em dash)"
  - "On a failed load the page shows only the destructive alert and em-dash totals; the Stacks and Backups sections are not rendered, so a failure never reads as 'No stacks to measure'"
  - "The page, not the hook, discards a previously loaded overview once an error is set (data = error ? null : overview)"
  - "aria-controls on the volume expander points at the first child row (id storage-volumes-{stackId}), the plan-sanctioned alternative to a second tbody, which would lose the last-row border handling of TableBody"
  - "Measurement age wording: whole hours under two days, whole days beyond, with singular handling"
  - "Phone-width overflow backstop is covered by a 412px viewport case in storage.spec.ts on the chromium project, because the mobile-chromium project matches only mobile.spec.ts"

patterns-established:
  - "EmptyState (components/common): heading plus optional body, centered py-12 with an 18px heading"
  - "Pitfall 7 default stub: fixtures.ts registers an empty overview for /api/storage; specs override per test"

requirements-completed: ["#27"]

coverage:
  - id: D1
    description: "Storage sidebar item (HardDrive) between Stacks and Settings opens /storage inside the protected layout with a Storage breadcrumb"
    requirement: "#27"
    verification:
      - kind: e2e
        ref: "client/test/integration/storage.spec.ts#the sidebar Storage link opens the page with totals and stacks, largest first"
        status: pass
      - kind: unit
        ref: "client/test/unit/routes/storage/storage-page.test.tsx#renders the title, description and breadcrumb"
        status: pass
    human_judgment: false
  - id: D2
    description: "Three StatCards (Total Disk Used, Stack Volumes, Local Backups) from the server totals; em dash when nothing is measured or the load fails"
    requirement: "#27"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/storage/storage-page.test.tsx#shows the three totals from the server"
        status: pass
      - kind: unit
        ref: "client/test/unit/lib/format-bytes.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Stacks table sortable by Stack and Size with ghost-button headers and aria-sort; default Size descending; first click applies natural direction, second reverses; ties by name; unmeasured stacks last in both directions"
    requirement: "#27"
    verification:
      - kind: unit
        ref: "client/test/unit/lib/storage-view.test.ts"
        status: pass
      - kind: unit
        ref: "client/test/unit/routes/storage/storage-stacks-table.test.tsx#StorageStacksTable sorting"
        status: pass
      - kind: e2e
        ref: "client/test/integration/storage.spec.ts#the Size header reverses the order and the unmeasured stack stays last"
        status: pass
    human_judgment: false
  - id: D4
    description: "Per-volume expansion: Show/Hide volumes button with aria-expanded and aria-controls, one bg-muted/50 child row per volume sorted like the parent, several stacks open at once, Link to the stack, volume-count hint and no-volumes copy"
    requirement: "#27"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/storage/storage-stacks-table.test.tsx#StorageStacksTable volume expansion"
        status: pass
      - kind: e2e
        ref: "client/test/integration/storage.spec.ts#expanding a stack reveals its volumes"
        status: pass
    human_judgment: false
  - id: D5
    description: "Backups section: one row per local repository, largest first, Backups subtotal footer; empty copy and no footer when there are none"
    requirement: "#27"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/storage/storage-backups-section.test.tsx"
        status: pass
      - kind: e2e
        ref: "client/test/integration/storage.spec.ts#the Backups section lists local repositories, largest first, with a subtotal"
        status: pass
    human_judgment: false
  - id: D6
    description: "Page states: loading skeletons, destructive error Alert with working Retry, never-measured and no-stacks empty states, out-of-date warning above 48 hours, Last measured stamp"
    requirement: "#27"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/storage/storage-page.test.tsx#StoragePage states"
        status: pass
      - kind: e2e
        ref: "client/test/integration/storage.spec.ts#a failed load shows the error alert and Retry recovers"
        status: pass
    human_judgment: false
  - id: D7
    description: "Existing Playwright specs (stacks, mobile, theme) still pass with the new nav item through the default /api/storage stub"
    requirement: "#27"
    verification:
      - kind: e2e
        ref: "stacks.spec.ts, mobile.spec.ts, theme.spec.ts, storage.spec.ts (system Edge, no unstubbed-request error)"
        status: pass
    human_judgment: false
  - id: D8
    description: "Long stack and volume names truncate with a title and neither Storage table nor the page scrolls horizontally at Pixel 7 width; chevron rotation, reduced motion, light and dark rendering and Tab order"
    requirement: "#27"
    verification:
      - kind: e2e
        ref: "client/test/integration/storage.spec.ts#long stack and volume names truncate and nothing scrolls horizontally"
        status: pass
    human_judgment: true
    rationale: "Overflow and truncation are measured by script at 412px, but the plan's human-check (visual legibility in both themes, chevron animation and reduced motion, keyboard order) was not performed by a person. Recorded in .planning/WINDOWS.md."

duration: 18min
completed: 2026-10-08
status: complete
---

# Phase 14 Plan 05: Storage page client Summary

**A /storage page, reached from a new sidebar item, shows total disk used (volumes + backups), a sortable per-stack table whose rows expand to per-volume sizes, and a local Backups section with a subtotal, with every empty, loading, error, stale and unmeasured state handled**

## Performance

- **Duration:** 18 min
- **Started:** 2026-10-08T08:53:42Z
- **Completed:** 2026-10-08T09:11:56Z
- **Tasks:** 2 (1 tracer, 1 auto)
- **Files modified:** 20 (14 created, 6 modified in the plan's commits)

## Accomplishments
- `getStorageOverview()`, `formatBytes()`, pure sort and staleness helpers, and `useStorage()` (loading / error / retry, no SSE because the measurement is daily).
- Tracer: sidebar link to `/storage` to totals and the stack list, largest first, verified end to end before any expansion work. Log: `Tracer verified end-to-end - expanding` (22 unit tests, typecheck, and 34 Playwright cases across storage, stacks and mobile all passed).
- Stacks table with `aria-sort` ghost-button headers, natural-direction-then-reverse sorting, unmeasured stacks always last, and per-volume child rows sorted by the same key; several stacks can stay open.
- Backups section with the UI-SPEC description, largest-first rows and a `Backups subtotal` footer; Storage page order is alerts, totals, Stacks, Backups, in a 57-line orchestrator.
- Status alerts: destructive `Couldn't load disk usage` with Retry, and a yellow (dark-paired) `Disk usage is out of date` warning above 48 hours.
- `/api/storage` default stub in `fixtures.ts` keeps every pre-existing spec green through the unstubbed-request guard.

## Task Commits

1. **Task 1: End-to-end Storage page (tracer)** - `ac38e6e` (feat)
2. **Task 2: Sorting, per-volume expansion, Backups section and page states** - `b436890` (feat)

**Plan metadata:** committed separately (docs: complete plan)

_Note: tests were written alongside each unit and landed in the same commit as the implementation, because CLAUDE.md forbids committing failing tests._

## Files Created/Modified
- `client/src/lib/storage-api.ts` - types and pure `getStorageOverview()`
- `client/src/lib/format-bytes.ts` - base-1024 formatter, null renders an em dash
- `client/src/lib/storage-view.ts` - sort, aria-sort, next-sort, staleness, age and volume-count helpers
- `client/src/hooks/use-storage.ts` - fetch hook, unknown-narrowed catch, no `any`
- `client/src/routes/app/storage.tsx` - page orchestrator (57 lines)
- `client/src/routes/app/storage/components/` - `storage-totals`, `storage-stacks-table`, `storage-backups-section`, `storage-status-alerts`
- `client/src/components/common/empty-state.tsx` - generic centered empty state
- `client/src/router.tsx`, `client/src/components/app-sidebar.tsx` - route and nav item
- `client/test/integration/fixtures.ts`, `storage.spec.ts` - default stub and 8 e2e cases
- Unit tests: `format-bytes`, `storage-view`, `use-storage`, `storage-page`, `storage-stacks-table`, `storage-backups-section`

## Decisions Made
- See `key-decisions` above. The notable one: a failed load renders only the error alert and em-dash totals, so a failure can never be mistaken for an empty install.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Playwright browsers are not installed on this machine**
- **Found during:** Task 1 verify
- **Issue:** `yarn workspace @docktor/client test:integration ...` cannot launch Chromium (`%LOCALAPPDATA%\ms-playwright` does not exist), same as 14-03.
- **Fix:** No browser was downloaded. The specs were run against the system Edge through a throwaway config kept outside the repository (it imports the project's `playwright.config.ts` and only adds `channel: "msedge"`). Nothing in the repo changed for this.
- **Verification:** storage, stacks, mobile and theme specs all passed (34 + 14 cases), with no "Unstubbed API request(s)" error.
- **Follow-up:** run the canonical command once after `yarn playwright install chromium`.

**2. [Rule 1 - Bug] Test-only flake: Radix Tooltip needs ResizeObserver**
- **Found during:** Task 2, full client unit suite (passed in isolation, failed under load)
- **Issue:** the expander's Tooltip opens after `user.click` and Radix calls `ResizeObserver`, which jsdom lacks; the uncaught exception failed two tests when timing allowed the tooltip to open.
- **Fix:** the same `ResizeObserver` stub `service-health-timeline.test.tsx` uses, in `storage-stacks-table.test.tsx`.
- **Verification:** full suite 92 files / 851 tests passed.
- **Committed in:** b436890

**3. [Scope note] Extra file and a mobile-project adaptation**
- `client/src/components/common/empty-state.tsx` was added (not in the plan's file list) because the same centered heading-plus-body markup is used by two sections; CLAUDE.md puts generic empty states in `components/common`.
- "storage.spec.ts passes on both Playwright projects": the `mobile-chromium` project matches only `mobile.spec.ts`, so the spec runs on `chromium`. The held-out phone-width overflow check is a 412px-viewport case inside `storage.spec.ts`; all 12 `mobile.spec.ts` cases still pass with the new nav item.

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking) plus 1 scope note
**Impact on plan:** No scope change.

## Issues Encountered
- `eslint` is not installed in this workspace, so lint was not run; `yarn typecheck` (tsc --build) is clean.
- Vite logs `http proxy error: /api/events` (ECONNREFUSED) during Playwright runs; the route is stubbed by `fixtures.ts` and the line is pre-existing dev-server noise.
- The plan's human visual check was not performed by a person; see Known Gaps.

## Known Stubs
None.

## Known Gaps
- Human visual check of /storage in light and dark theme at desktop and Pixel 7 width (chevron rotation, reduced motion, Tab order). Recorded as `unrun-verify` in `.planning/WINDOWS.md`.
- Canonical Playwright command not run on a machine with Playwright browsers installed (deviation 1).

## Threat Flags
None. T-14-34 is mitigated: stack and volume names are React text children and `title` attributes only (no `dangerouslySetInnerHTML`), stack links use `encodeURIComponent(stackId)`, and `aria-controls` ids derive from the stack id. T-14-35 is mitigated: `/storage` is registered inside the `ProtectedRoute` layout and the hook surfaces only the server's error message.

## Next Phase Readiness
- `formatBytes` is ready for the 14-07 Overview Disk Used card.
- Other plans adding endpoints should keep the Pitfall 7 pattern (default stub in `fixtures.ts`).
- Open: install Playwright browsers and re-run the canonical e2e command.

## Self-Check: PASSED

- All created files exist on disk (10 source files including `empty-state.tsx`, `storage.spec.ts`, and the unit tests).
- Commits `ac38e6e` and `b436890` are ancestors of HEAD; `git rev-list --count` from the ledger base reports 2.
- Acceptance criteria re-run: `path="/storage"` in router.tsx 1; `"/storage"` in app-sidebar.tsx 1 and ordered between `/stacks` and `/settings`; `/api/storage` in fixtures.ts 2; storage.tsx 57 lines; `any` in hook and libs 0; `aria-sort` 1, `aria-expanded` 1, `Backups subtotal` 1, `Couldn't load disk usage` 1, `Disk usage is out of date` 1.
- Verification: client unit suite 92 files / 851 tests passed; Playwright (system Edge) storage 8/8, stacks 21, mobile 12, theme 6 passed; `yarn typecheck` clean.

---
*Phase: 14-health-uptime-and-disk-visibility*
*Completed: 2026-10-08*
