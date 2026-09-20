---
phase: 08-live-state-consistency
plan: 04
subsystem: client-ui
tags: [react, badge, ui-polish, uat-gap-closure]
requires:
  - phase: 08-live-state-consistency
    provides: "Plan 08-01's StackStatusBadge component with per-status variant/color maps and its own regression-lock test suite"
provides:
  - "BACKING_UP renders with the same blue/default-variant/animate-pulse treatment as DEPLOYING and UPDATING"
  - "G-08-7 UAT gap closed with a live user-confirmed color choice, superseding 08-UI-SPEC.md's original gray-only lock for BACKING_UP specifically"
affects: [ui-redesign, stack-status-badge]
actuals:
  tokens: 400
  tasks: 1
  commits: 2
  plan_head_before: 00466bb33d42fc4e8265d8ed610926b7eef5eae3
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified:
    - client/src/components/domain/stack/stack-status-badge.tsx
    - client/test/unit/components/domain/stack/stack-status-badge.test.tsx
key-decisions:
  - "BACKING_UP's statusColors entry set byte-identical to DEPLOYING/UPDATING's existing string (not a near-duplicate), so all three blue-pulsing statuses now share one literal value for future readers"
  - "RESTORING and MIGRATING deliberately left untouched — the UAT gap's root_cause and missing items name only BACKING_UP"
patterns-established: []
requirements-completed:
  - "Closes UAT gap G-08-7 (cosmetic, judgement call V7) diagnosed in 08-UAT.md: the user's live answer to plan 08-01's own judgement question was \"change it also to blue,\" overriding 08-UI-SPEC.md's earlier gray-only lock for BACKING_UP specifically."
coverage:
  - id: D1
    description: "BACKING_UP renders with data-variant=\"default\" and the exact bg-blue-500/15 text-blue-700 border-blue-500/25 animate-pulse class string, identical to DEPLOYING/UPDATING"
    requirement: "G-08-7"
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/stack/stack-status-badge.test.tsx#applies the blue action treatment to BACKING_UP, matching DEPLOYING (G-08-7)"
        status: pass
    human_judgment: false
  - id: D2
    description: "RESTORING and MIGRATING remain outline/gray-plus-pulse, unchanged"
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/stack/stack-status-badge.test.tsx#applies animate-pulse to RESTORING/MIGRATING without promoting it to the blue action color"
        status: pass
    human_judgment: false
duration: 15min
completed: 2026-09-20
status: complete
---

# Phase 08 Plan 04: BACKING_UP Blue Action Treatment Summary

**Promoted the BACKING_UP status badge from gray/outline to the same blue/default/animate-pulse treatment as DEPLOYING and UPDATING, closing UAT gap G-08-7 per the user's live "change it also to blue" answer.**

## Performance
- **Duration:** 15min
- **Started:** 2026-09-20T00:39:38+02:00
- **Completed:** 2026-09-20T00:42:32+02:00
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- `statusConfig.BACKING_UP.variant` changed from `"outline"` to `"default"`.
- `statusColors.BACKING_UP` changed from `"animate-pulse"` to the exact byte-identical string DEPLOYING/UPDATING already use: `"bg-blue-500/15 text-blue-700 border-blue-500/25 animate-pulse"`.
- Replaced the plan 08-01 test that locked BACKING_UP to gray/outline with one asserting the new blue treatment, following the same RED->GREEN TDD discipline as the rest of the file.
- Confirmed RESTORING and MIGRATING are byte-for-byte unchanged (`"animate-pulse"` only, `outline` variant).
- Full client unit suite (247 tests across 25 files) and monorepo typecheck verified clean, modulo a documented pre-existing host-contention flake (see Issues Encountered).

## Task Commits
1. **Task 1 (RED): add failing test for BACKING_UP blue action treatment** - `94667b2` (test)
2. **Task 1 (GREEN): promote BACKING_UP to the blue action treatment** - `5d21894` (feat)

No REFACTOR commit — the two-line map-value change needed no cleanup.

## Files Created/Modified
- `client/src/components/domain/stack/stack-status-badge.tsx` - `BACKING_UP` entry in both `statusConfig` and `statusColors` promoted to the blue/default treatment; `RESTORING`/`MIGRATING` untouched.
- `client/test/unit/components/domain/stack/stack-status-badge.test.tsx` - the `BACKING_UP`-specific test now asserts the blue/default treatment instead of gray/outline; every other test in the file (labels table, DEPLOYING/UPDATING regression locks, RESTORING/MIGRATING gray-lock tests, green/red/gray groups, unknown-status fallback) is unchanged.

## Decisions Made
- Used the exact same literal string for `BACKING_UP`'s color classes as `DEPLOYING`/`UPDATING` (not a functionally-equivalent but textually different string), per the plan's explicit instruction — a future reader sees three identical values rather than a near-duplicate that invites drift.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

The full `yarn workspace @docktor/client test:unit` run showed 5 unrelated test files (`proxy-tab.test.tsx`, `certificates-card.test.tsx`, `service-upgrade-dialog.test.tsx`, `stack-actions.test.tsx`, `stack-detail-page.test.tsx`) failing/timing out under severe host contention (`uptime` showed load average 26-42 on the machine, swap fully exhausted at the time of the run). This is the exact same pre-existing flake class already documented in STATE.md for plans 06-05/08-01/08-03 — none of these files touch `stack-status-badge.tsx` or this plan's scope. Re-ran all 5 files plus the badge test together in isolation: 64/64 passed. `yarn typecheck` passed silently (exit 0) on the first run. This plan's own target file (`stack-status-badge.test.tsx`, 24/24 tests) passed cleanly in both the full-suite run and isolation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 08 complete — all 4 plans (08-01 through 08-04) are now done. This was the last plan in the phase.

---
*Phase: 08-live-state-consistency*
*Completed: 2026-09-20*

## Self-Check: PASSED
