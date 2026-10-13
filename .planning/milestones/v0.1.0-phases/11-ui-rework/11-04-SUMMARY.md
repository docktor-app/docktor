---
phase: 11-ui-rework
plan: 04
subsystem: client-ui
tags: [react, dashboard, stat-card, sse, playwright, vitest]

# Dependency graph
requires:
  - phase: 11-ui-rework
    provides: "Section/SectionHeader/SectionTitle/SectionActions primitive (11-01) — this plan's flattened Recent Stacks composes it instead of a Card"
provides:
  - "StatCard (client/src/components/common/stat-card.tsx) — generic {label, value, icon, loading, valueClassName} stat card, no domain types, reused by all six dashboard cards"
  - "computeDashboardStats() / DashboardStats (client/src/lib/dashboard-stats.ts) — pure stat computation covering total/running/stopped/errors/updatesAvailable/backupsConfigured"
  - "useBackupDefaults() (client/src/hooks/use-backup-defaults.ts) — single GET /api/settings/backup-defaults fetch-on-mount hook"
  - "DashboardStatCards (client/src/routes/app/dashboard/components/dashboard-stat-cards.tsx) — six-card section wired to loading/error/partial states"
  - "Stack.backupSchedule field on the client Stack interface"
  - "useStacks() background-refetch-on-update_available (D-09 list-liveness half)"
affects: [11-05, 11-06, 11-07, 11-08]

# Actuals (#2632)
actuals:
  tokens: 9200
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "fetchStacks(mode: 'initial' | 'background') split in useStacks(), mirroring use-stack.ts's fetchStack(mode) — a background SSE-triggered refresh never flips loading back to true or clears the already-rendered list"
    - "StatCard is the canonical common/ presentational shape for any future single-number metric card: {label, value, icon, loading?, valueClassName?}, no domain types in props"

key-files:
  created:
    - client/src/components/common/stat-card.tsx
    - client/src/lib/dashboard-stats.ts
    - client/src/hooks/use-backup-defaults.ts
    - client/src/routes/app/dashboard/components/dashboard-stat-cards.tsx
    - client/test/unit/components/common/stat-card.test.tsx
    - client/test/unit/lib/dashboard-stats.test.ts
    - client/test/unit/hooks/use-backup-defaults.test.ts
  modified:
    - client/src/lib/stacks-api.ts
    - client/src/routes/app/dashboard.tsx
    - client/src/hooks/use-stacks.ts
    - client/test/unit/hooks/use-stacks.test.ts
    - client/test/unit/components/domain/stack/stack-list.test.tsx
    - client/test/unit/routes/stacks/stack-detail-page.test.tsx
    - client/test/integration/stacks.spec.ts
    - client/test/integration/auth.spec.ts
    - client/test/integration/setup-wizard.spec.ts

key-decisions:
  - "Errors card colors both the AlertTriangle icon and the value text-red-600 dark:text-red-400 (plan text left this card's icon/value split unqualified, unlike Running's explicit 'value'-only and Updates Available's explicit 'icon'-only qualifiers) — chosen to preserve the original dashboard.tsx's established double-colored-error convention rather than inventing a third treatment."
  - "hasEffectiveBackupSchedule() in computeDashboardStats treats an empty-string backupSchedule identically to null before falling back to the global default, so a stack with backupSchedule: \"\" is never miscounted as configured."
  - "Two existing strictly-typed test helpers (stack-list.test.tsx's buildStack, stack-detail-page.test.tsx's makeStack) were updated to include the new required Stack.backupSchedule field — a direct, in-scope Rule 3 fix since adding a required interface field breaks any full object-literal conformance, even though tsc -b itself does not type-check test/ (only src/)."

patterns-established:
  - "StatCard (components/common/stat-card.tsx) is the reusable shape for any future single-number metric card anywhere in the app — do not hand-roll another inline Card+Skeleton block."
  - "useX() hooks that own a single fetch-on-mount request narrow their catch clause via `err instanceof Error` (never `err: any`), matching useSetupStatus/useStack precedent."

requirements-completed:
  - "GH-15 (docktor-app/docktor#15) — this plan implements D-14 (reusable StatCard + two extra at-a-glance stats), the dashboard half of D-03, and the live-refresh half of D-09 on the list surface; closes CLAUDE.md's Known Refactoring Target for routes/app/dashboard.tsx."

