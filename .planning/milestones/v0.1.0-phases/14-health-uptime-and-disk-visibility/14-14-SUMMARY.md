---
phase: 14-health-uptime-and-disk-visibility
plan: 14
subsystem: api
tags: [du, lstat, interval-job, disk-usage, restic-backups]
requires:
  - phase: 14-health-uptime-and-disk-visibility
    provides: plan 14-02 DiskUsageJob, DiskUsageScanner, Stack.backupSizeBytes and GET /api/storage
provides:
  - DiskUsageScannerPort.isRealDirectory (lstat-based, false for symlinks and missing paths)
  - DiskUsageScanner.measureBytes tolerant of du exit 1 with a printed total, null for missing du (warned once) and timeouts
  - DiskUsageJob measuring <stack>/backups into Stack.backupSizeBytes, with per-stack isolation and a summary log line
affects: [14-05 storage page Backups section]

actuals:
  tokens: 6000
  tasks: 1
  commits: 1
plan_head_before: c34eb1a1aa2a7d299f31db631f6123ed33af2e23
plan_head_after: 95c0e88cd8a668e9f50fa81cfa352fdfb3439cc6

tech-stack:
  added: []
  patterns:
    - "Typed unknown-narrowing guards for execFile rejections (code, stdout), no any"
    - "Job step split into recordStack (never throws) / measureStack / measureVolumes / measureBackups"

key-files:
  created: []
  modified:
    - server/src/application/ports/disk-usage-scanner-port.ts
    - server/src/infrastructure/disk-usage-scanner.ts
    - server/src/jobs/disk-usage-job.ts
    - server/test/unit/infrastructure/disk-usage-scanner.test.ts
    - server/test/unit/jobs/disk-usage-job.test.ts
    - server/test/integration/storage.test.ts

key-decisions:
  - "Backups are measured only when <stack>/backups is a real directory (lstat); a symlink or missing folder leaves backupSizeBytes null and runs no du"
  - "Any null measurement (volume or backups) skips recordStackUsage for that stack so previous stored values are kept"
  - "measureStack returns RecordStackUsageInput | null; measureBackups returns {sizeBytes} | null so 'no local repository' (null size) is distinct from 'unavailable' (skip)"

patterns-established:
  - "recordStack wraps each stack in try/catch so one failing stack never aborts a daily run"

requirements-completed: ["#27"]

coverage:
  - id: D1
    description: "Stack-local <stack>/backups is sized into backupSizeBytes when a real directory, listed in GET /api/storage backups and counted once in totalBytes; symlinked or missing backups stay null and are never sized"
    requirement: "#27"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/disk-usage-job.test.ts#local backups (D-14 amended, Pitfall 9)"
        status: pass
      - kind: unit
        ref: "server/test/unit/infrastructure/disk-usage-scanner.test.ts#isRealDirectory"
        status: pass
      - kind: integration
        ref: "server/test/integration/storage.test.ts#measures the stack-local backups repository into the backups list and counts it once in the total (D-14 amended)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A failed, partial or missing du never overwrites a good stored measurement: exit 1 with a printed total is used, missing du warns once and yields null, timeouts yield null, and a null measurement skips the stack"
    requirement: "#27"
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/disk-usage-scanner.test.ts#measureBytes"
        status: pass
      - kind: unit
        ref: "server/test/unit/jobs/disk-usage-job.test.ts#per-stack isolation and skipping (Pitfalls 8/9, T-14-55, T-14-56)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Per-stack isolation: an escape-check throw, an unavailable measurement or a rejected record write skips only that stack; run() resolves and logs one measured-count line"
    requirement: "#27"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/disk-usage-job.test.ts#per-stack isolation and skipping (Pitfalls 8/9, T-14-55, T-14-56)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Real du behaviour on a Linux host (exit 1 output, timeout) and a real symlinked backups folder"
    requirement: "#27"
    verification: []
    human_judgment: true
    rationale: "The dev host is Windows; du and symlinks are exercised only through fake runner and fake lstat seams"

