---
phase: 11-ui-rework
plan: 02
subsystem: ui
tags: [react, tailwind, badges, dark-mode-readiness, status-indicators]
requires:
  - phase: 11-ui-rework
    provides: plan 11-01's stack-detail-page decomposition and Config tab merge (StackDetailHeader, OverviewTab, ConfigTab contracts)
provides:
  - ToneBadge + StatusDot primitives (client/src/components/common/) shared across every status/config/update pill
  - StackStatusBadge / ServiceStatusBadge display="badge"|"compact" variants with a pulsing green dot for the running family
  - lib/service-color.ts and lib/service-ports.ts shared utilities
  - ServiceUpdateBadge / StackUpdateBadge with D-10 copy distinction
  - Stack list Status column showing the stack-level "update available" pill
affects: [11-06, 11-07, 11-08, 11-11]

actuals:
  tokens: 190000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "ToneBadge/StatusDot as the single status-indicator primitive pair — all pill/dot rendering in the app now goes through these two components"

key-files:
  created:
    - client/src/components/common/tone-badge.tsx
    - client/src/components/common/status-dot.tsx
    - client/src/lib/service-color.ts
    - client/src/lib/service-ports.ts
    - client/src/components/domain/stack/service-update-badge.tsx
    - client/src/components/domain/stack/stack-update-badge.tsx
  modified:
    - client/src/components/domain/stack/stack-status-badge.tsx
    - client/src/components/domain/stack/service-status-badge.tsx
    - client/src/components/domain/stack/log-viewer.tsx
    - client/src/components/domain/stack/stack-list.tsx
    - client/src/components/domain/backup/backup-status-badge.tsx
    - client/src/components/domain/stack/cert-status-badge.tsx
    - client/src/components/domain/stack/compatibility-badge.tsx

key-decisions:
  - "Tone palette standardized on the `bg-{hue}-100 text-{hue}-800 dark:bg-{hue}-900 dark:text-{hue}-200` scheme (the only pre-existing scheme with dark variants) rather than StackStatusBadge's prior no-dark-variant classes."
  - "Pulsing dot applies to the whole running family (stack RUNNING and HEALTHY, service running-unless-unhealthy), not just RUNNING, so a healthy stack doesn't read as 'less alive'."

patterns-established:
  - "Every status/config/update pill renders through ToneBadge — no component hand-rolls `rounded-full px-2 py-0.5 text-xs` pill markup anymore in the touched files."

requirements-completed:
  - "GH-15 (docktor-app/docktor#15) — this plan implements D-08 (single status-indicator scheme with a pulsing running dot), D-10 (update-badge copy for a missing latestTag), D-11 (service-color utility extracted for reuse), and the component + stack-list half of D-09 (stack-level update badge). ROADMAP success criterion 4 (single consistent badge sizing)."

coverage:
  - id: D1
    description: "Stack/service status badges render a pulsing green dot for the running family and a static dot for every other state, with unknown values degrading to a neutral static indicator"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/stack/stack-status-badge.test.tsx"
        status: pass
      - kind: unit
        ref: "client/test/unit/components/domain/stack/service-status-badge.test.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "ToneBadge/StatusDot primitives exist with dark: variants on every non-neutral tone"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/components/common/tone-badge.test.tsx"
        status: pass
      - kind: unit
        ref: "client/test/unit/components/common/status-dot.test.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "getServiceColor and parsePorts/formatPorts moved to shared lib/ modules, importable by other components"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/lib/service-color.test.ts"
        status: pass
      - kind: unit
        ref: "client/test/unit/lib/service-ports.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "ServiceUpdateBadge/StackUpdateBadge render the D-10 copy distinction (Update available -> tag / Content updated / nothing)"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/stack/service-update-badge.test.tsx"
        status: pass
      - kind: unit
        ref: "client/test/unit/components/domain/stack/stack-update-badge.test.tsx"
        status: pass
    human_judgment: false
  - id: D5
    description: "Stack list shows the stack-level update-available pill and remaining badge components (backup, cert, compatibility) share ToneBadge sizing and dark-aware colors"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/stack/stack-list.test.tsx"
        status: pass
      - kind: unit
        ref: "client/test/unit/components/domain"
        status: pass
    human_judgment: false

