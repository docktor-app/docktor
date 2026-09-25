---
phase: 10-backend-architecture-refactor
plan: 17
subsystem: ui
tags: [react, hooks, sse, vitest, fake-timers, backups]

# Dependency graph
requires:
  - phase: 10-backend-architecture-refactor
    provides: BackupsTab already receiving a live stackStatus prop from [id].tsx's useStack SSE subscription
provides:
  - "useBackupHistory hook owning the Backups tab's fetch/poll lifecycle with a bounded schedule"
  - "SSE-status-driven refresh so a backup started at any time while the tab is open appears in the history"
affects: [backups, client-hooks]

# Actuals (#2632)
actuals:
  tokens: 6706
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fetch/poll lifecycle owned by a dedicated hook (useBackupHistory), component only renders"
    - "Effect-local plain variables (not state) drive polling schedule decisions, avoiding self-retriggering effects on reference-unstable fetch responses"
    - "A ref-held 'current run's fetch function' lets a second, differently-keyed effect trigger a refresh without duplicating scheduling logic"

key-files:
  created:
    - client/src/hooks/use-backup-history.ts
    - client/test/unit/hooks/use-backup-history.test.ts
    - client/test/unit/routes/stacks/backup-history.test.tsx
  modified:
    - client/src/routes/app/stacks/components/backup-history.tsx
    - client/src/routes/app/stacks/components/backups-tab.tsx

key-decisions:
  - "Task 2 (status-driven refresh) implemented as planner-discretion refinement per the plan's own rationale: the request storm was incidentally keeping the history fresh past the 30s grace window, so removing it without a replacement freshness signal would regress a real (if accidental) property users would notice"
  - "Used the stack's existing SSE-delivered status (already passed to BackupsTab) as the refresh trigger instead of opening a second EventSource, per CLAUDE.md's 'do not poll for state available via SSE'"

patterns-established:
  - "A hook's polling effect depends on [stackId] (or the narrowest identity key) only; all schedule decisions read from in-closure plain variables or the freshly fetched response, never from the state the effect itself writes"

requirements-completed:
  - "Closes UAT gap G-10-2 (major) diagnosed in 10-UAT.md test 3: opening a stack's Backups tab fires a runaway, continuous stream of GET /api/stacks/:id/backups requests. The client defect predates Phase 10, surfaced during Phase 10 UAT, and is closed under the phase's gap-closure pass for GitHub issue #16."

coverage:
  - id: D1
    description: "Opening a stack's Backups tab fetches history once, then polls at most every 3s for 30s, then stops (unless a backup is in progress) — exact request counts pinned by fake-timer tests"
    requirement: "Closes UAT gap G-10-2 (major) diagnosed in 10-UAT.md test 3: opening a stack's Backups tab fires a runaway, continuous stream of GET /api/stacks/:id/backups requests. The client defect predates Phase 10, surfaced during Phase 10 UAT, and is closed under the phase's gap-closure pass for GitHub issue #16."
    verification:
      - kind: unit
        ref: "client/test/unit/hooks/use-backup-history.test.ts#useBackupHistory (10 tests covering mount, no-storm, grace window, in-progress keep-alive, completion stop, unmount, stackId switch, rejected fetch, exported constants)"
        status: pass
      - kind: unit
        ref: "client/test/unit/routes/stacks/backup-history.test.tsx#renders a fresh-array response and, after 10s, has called getBackups exactly 4 times (G-10-2)"
        status: pass
    human_judgment: true
    rationale: "Automated tests pin the exact request schedule against a mocked API client. Live confirmation with devtools' Network panel against the real server (per the plan's own <verification> item 5) still needs a human to observe network traffic in a real browser session, per the plan's explicit deferral to /gsd-verify-work."
  - id: D2
    description: "A backup started at any time while the Backups tab is open appears in the history, driven by the stack's existing SSE status signal, with no new EventSource and no open-ended polling"
    verification:
      - kind: unit
        ref: "client/test/unit/hooks/use-backup-history.test.ts#status-driven refresh (Task 2) (3 tests: no duplicate fetch on mount/same-value re-render, one immediate refresh + resumed bounded polling on a post-grace-window status change then stop on completion, exactly one fetch on combined stackId+status switch)"
        status: pass
      - kind: unit
        ref: "client/test/unit/routes/stacks/backup-history.test.tsx#shows a newly started backup after a stackStatus change, driven by the live status signal (Task 2)"
        status: pass
    human_judgment: true
    rationale: "Automated tests prove the refresh fires on a mocked stackStatus prop change. Live confirmation that clicking Backup Now after 30s shows the new row and updates it to completion (plan's <verification> item 5) needs a human against a real instance, per the plan's explicit deferral to /gsd-verify-work."