coverage:
  - id: D14-CARDS
    description: "Dashboard shows six stat cards (Total Stacks, Running, Stopped, Errors, Updates Available, Backups Configured) all rendered by one reusable StatCard component in components/common/"
    requirement: "GH-15"
    verification:
      - kind: other
        ref: "grep -c '<StatCard' client/src/routes/app/dashboard/components/dashboard-stat-cards.tsx -> 6"
        status: pass
      - kind: e2e
        ref: "client/test/integration/stacks.spec.ts — 'dashboard shows stack stats and recent stacks'"
        status: pass
    human_judgment: false
  - id: D14-COUNTING
    description: "Updates Available counts stacks with >=1 service where updateAvailable is true; Backups Configured counts stacks whose effective schedule (own backupSchedule, else global default) is set (UI-SPEC Discretion Decision 2)"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/lib/dashboard-stats.test.ts"
        status: pass
    human_judgment: false
  - id: UI-SPEC-STATES
    description: "Empty (zero stacks -> all six cards show 0), loading (Skeleton h-8 w-12 on all six), error (em dash on stacks-fetch failure; em dash on Backups Configured alone for a backup-defaults failure), and partial (missing update/backup data counts as 0) rows all covered"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/components/common/stat-card.test.tsx, client/test/unit/lib/dashboard-stats.test.ts"
        status: pass
    human_judgment: false
  - id: UI-SPEC-LONGTEXT
    description: "A stat value with 4+ digits truncates and exposes the full number via title (UI-SPEC backstop row)"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/components/common/stat-card.test.tsx — 'UI-SPEC long-text backstop' test (value=1234567)"
        status: pass
    human_judgment: false
  - id: UI-SPEC-OVERFLOW
    description: "The stat grid wraps to 2 columns on phones, 3 at md, 6 at xl"
    verification:
      - kind: other
        ref: "grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6 class present in dashboard-stat-cards.tsx"
        status: pass
    human_judgment: true
    rationale: "The class names are present and match the spec's breakpoints, but the actual rendered breakpoint behavior was not screenshotted at 375px/768px/1280px in this session — a fair candidate for a human/UI-review pass, matching 11-01's D7 precedent."
  - id: D09-LIST-LIVENESS
    description: "The stack list and dashboard refetch when an update_available SSE event arrives, without a full reload and without flipping loading back to true"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/hooks/use-stacks.test.ts — 'an update_available event triggers a background refetch exactly once, without flipping loading back to true'"
        status: pass
    human_judgment: false
  - id: D03-RECENT-STACKS
    description: "'Recent Stacks' renders as a flat Section (not a Card); StatCards remain Cards"
    requirement: "GH-15"
    verification:
      - kind: other
        ref: "grep -vE '^\\s*(//|\\*)' client/src/routes/app/dashboard.tsx | grep -c '<Card' -> 0"
        status: pass
    human_judgment: false
  - id: TYPOGRAPHY
    description: "StatCard values use text-2xl font-semibold (600), never font-bold"
    requirement: "GH-15"
    verification:
      - kind: other
        ref: "grep -c 'font-bold' client/src/components/common/stat-card.tsx -> 0"
        status: pass
    human_judgment: false
  - id: PAGE-LENGTH
    description: "dashboard.tsx is at most 80 lines"
    requirement: "GH-15"
    verification:
      - kind: other
        ref: "wc -l < client/src/routes/app/dashboard.tsx -> 68"
        status: pass
    human_judgment: false

# Metrics
duration: ~55min
completed: 2026-09-26
status: complete
---

# Phase 11 Plan 04: Dashboard StatCard Extraction + List Liveness Summary

**Extracted the dashboard's four copy-pasted inline stat Cards into a generic `StatCard`, added the Updates Available / Backups Configured stats with full UI-SPEC state coverage, flattened Recent Stacks into a `Section`, and made `useStacks()` refetch in the background on `update_available` SSE events.**

## Performance

- **Duration:** ~55min
- **Started:** 2026-09-26 (task-visible span for this session)
- **Completed:** 2026-09-26
- **Tasks:** 2
- **Files modified:** 16 (7 new, 9 modified)

## Accomplishments

- New `components/common/stat-card.tsx`: generic `StatCard({label, value, icon, loading, valueClassName})` — no domain types in props, `text-2xl font-semibold tabular-nums truncate` value with a `title` attribute for the long-value backstop, `Skeleton className="h-8 w-12"` loading state, `data-slot="stat-card"`.
- New `lib/dashboard-stats.ts`: pure `computeDashboardStats(stacks, globalDefaultSchedule)` returning `{total, running, stopped, errors, updatesAvailable, backupsConfigured}`; `updatesAvailable` counts a stack once regardless of how many services have an update; `backupsConfigured` mirrors the server's `stack.backupSchedule ?? globalDefault` registration rule, treating empty-string schedules as unset.
- New `hooks/use-backup-defaults.ts`: single `getBackupDefaults()` fetch-on-mount, `err instanceof Error` narrowing, no N+1 per-stack request.
- New `routes/app/dashboard/components/dashboard-stat-cards.tsx`: six `StatCard`s in a `grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6`, every card shows `—` when the stacks fetch fails, and Backups Configured alone shows `—` when only the backup-defaults fetch fails.
- Added `Stack.backupSchedule: string | null` to `stacks-api.ts` (the server already sends this field).
- `dashboard.tsx` reduced from 134 lines (four inline Cards + a Recent Stacks Card) to 68 lines: `useStacks()` + `useBackupDefaults()` + `computeDashboardStats()`, `PageHeader`, `DashboardStatCards`, and a flat `Section` "Recent Stacks" (D-03) with a `SectionActions` "View all stacks" link when there are more than 5 stacks.
- `useStacks()` gained the same `fetchStacks(mode: "initial" | "background")` split `use-stack.ts` already has: an `update_available` SSE event now triggers a background refetch that never flips `loading` back to true or clears the already-rendered list (D-09 list-liveness half); the catch clause's error parameter is now `unknown`, narrowed via `instanceof Error`.
- E2E: `**/api/settings/backup-defaults` is now stubbed in every spec that renders the dashboard (`stacks.spec.ts`, `auth.spec.ts`, `setup-wizard.spec.ts`), and the dashboard test asserts both new cards show a value of 1 with one mock stack carrying an updated service and a backup schedule.

