---
phase: 20-visual-consistency-dashboard-clarity-and-touch-targets
plan: 07
subsystem: dashboard-backup-coverage
tags: [dashboard, backup, stat-card, mono, hasBackup, dash-01, dash-02, ui-03]
requires: ["20-01"]
provides:
  - "GET /api/stacks list items carry hasBackup (completed MANUAL/SCHEDULED Backup row exists), one batched groupBy behind a read port"
  - "Dashboard Backup Coverage card (n/total, hint 'with a schedule or snapshot', em dash + 'data unavailable' on error)"
  - "StatCard generic hint prop; mono KPI values and labels (label wraps, icon shrink-0)"
  - "useStacks background refetch when a stack leaves BACKING_UP"
affects: [dashboard, stacks-list-api]
tech-stack:
  added: []
  patterns: ["Read port on StackService (StackBackupReadRepo, 11th constructor arg)", "Batched Prisma groupBy returning Set<string>"]
key-files:
  created:
    - server/test/unit/repositories/backup-repository.test.ts
    - client/test/unit/routes/dashboard/dashboard-stat-cards.test.tsx
  modified:
    - server/src/repositories/backup-repository.ts
    - server/src/application/stack-service.ts
    - server/src/application/index.ts
    - server/test/unit/application/stack-service.test.ts
    - server/test/integration/stacks.test.ts
    - client/src/lib/stacks-api.ts
    - client/src/lib/dashboard-stats.ts
    - client/test/unit/lib/dashboard-stats.test.ts
    - client/src/components/common/stat-card.tsx
    - client/test/unit/components/common/stat-card.test.tsx
    - client/src/routes/app/dashboard/components/dashboard-stat-cards.tsx
    - client/src/hooks/use-stacks.ts
    - client/src/hooks/use-backup-defaults.ts
    - client/test/unit/hooks/use-stacks.test.ts
    - client/test/integration/stacks.spec.ts
decisions:
  - "hasBackup is derived from Backup rows (status COMPLETED, trigger MANUAL or SCHEDULED), never from resticSnapshotId, which may stay empty on completed rows"
  - "hasBackup is merged only in listStacks after the protected filter; detail and create responses are unchanged"
  - "StatCard hint is a generic string prop; the backup vocabulary lives in DashboardStatCards"
metrics:
  tasks: 3
  files: 17
status: complete
actuals:
  tokens: 9500
  tasks: 3
  commits: 6
plan_head_before: 5266f5ece33101a9270936366d8e8b8523177aaf
plan_head_after: 5e22f59f0e180119b2985f41a3b9c789d0f61f00
commits: 6
completed: 2026-10-21
---

# Phase 20 Plan 07: Backup Coverage card Summary

The misleading "Backups Configured" card is now "Backup Coverage" (covered/total). A stack counts when it has an effective schedule (own or global default) or a completed manual or scheduled backup. The new `hasBackup` flag comes from one batched `groupBy` in `BackupRepository.findStackIdsWithSnapshot()`, reached through the `StackBackupReadRepo` port, with no per-stack query and no restic call.

## Tasks

| Task | Name | Commits |
| ---- | ---- | ------- |
| 1 | Tracer: Backup rows to hasBackup to Backup Coverage card | 49f7ce5 (test), 004c0fb (feat) |
| 2 | StatCard hint, mono KPIs, query shape and API pinned | aee7a2f (test), 7824c92 (feat) |
| 3 | Refresh after a first backup; Playwright dashboard tests | 5624e98 (test), 5e22f59 (feat) |

## Deviations from Plan

None. The plan executed as written.

Notes:
- The `backup-repository.test.ts` query-shape test passed on its first run, because the repository method already existed from Task 1. It still pins the where clause.
- The tracer gate was satisfied by the Task 1 unit verification (server stack-service and layering tests, client stats and card tests), all green, before Tasks 2 and 3 expanded on it.
- This is a sequential-mode worktree branch (`worktree-bridge-...`), so the `agent-*` namespace guard from the parallel-worktree commit protocol did not apply. HEAD was never on a protected branch.

## Known limitation (D-04)

`hasBackup` is derived from Docktor's Backup records, not from restic. A stack whose restic repository was populated outside Docktor, or whose snapshots predate the Backup table, reads `hasBackup: false`.

## Deferred verifications (CI only, per the shared-VPS constraint)

- `yarn typecheck` (`tsc --build`) was not run locally.
- Server integration test `GET /api/stacks marks hasBackup only for a stack with a completed manual or scheduled backup` (`server/test/integration/stacks.test.ts`) was written but not run.
- Playwright `stacks.spec.ts` dashboard tests ("dashboard shows stack stats and recent stacks" and "Backup Coverage counts a manual-snapshot-only stack") were written but not run.
- Visual check that `128/128` fits the Backup Coverage card at the xl six-column grid and the `w-16` skeleton, in light and dark mode (the plan's backstop truth), is left to a human or CI screenshots.

## Targeted tests run locally (all passing)

- Server: `stack-service.test.ts`, `layering.test.ts`, `backup-repository.test.ts`.
- Client: `dashboard-stats`, `stat-card`, `dashboard-stat-cards`, `use-stacks`, plus the `routes/stacks` and `routes/storage` suites (other StatCard consumers, 25 files, 278 tests).

## Known Stubs

None.

## Threat Flags

None. `hasBackup` is a boolean only, the route stays behind `requireAuth`, the merge runs after the protected-stack filter (unit-tested), and there is one query per request (unit-tested).

## Self-Check: PASSED

- Created files found: `server/test/unit/repositories/backup-repository.test.ts`, `client/test/unit/routes/dashboard/dashboard-stat-cards.test.tsx`.
- Commits 49f7ce5, 004c0fb, aee7a2f, 7824c92, 5624e98 and 5e22f59 are ancestors of HEAD.