duration: unknown (session interrupted mid-execution by a container restart)
completed: 2026-09-26
status: complete
---

# Phase 11 Plan 02: Status-Indicator Unification Summary

**One ToneBadge/StatusDot primitive pair replacing seven hand-rolled pill implementations, with a pulsing green dot for running stacks/services and a stack-level "update available" pill on the list.**

## Performance

- **Duration:** Unknown — the executing session was interrupted by a container restart after completing all three tasks' file edits but before any commits were made. A follow-up session (this one) verified the interrupted work was complete and correct (all task `<verify>` commands, all `<acceptance_criteria>` greps, the full client test suite, and `tsc -b` all pass) before committing it task-by-task and writing this SUMMARY.
- **Tasks:** 3
- **Files modified:** 20 (7 created, 13 modified)

## Accomplishments

- `ToneBadge` and `StatusDot` (`client/src/components/common/`) are the single pill/dot primitives now used by every status, config, and update indicator in the touched files — no more hand-rolled `rounded-full px-2 py-0.5 text-xs` markup, and every tone carries a `dark:` variant.
- `StackStatusBadge` and `ServiceStatusBadge` render a pulsing green dot for the running family (RUNNING/HEALTHY, service running-unless-unhealthy) and a static dot otherwise; unknown status values degrade to a neutral static indicator with their raw label instead of throwing.
- `getServiceColor` moved out of `log-viewer.tsx` into `client/src/lib/service-color.ts`; `client/src/lib/service-ports.ts` consolidates the previously-duplicated inline port JSON parsing (never throws on malformed data).
- `ServiceUpdateBadge`/`StackUpdateBadge` implement the D-10 copy distinction ("Update available → {tag}" vs "Content updated" vs nothing) and the stack list now shows a stack-level "update available" pill alongside the existing config-error/config-changed pills.
- Backup, certificate, and compatibility badges migrated onto `ToneBadge`, picking up dark-mode support (`cert-status-badge.tsx`'s light-only `text-green-600` is gone).

## Task Commits

Each task was committed atomically (retroactively, after verifying the interrupted work — see Deviations):

1. **Task 1: ToneBadge + StatusDot primitives and the status badges with a pulsing running dot** - `225aa14` (feat)
2. **Task 2: Service color and port utilities, and the update badges with D-10 copy** - `44356ab` (feat)
3. **Task 3: Migrate the stack list and remaining badge components onto ToneBadge** - `b67890b` (feat)

## Files Created/Modified

- `client/src/components/common/tone-badge.tsx` - ToneBadge, toneBadgeVariants, Tone type
- `client/src/components/common/status-dot.tsx` - StatusDot
- `client/src/components/domain/stack/stack-status-badge.tsx` - getStackStatusPresentation(), display prop
- `client/src/components/domain/stack/service-status-badge.tsx` - getServiceStatusPresentation(), display prop
- `client/src/lib/service-color.ts` - getServiceColor() (moved from log-viewer.tsx)
- `client/src/lib/service-ports.ts` - ServicePortBinding, parsePorts(), formatPorts()
- `client/src/components/domain/stack/service-update-badge.tsx` - ServiceUpdateBadge, describeServiceUpdate()
- `client/src/components/domain/stack/stack-update-badge.tsx` - StackUpdateBadge, hasStackUpdate()
- `client/src/components/domain/stack/log-viewer.tsx` - now imports getServiceColor instead of defining it
- `client/src/components/domain/stack/stack-list.tsx` - Status column renders compact StackStatusBadge + StackUpdateBadge
- `client/src/components/domain/backup/backup-status-badge.tsx` - migrated to ToneBadge
- `client/src/components/domain/stack/cert-status-badge.tsx` - migrated to ToneBadge, dark-aware
- `client/src/components/domain/stack/compatibility-badge.tsx` - migrated to ToneBadge

## Decisions Made

- Tone palette standardized on the `bg-{hue}-100 text-{hue}-800 dark:bg-{hue}-900 dark:text-{hue}-200` scheme (the only pre-existing scheme with dark variants); `StackStatusBadge`'s prior no-dark-variant classes were migrated onto it, keeping the status→hue mapping from the UI-SPEC.
- The pulsing dot applies to the whole running family (RUNNING and HEALTHY for stacks; running-unless-unhealthy for services), not just RUNNING — a healthy stack with passing health checks would otherwise read as "less alive" than a plain running one.

## Deviations from Plan

### Auto-fixed Issues

**1. [Recovery] Retroactive task commits after container-restart interruption**
- **Found during:** Start of this session — the previous executor session had completed all three tasks' file edits (verified identical to the plan's file lists for Tasks 1-3) but the container was restarted before any `git commit` ran, and before SUMMARY.md was written.
- **Issue:** All work existed only as uncommitted/untracked changes in the working tree, with zero commits and no SUMMARY.md — an illegal partial-plan state per the atomic-close-out invariant if left as-is.
- **Fix:** Before committing anything, independently re-verified the interrupted work: ran each task's `<verify>` command, every `<acceptance_criteria>` grep, the full client unit test suite, and `tsc -b` — all passed cleanly. Only after full verification did this session split the changes into the three task-scoped commits above and write this SUMMARY.
- **Files modified:** None beyond what the plan specified — no code changes were made in this recovery session, only commits.
- **Verification:** `yarn workspace @docktor/client test` (38 files / 332 tests passed), `yarn workspace @docktor/client exec tsc -b` (clean), all 12 acceptance-criteria greps from the plan.
- **Committed in:** `225aa14`, `44356ab`, `b67890b`

