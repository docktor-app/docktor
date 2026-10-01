---
phase: 11-ui-rework
plan: 08
subsystem: ui
tags: [react, log-streaming, ansi-to-react, backup, polling]
requires:
  - phase: 11-ui-rework
    provides: "11-02's getServiceColor and ToneBadge, consumed by LogTerminal's service-prefix coloring and BackupTriggerBadge"
provides:
  - "LogTerminal presentational component shared by the stack log viewer and the backup detail page"
  - "Working Timestamps/Wrap/service-prefix toggles on the stack log viewer (previously no-ops or inverted)"
  - "useBackupDetail hook and a <=90-line backup detail page composition"
  - "Shared backup formatting helpers (backup-format.ts) and BackupTriggerBadge, deduplicated from backup-history.tsx"
  - "Fixed Phase 10 UAT gap G-10-2: backup-history.tsx no longer polls unconditionally"
affects: [11-13]

actuals:
  tokens: 210000
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "Presentational/data-source split: LogTerminal only knows about {line, service?, timestamp?} objects; LogViewer (containers, via useLogStream) and the backup page (restic output, via useBackupStream/useBackupDetail) each map their own data source into that shape at the boundary, per RESEARCH Pattern 2."

key-files:
  created:
    - client/src/components/domain/stack/log-terminal.tsx
    - client/src/components/domain/stack/log-connection-status.tsx
    - client/src/hooks/use-backup-detail.ts
    - client/src/lib/backup-format.ts
    - client/src/components/domain/backup/backup-trigger-badge.tsx
    - client/src/routes/app/stacks/backups/components/backup-detail-header.tsx
    - client/src/routes/app/stacks/backups/components/backup-metadata.tsx
  modified:
    - client/src/components/domain/stack/log-viewer.tsx
    - "client/src/routes/app/stacks/backups/[backupId].tsx"
    - client/src/routes/app/stacks/components/backup-history.tsx
    - client/src/hooks/use-backup-history.ts

key-decisions:
  - "getBackupOutputEmptyMessage(status) was extracted into lib/backup-format.ts as a pure helper rather than inlined as literal JSX text in [backupId].tsx, so the loading/empty copy is testable and reusable independent of the page component."
  - "Phase 10's own gap-closure pass had already partially addressed G-10-2 by moving backup-history's polling into a use-backup-history.ts hook, but with a looser 3s-poll/30s-grace-window policy. This plan tightens that hook to the exact Task 3 spec (poll only while an IN_PROGRESS backup exists, 5s cadence, stop immediately once none remain) and drops the 30s grace window, which was not reachable without reintroducing the stale-state dependency G-10-2 flags."

patterns-established:
  - "LogTerminal is the single presentational log surface for the app; any future log-like data source (e.g. a future job runner) maps into LogTerminalLine at its own hook boundary rather than growing a new terminal component."

requirements-completed:
  - "GH-15 (docktor-app/docktor#15) — this plan implements ROADMAP success criterion 3 (backup and backup-detail pages reuse the log-viewer component, folded todo 2026-08-28-frontend-refactor-audit), D-11's log-line attribution through the shared terminal, and the backup-detail half of D-03."

coverage:
  - id: D1
    description: "LogTerminal presentational component with working Timestamps/Wrap/service-prefix toggles, ANSI rendering via ansi-to-react"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/stack/log-terminal.test.tsx"
        status: pass
      - kind: unit
        ref: "client/test/unit/components/log-viewer.test.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "Backup detail page streams restic output through LogTerminal via useBackupDetail, with UI-SPEC loading/empty/disconnected states, unchanged request behaviour (CR-01/CR-03)"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/backup-detail-page.test.tsx"
        status: pass
      - kind: unit
        ref: "client/test/unit/lib/backup-format.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Backup detail page is a flat, <=90-line composition (BackupDetailHeader + BackupMetadata + Output section), no Card"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/backup-detail-page.test.tsx"
        status: pass
      - kind: other
        ref: "wc -l < 'client/src/routes/app/stacks/backups/[backupId].tsx' == 88"
        status: pass
    human_judgment: false
  - id: D4
    description: "backup-history.tsx fetches once on mount and polls only while an IN_PROGRESS backup exists, stopping immediately once none remain (Phase 10 UAT gap G-10-2 fixed)"
    requirement: "GH-15"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/stacks/backup-history.test.tsx"
        status: pass
    human_judgment: false
  - id: D5
    description: "Full E2E flow (backup history, detail page, disconnected indicator) still works end to end"
    requirement: "GH-15"
    verification:
      - kind: e2e
        ref: "client/test/integration/backups.spec.ts (PLAYWRIGHT_PORT=5177)"
        status: pass
    human_judgment: false