duration: 5min
completed: 2026-10-08
status: complete
---

# Phase 14 Plan 14: Local backups and du robustness Summary

**Daily disk scan now sizes the stack-local `<stack>/backups` restic repository (symlink-safe via lstat), tolerates `du` exit 1 / missing binary / timeout without overwriting good values, and isolates failures per stack**

## Performance

- **Duration:** 5 min
- **Started:** 2026-10-08T09:13:00Z
- **Completed:** 2026-10-08T09:18:00Z
- **Tasks:** 1
- **Files modified:** 6

## Accomplishments
- `DiskUsageScannerPort.isRealDirectory` backed by `lstat` (never follows symlinks; any rejection is false). `DiskUsageFsOps` gained `lstat`.
- `measureBytes` uses the printed total of a `du` that exits non-zero (Pitfall 8), returns null with a single `du is not available` warning per scanner instance on ENOENT, and null for a timeout with empty stdout.
- `DiskUsageJob.run()` delegates to `recordStack` (try/catch per stack, never throws) and `measureStack`, which composes `measureVolumes` and `measureBackups`. A null measurement skips the stack and warns with its id; the run ends with `[DiskUsageJob] measured <n> stack(s)`.
- Integration: a stack with a real backups folder appears in `GET /api/storage` backups and in `totalBytes = volumes + backups`; a later scan without a local repository clears it.

## Task Commits

1. **Task 1: Local backups in the disk picture and measurement robustness** - `95c0e88` (feat)

**Plan metadata:** committed separately (docs: complete plan)

_Note: tests were written first and seen failing (14 failures) before the implementation; one commit because CLAUDE.md forbids committing failing tests._

## Files Created/Modified
- `server/src/application/ports/disk-usage-scanner-port.ts` - widened with `isRealDirectory`
- `server/src/infrastructure/disk-usage-scanner.ts` - lstat check, du failure handling, warn-once
- `server/src/jobs/disk-usage-job.ts` - backups measurement, skip-on-null, per-stack isolation, summary line
- `server/test/unit/infrastructure/disk-usage-scanner.test.ts` - exit-1, ENOENT-once, timeout, non-error rejection, isRealDirectory cases
- `server/test/unit/jobs/disk-usage-job.test.ts` - backups real/symlink/unavailable, isolation, escape check, summary line
- `server/test/integration/storage.test.ts` - fake scanner backups size; backups list/total and clearing cases

## Decisions Made
- `measureBackups` returns `{sizeBytes: number | null} | null` so "no local repository" (recorded as null) is distinct from "unavailable" (stack skipped).
- A non-Error rejection (e.g. a string) from the runner yields null rather than throwing, so the stack is skipped, not the run.

## Deviations from Plan

None - plan executed exactly as written. (Existing scanner tests that construct `DiskUsageFsOps` were updated to pass an `lstat` stub, a direct consequence of the planned interface widening.)

## Issues Encountered
- None. The existing "keeps the previous figures" job test now emits the new skip warning to the console; it is harmless output.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None.

## Threat Flags
None. T-14-54 (lstat, no du on symlinked backups), T-14-55 (null skips the stack) and T-14-56 (per-stack try/catch) are mitigated and unit tested; no new endpoints or trust boundaries.

## Next Phase Readiness
- 14-05's Backups section now receives real rows from `GET /api/storage` once the daily scan has run on a Linux host.
- Verification: plan unit set (scanner, job, layering) 166/166; storage integration 7/7; `yarn typecheck` clean.

## Self-Check: PASSED

- Modified files exist; commit `95c0e88` is an ancestor of HEAD.
- Acceptance criteria: `lstat` count in scanner 4; `DOCKTOR_BACKUP_DIR` count 0 in both files; `isRealDirectory` count 1 in the port; required unit and integration cases present and passing.

---
*Phase: 14-health-uptime-and-disk-visibility*
*Completed: 2026-10-08*