duration: ~20min
completed: 2026-09-25
status: complete
---

# Phase 10 Plan 17: Backups Tab Request Storm Fix (G-10-2 Gap Closure) Summary

**New `useBackupHistory` hook replaces backup-history.tsx's self-retriggering polling effect with a `[stackId]`-only schedule, plus an SSE-status-driven refresh so new backups still appear promptly.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-09-25T21:40:00Z (approx)
- **Completed:** 2026-09-25T21:53:50Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Extracted `backup-history.tsx`'s fetch/poll `useEffect` into a new `useBackupHistory(stackId, stackStatus)` hook whose polling effect depends on `[stackId]` alone — the binding fix for G-10-2's root cause (the old effect's `[stackId, backups]` dependency array self-retriggered on every fetch because `getBackups()` returns a new array reference every time).
- Schedule decisions (keep polling / stop after the 30s grace window / keep polling while a backup is `IN_PROGRESS`) are made from plain effect-local variables and the freshly fetched response — never from the `backups` state the effect itself writes, closing the stale-closure secondary symptom too.
- Added an SSE-status-driven refresh (Task 2, planner-discretion refinement): a second effect keyed on `[stackId, stackStatus]` compares against the last-seen pair and, on an actual same-stack status change, invokes the current polling run's own fetch function via a ref — reusing Task 1's after-fetch scheduling logic rather than duplicating it. No new `EventSource` is opened; the stack's live status already arrives over the page's existing SSE subscription (`useStack` -> `[id].tsx` -> `BackupsTab` -> `BackupHistory`).
- `backup-history.tsx` is now a pure render component (no `useEffect`/`useState`, no `react` value imports); `backups-tab.tsx` passes its existing `stackStatus` prop through.
- 15 new/updated unit tests (10 hook + 3 hook status-refresh + 2 component tracer) pin every scheduling rule with exact request counts using `vi.useFakeTimers()`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Opening the Backups tab fetches history once, then polls on a bounded schedule (G-10-2)** - `fad393e` (fix)
2. **Task 2: A backup started any time while the tab is open appears in the history** - `423e9bc` (feat)

_TDD tasks: both tasks followed RED -> GREEN within a single commit each (RED confirmed via a fast-failing pre-commit test run, not committed separately) — see "RED Evidence" below._

## Files Created/Modified
- `client/src/hooks/use-backup-history.ts` - New hook: owns fetch/poll lifecycle, exports `BACKUP_HISTORY_POLL_INTERVAL_MS`/`BACKUP_HISTORY_GRACE_WINDOW_MS`, single `[stackId]` polling effect plus a `[stackId, stackStatus]` refresh effect
- `client/src/routes/app/stacks/components/backup-history.tsx` - Now renders from `useBackupHistory()`; no effects/state of its own; `Readonly<BackupHistoryProps>`
- `client/src/routes/app/stacks/components/backups-tab.tsx` - Passes `stackStatus` through to `BackupHistory`; `Readonly<BackupsTabProps>`
- `client/test/unit/hooks/use-backup-history.test.ts` - 13 fake-timer tests pinning exact request counts for every scheduling rule
- `client/test/unit/routes/stacks/backup-history.test.tsx` - 2 component-level tracer tests: bounded request count end-to-end, and history freshness after a status change

## RED Evidence

**Task 1 (component tracer, run against the unchanged pre-fix component):**
```
timeout 180 ../node_modules/.bin/vitest run test/unit/routes/stacks/backup-history.test.tsx
```
Result: FAILED fast (251ms, no hang) —
`AssertionError: expected "vi.fn()" to be called 4 times, but got 51 times`
(hit the test's own 50-call circuit breaker, confirming the storm; the fixed component never reaches the breaker).

**Task 1 (hook test, run before the hook module existed):**
```
timeout 180 ../node_modules/.bin/vitest run test/unit/hooks/use-backup-history.test.ts
```
Result: FAILED — `Error: Failed to resolve import "../../../src/hooks/use-backup-history"`.

**Task 2 (new behavior cases added to both files, run against the Task-1-only hook/component):**
```
timeout 180 ../node_modules/.bin/vitest run test/unit/hooks/use-backup-history.test.ts test/unit/routes/stacks/backup-history.test.tsx
```
Result: 2 of 15 tests FAILED (all 10 Task 1 hook tests + 1 Task 1 component test still passed) —
- Hook: `a status change after the grace window triggers one immediate refresh...` — `expected 11 to be 12` (no refresh fired; hook ignored the extra argument).
- Component: `shows a newly started backup after a stackStatus change...` — `Unable to find an element with the text: In progress...` (component didn't forward `stackStatus`).

## GREEN Confirmation

Command form used (yarn's corepack download of yarn@4.13.0 is blocked by this sandbox's egress proxy, per the plan's documented environment fallback):
```
cd client && ../node_modules/.bin/vitest run test/unit/hooks/use-backup-history.test.ts test/unit/routes/stacks/backup-history.test.tsx
```
- After Task 1's GREEN edit: 11/11 tests passed (10 hook + 1 component).
- After Task 2's GREEN edit: 15/15 tests passed (13 hook + 2 component).
- Full client unit suite (`../node_modules/.bin/vitest run` from `client/`): **27 files, 259 tests passed, 3 todo** (pre-existing, unrelated) — no regressions.
- Typecheck: `node_modules/.bin/tsc --build --force` from repo root — clean, no output, exit 0.

## Decisions Made
- Task 2's status-driven refresh implemented exactly as the plan's rationale specifies: a ref holding the current polling run's fetch function, plus a second effect comparing `{stackId, stackStatus}` against a ref-held last-seen pair, so a same-stack status change triggers exactly one refresh with no duplicate scheduling logic and no new SSE connection.
- Left all existing Task-1 hook test calls (`useBackupHistory("s1")`, one argument) unchanged rather than retrofitting a second `stackStatus` argument — `client/tsconfig.json`'s `include` is `["src"]` only, so test files aren't typechecked, and the extra unused parameter is harmless at runtime (esbuild strips types, JS ignores the missing argument). New Task 2 tests explicitly exercise the two-argument signature.

## Deviations from Plan

None - plan executed exactly as written, including the Task 1 tracer's 50-call circuit-breaker mock and the `timeout 180` RED-run guard.

## Issues Encountered

None. `yarn` could not run in this sandbox (corepack's yarn@4.13.0 download blocked by egress proxy, 403) — used the plan's own documented fallback: `node_modules/.bin/vitest` directly from `client/` and `node_modules/.bin/tsc --build` from the repo root. `shared/dist/` was already built from a prior session, so no `yarn workspace @docktor/shared build` step was needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G-10-2 is closed at the automated-test level: the Backups tab's request schedule is bounded and pinned by 15 exact-count fake-timer tests (10 for Task 1's core fix, 5 combined for Task 2's refresh refinement), and the full client unit suite plus monorepo typecheck are green with no regressions.
- Live confirmation is explicitly deferred to `/gsd-verify-work` per the plan's own `<verification>` item 5: open a stack's Backups tab with devtools' Network panel open (expect one request, a few more over 30s, then silence), then click Backup Now after more than 30s and confirm the new row appears, updates, and requests stop once it completes.
- No blockers for closing out the remaining Phase 10 gap-closure items (G-10-1, G-10-3, G-10-4) — this plan touched only the five files listed in its own `files_modified` and made no changes to shared orchestrator artifacts (STATE.md, ROADMAP.md), per the dispatch instructions.

---
*Phase: 10-backend-architecture-refactor*
*Completed: 2026-09-25*

## Self-Check: PASSED

All key files (`use-backup-history.ts`, both test files, `backup-history.tsx`, `backups-tab.tsx`, this SUMMARY) confirmed present on disk; both task commits (`fad393e`, `423e9bc`) confirmed present in `git log --oneline --all`.