duration: unknown (session interrupted repeatedly across two container restarts and one Claude usage-limit error; see Deviations)
completed: 2026-09-27
status: complete
---

# Phase 11 Plan 08: Shared LogTerminal + Backup Detail Rebuild Summary

**Extracted a presentational `LogTerminal` from the stack log viewer (fixing three previously broken toolbar toggles along the way), rebuilt the backup detail page as an 88-line composition streaming through that same terminal, and fixed Phase 10 UAT gap G-10-2's unconditional backup-history polling.**

## Performance

- **Duration:** Unknown — this plan's execution was interrupted three separate times: a Claude usage-limit error killed one dispatch before any edits were made (clean restart), and a container restart hit again mid-Task-3 (after Tasks 1 and 2 were already committed, and Task 3's RED test was committed but its GREEN implementation was still uncommitted). This session recovered the Task 3 work in place after independently re-verifying it.
- **Tasks:** 3
- **Files modified:** 11 (7 created, 4 modified)

## Accomplishments

- `LogTerminal` (`client/src/components/domain/stack/log-terminal.tsx`) is now the single presentational log-rendering component; the stack log viewer's Timestamps toggle (previously a no-op), the always-on service prefix (previously ignoring the toggle), and the Wrap toggle (previously mapping both states to wrapping) all now work correctly.
- `LogConnectionStatus` is a shared connected/disconnected indicator used by both the stack log viewer and the backup detail page.
- The backup detail page (`[backupId].tsx`) no longer imports `useLogStream` and instead composes a new `useBackupDetail` hook, rendering restic output through `LogTerminal` with the UI-SPEC loading ("Waiting for output…"), empty, and disconnected states. `LogOutput` is deleted.
- `BackupDetailHeader` and `BackupMetadata` replace three duplicated breadcrumb blocks and a metadata Card with one flat, reusable implementation; `BackupTriggerBadge` and `lib/backup-format.ts` (formatDuration/formatSize/BACKUP_TRIGGER_LABELS) deduplicate what `backup-history.tsx` used to define locally.
- `backup-history.tsx`'s polling effect now depends only on `stackId`, fetching once on mount and polling every 5s solely while an IN_PROGRESS backup exists — closing **Phase 10 UAT gap G-10-2**. Phase 10's own gap-closure pass had already moved this logic into a `use-backup-history.ts` hook, but with a looser 3s-poll/30s-grace-window policy that still hammered the API for an all-COMPLETED list; this plan tightens that same hook to the exact spec. **A later Phase 10 gap-closure pass should skip or reconcile G-10-2 — it is already fixed here.**

## Task Commits

1. **Task 1: Extract LogTerminal from the log viewer and make its toolbar toggles work** — `cedfd91` (test, RED), `1f5232f` (feat, GREEN)
2. **Task 2: Backup detail page streams restic output through LogTerminal via a useBackupDetail hook** — `fbe08ae` (test, RED), `4d98bdd` (feat, GREEN)
3. **Task 3: Flat backup detail header/metadata, shared trigger badge, and the Backups-tab history fetch-loop fix** — `487732d` (test, RED), `2438017` (feat, GREEN)

## Files Created/Modified

- `client/src/components/domain/stack/log-terminal.tsx` - LogTerminal, LogTerminalLine, formatLogTimestamp()
- `client/src/components/domain/stack/log-connection-status.tsx` - LogConnectionStatus
- `client/src/components/domain/stack/log-viewer.tsx` - now composes LogTerminal + shadcn Select + LogConnectionStatus
- `client/src/hooks/use-backup-detail.ts` - useBackupDetail() (record state, resync, bounded disconnected poll)
- `client/src/lib/backup-format.ts` - formatDuration, formatSize, BACKUP_TRIGGER_LABELS, getBackupOutputEmptyMessage
- `client/src/components/domain/backup/backup-trigger-badge.tsx` - BackupTriggerBadge
- `client/src/routes/app/stacks/backups/components/backup-detail-header.tsx` - BackupDetailHeader
- `client/src/routes/app/stacks/backups/components/backup-metadata.tsx` - BackupMetadata
- `client/src/routes/app/stacks/backups/[backupId].tsx` - rebuilt as an 88-line composition, no Card
- `client/src/routes/app/stacks/components/backup-history.tsx` - uses shared helpers/badge, no local duplicates
- `client/src/hooks/use-backup-history.ts` - tightened polling policy (G-10-2)