**2. [Known limitation] TDD incremental commit history not reconstructable**
- **Found during:** Task commit recovery
- **Issue:** Tasks 1 and 2 carry `tdd="true"`, which normally produces separate `test(11-02): ...` (RED) → `feat(11-02): ...` (GREEN) → optional `refactor(11-02): ...` commits. Because the interrupted session's incremental git history was lost (never committed), this recovery could not reconstruct which commit would have been the failing-test-only RED state.
- **Fix:** Committed each task as a single `feat(11-02): ...` commit containing both implementation and tests, verified green. `workflow.tdd_mode` is OFF for this phase, so this does not trip the phase-wide RED/GREEN gate check (which only applies when that config is enabled) — this is a documentation-only gap in commit granularity, not a functional one.
- **Impact:** None on correctness; all behavior is fully tested and passing. Git history for these two tasks shows one commit instead of two-to-three.

---

**Total deviations:** 2 (1 process recovery, 1 known/accepted limitation). **Impact:** No scope creep, no behavior changes — this session performed verification and commit bookkeeping only; all implementation work was already done by the interrupted prior session and is unchanged.

## Issues Encountered

Container restart interrupted the original executing session between finishing Task 3's file edits and its first task commit. No work was lost — all files were still present on disk and verified correct before committing. See Deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- ToneBadge, StatusDot, StackStatusBadge/ServiceStatusBadge `display` prop, lib/service-color.ts, and lib/service-ports.ts are ready for plans 11-06 (services section, activity timeline), 11-07 (proxy tab), 11-08 (LogTerminal), and 11-11 (settings split).
- `StackUpdateBadge` on the stack list will start rendering real data once plan 11-05 lands the server-side `updateAvailable` enrichment on `listStacks()`.
- Ready for 11-03 (dark mode wiring).

---
*Phase: 11-ui-rework*
*Completed: 2026-09-26*