## Task Commits

1. **Task 1: Six-stat dashboard row — StatCard, stats computation, backup-defaults hook** - `01c10bd` (feat)
2. **Task 2: Live list refresh on update events and E2E coverage for the new stats** - `e12d0b1` (feat)

**Plan metadata:** this SUMMARY.md, committed separately.

## Files Created/Modified

- `client/src/components/common/stat-card.tsx` - generic single-number stat card
- `client/src/lib/dashboard-stats.ts` - `DashboardStats` / `computeDashboardStats()`
- `client/src/hooks/use-backup-defaults.ts` - `useBackupDefaults()`
- `client/src/routes/app/dashboard/components/dashboard-stat-cards.tsx` - six-card section
- `client/src/lib/stacks-api.ts` - added `Stack.backupSchedule`
- `client/src/routes/app/dashboard.tsx` - reduced to a 68-line composition-only page
- `client/src/hooks/use-stacks.ts` - `fetchStacks(mode)` split, `update_available` refetch, `unknown` catch
- `client/test/unit/components/common/stat-card.test.tsx`, `client/test/unit/lib/dashboard-stats.test.ts`, `client/test/unit/hooks/use-backup-defaults.test.ts` - new unit coverage
- `client/test/unit/hooks/use-stacks.test.ts` - `update_available` + non-Error-rejection cases
- `client/test/unit/components/domain/stack/stack-list.test.tsx`, `client/test/unit/routes/stacks/stack-detail-page.test.tsx` - `backupSchedule: null` added to existing Stack/StackDetail test builders (Rule 3)
- `client/test/integration/stacks.spec.ts`, `client/test/integration/auth.spec.ts`, `client/test/integration/setup-wizard.spec.ts` - `**/api/settings/backup-defaults` stub added to every dashboard-rendering test

## Decisions Made

See `key-decisions` in the frontmatter: the Errors card's icon+value color pairing (preserving the original double-red convention), the empty-string-schedule handling in `computeDashboardStats`, and the Rule 3 fix to two pre-existing test builders that would otherwise construct an incomplete `Stack`/`StackDetail` object literal after `backupSchedule` became a required field.

## Deviations from Plan

**1. [Rule 3 - Blocking] Added `backupSchedule: null` to two pre-existing test object-literal builders**
- **Found during:** Task 1
- **Issue:** `stacks-api.ts`'s `Stack` interface gained a new required `backupSchedule` field; `stack-list.test.tsx`'s `buildStack()` and `stack-detail-page.test.tsx`'s `makeStack()` both construct full `StackWithServices`/`StackDetail` object literals typed against those interfaces, which would now be missing a required property.
- **Fix:** Added `backupSchedule: null` to both builders' default field lists.
- **Files modified:** `client/test/unit/components/domain/stack/stack-list.test.tsx`, `client/test/unit/routes/stacks/stack-detail-page.test.tsx`
- **Verification:** Both files' existing test suites still pass (`yarn workspace @docktor/client test` — 44 files, 361 passed, 3 todo).
- **Commit:** `01c10bd`

**Total deviations:** 1 auto-fixed (1 blocking). **Impact:** none on runtime behavior — a type-completeness fix only, since `tsc -b` does not type-check `test/`.

## Issues Encountered

None. Both tasks' `<verify>` commands and all `<acceptance_criteria>` greps passed on the first attempt; no auth gates, no checkpoints, no architectural deviations.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`StatCard`, `computeDashboardStats()`, and `useBackupDefaults()` are stable, reusable contracts for any later phase-11 plan that needs a single-number metric card or the backup-defaults endpoint. `useStacks()`'s `fetchStacks(mode)` split is now consistent with `use-stack.ts`, so 11-06/11-07/11-08 (further D-03 Card-flattening plans) can follow the same background-refresh pattern without reinventing it. 11-05 (server-side `updateAvailable` enrichment) is the next wave-2 plan; until it lands, "Updates Available" truthfully reports 0 for every stack (per the plan's own `key_links` note), which is expected, not a bug.

## Self-Check: PASSED

All created files found on disk (stat-card.tsx, dashboard-stats.ts, use-backup-defaults.ts, dashboard-stat-cards.tsx, and their three unit test files); all three commits (`01c10bd`, `e12d0b1`, `3761fb7`) found in `git log --oneline --all`.

---
*Phase: 11-ui-rework*
*Completed: 2026-09-26*