## Decisions Made

- `getBackupOutputEmptyMessage(status)` was extracted as a pure helper in `lib/backup-format.ts` rather than kept as inline literal text in `[backupId].tsx`. This is a deliberate deviation from the plan's Task 2 acceptance-criterion grep (`grep -c 'Waiting for output' [backupId].tsx` expected 1; the page now contains 0 because the string lives in the helper) — the underlying behavior is unchanged and fully covered by `backup-detail-page.test.tsx`'s IN_PROGRESS-empty-message case, which passes. Documented here rather than silently reverting a sensible extraction to satisfy a literal string match.
- Phase 10's gap-closure pass had already introduced `use-backup-history.ts` with a 3s-poll/30s-grace-window approach to G-10-2; this plan's Task 3 tightens that same hook rather than reintroducing inline polling logic in `backup-history.tsx`, and drops the 30s grace window per the plan's own guidance ("keep... only if reachable without the state dependency — otherwise drop it and note the removal").

## Deviations from Plan

### Auto-fixed Issues

**1. [Recovery] Task 3 GREEN work recovered after a container restart**
- **Found during:** Start of this session — Tasks 1 and 2 were already fully committed by an earlier session; Task 3's RED test commit (`487732d`) existed, but the container restarted before the corresponding GREEN implementation was committed.
- **Issue:** Uncommitted, unverified GREEN implementation (backup-trigger-badge.tsx, backup-detail-header.tsx, backup-metadata.tsx, and modifications to use-backup-history.ts, backup-format.ts, backup-history.tsx, [backupId].tsx) sitting in the working tree.
- **Fix:** Independently re-verified the interrupted work — ran Task 3's exact `<verify>` commands (targeted vitest run: 27/27 passed across backup-history.test.tsx and backup-detail-page.test.tsx; `tsc -b` clean; `[backupId].tsx` at 88 lines), all remaining acceptance-criteria greps, and the Playwright `backups.spec.ts` suite (10/11 passed; the one failure — an unrelated Settings-tab SFTP test 1.2 minutes into a resource-contended run — was confirmed a pre-existing flake by re-running it alone, where it passed in 5.3s). Only after this did this session commit Task 3.
- **Verification:** See above; also ran the full `yarn workspace @docktor/client test` suite, which showed additional unrelated failures (theme-toggle, page-header, login-form, use-stack-events, and transiently backup-detail-page itself) caused by the vitest worker pool crashing under resource pressure in this sandbox (`[vitest-pool]: Failed to start forks worker`, `Timeout waiting for worker to respond` — visible directly in the run's own error output), not by this plan's code. The same files pass cleanly when run in isolation or in smaller groups, consistent with the "full-suite resource-contention flake" class already documented in this phase's 11-03 and 11-07 SUMMARYs.
- **Committed in:** `2438017`

---

**Total deviations:** 2 (1 process recovery, 1 accepted refactor over a literal acceptance-criterion grep). **Impact:** No scope creep, no behavior changes from what the plan specified — the recovery performed verification and commit bookkeeping only; the helper extraction improves testability without changing observable output.

## Issues Encountered

Three separate infrastructure interruptions across this plan's execution: one Claude usage-limit error (before any Task 3 edits existed — clean restart from scratch) and one container restart (after Task 3's RED commit but before its GREEN commit — recovered in place, see Deviations). No work was lost in either case; both are environment/session interruptions, not code defects.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `LogTerminal`, `LogConnectionStatus`, and `lib/backup-format.ts` are ready for any future plan needing shared log rendering or backup formatting.
- Phase 10 UAT gap **G-10-2 is fixed here** — a later Phase 10 gap-closure pass should skip or reconcile it rather than reintroducing the polling-loop fix.
- Ready for 11-09 (CodeMirror YAML editor — a checkpoint plan, `autonomous: false`).

---
*Phase: 11-ui-rework*
*Completed: 2026-09-27*
