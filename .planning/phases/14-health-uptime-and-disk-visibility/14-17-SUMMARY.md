---
phase: 14-health-uptime-and-disk-visibility
plan: 17
subsystem: infra
tags: [disk-usage, du, interval-job, symlink, review-disposition, tdd, gap-closure]

requires:
  - phase: 14-health-uptime-and-disk-visibility
    provides: DiskUsageJob and DiskUsageScanner (14-04/14-14), IntervalJob.reportError and probe liveness (14-15), container identity (14-16)
provides:
  - IntervalJob.runGuarded is protected, so a subclass-triggered extra run is logged and reported like a scheduled run
  - DiskUsageJob kickoff goes through runGuarded, with an in-flight guard so two scans never overlap (WR-09)
  - DiskUsageJob lstat-checks the `<stack>/volumes` folder itself before listing it (WR-03)
  - DiskUsageScanner du runs with a 64 MiB maxBuffer and a distinct overflow warning (WR-04)
  - 14-REVIEW-DISPOSITION.md with all 18 findings in the GSD ledger format (7 fixed, 11 deferred, 0 open)
affects: [phase-14-verification, ship gate, storage page]

plan_head_before: fc07b7bdd675787254aa10160c15c1554b3ac26a
plan_head_after: 32548c8ee9106abd2f73031dad23f5a897869e33

actuals:
  tokens: 11500
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Extra runs outside the cron schedule go through the base class's guarded run so health reporting stays uniform"
    - "Container-writable folders are lstat-checked before they are listed (volumes now matches backups)"

key-files:
  created: []
  modified:
    - server/src/jobs/job.ts
    - server/src/jobs/disk-usage-job.ts
    - server/src/infrastructure/disk-usage-scanner.ts
    - server/test/unit/jobs/disk-usage-job.test.ts
    - server/test/unit/infrastructure/disk-usage-scanner.test.ts
    - .planning/phases/14-health-uptime-and-disk-visibility/14-REVIEW-DISPOSITION.md

key-decisions:
  - "A skipped overlapping run resolves normally, so the health reporter counts it as a run: the job is alive and a scan is in progress"
  - "A symlinked `volumes` folder is measured as 0 bytes with no rows, identical to a missing one, rather than as unmeasured"
  - "Deferred review findings keep a stated reason and no GitHub issue is opened; the developer decides follow-ups at triage"

requirements-completed: ["#27"]

coverage:
  - id: D1
    description: "The post-boot disk scan is reported to job health like a scheduled run, on success and on failure"
    requirement: "#27"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/disk-usage-job.test.ts#records a successful kickoff scan on the job health reporter (WR-09)"
        status: pass
      - kind: unit
        ref: "server/test/unit/jobs/disk-usage-job.test.ts#logs and swallows a failed initial scan, reporting it like a scheduled run (WR-09)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Two disk scans never run at once; the flag is cleared when a scan rejects"
    requirement: "#27"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/disk-usage-job.test.ts#skips a second run while a scan is in flight, logs it, and scans again once the first finished"
        status: pass
      - kind: unit
        ref: "server/test/unit/jobs/disk-usage-job.test.ts#clears the in-flight flag when a scan rejects, so the next run still scans"
        status: pass
    human_judgment: false
  - id: D3
    description: "A symlinked `<stack>/volumes` folder is never listed, sized or stored; backups are still measured"
    requirement: "#27"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/disk-usage-job.test.ts#never lists or sizes a volumes path that is not a real directory, and records 0 bytes with backups still measured"
        status: pass
    human_judgment: false
  - id: D4
    description: "du output overflow is bounded at 64 MiB and reported with a distinct warning naming the path"
    requirement: "#27"
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/disk-usage-scanner.test.ts#warns once with the path and the word buffer when du output overflows maxBuffer (WR-04, T-14-67)"
        status: pass
      - kind: unit
        ref: "server/test/unit/infrastructure/disk-usage-scanner.test.ts#does not emit the overflow warning for an ordinary failure without output"
        status: pass
    human_judgment: false
  - id: D5
    description: "All 18 Phase 14 review findings carry a recorded disposition in the GSD ledger format"
    verification:
      - kind: other
        ref: "grep counts on 14-REVIEW-DISPOSITION.md: 7 fixed, 11 deferred, 0 open, 18 rows, 1 header"
        status: pass
    human_judgment: true
    rationale: "Whether each deferral reason is acceptable is a triage decision for the developer, not something a test can assert"

duration: 4min
completed: 2026-10-09
status: complete
---

# Phase 14 Plan 17: Disk scan robustness and review dispositions Summary

**The daily disk scan no longer overlaps itself, reports its post-boot run to job health, never follows a symlinked `volumes` folder and survives noisy `du` stderr; all 18 Phase 14 review findings now carry a disposition (7 fixed, 11 deferred, 0 open).**

## Performance

- **Duration:** 4 min
- **Started:** 2026-10-09T06:34:49Z
- **Completed:** 2026-10-09T06:38:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- WR-09: `kickoff()` returns `runGuarded()`, so the 60 s post-boot scan is logged (`[DiskUsageJob] run failed:`) and recorded on the health reporter. `run()` carries a private in-flight flag cleared in a `finally`; an overlapping run logs a warning and returns.
- WR-03: `measureVolumes` calls `scanner.isRealDirectory(volumesDir)` first and returns `[]` otherwise, mirroring `measureBackups`. A symlinked folder can no longer leak names or sizes from outside the stacks tree (T-14-66).
- WR-04: the default runner passes `maxBuffer: DU_MAX_BUFFER_BYTES` (64 MiB). A run that still overflows logs `[DiskUsageScanner] du output for "<path>" exceeded the buffer; ...` and the stack keeps its previous figures (T-14-67).
- Dispositions: the ledger table is rewritten as `| Finding | Severity | Disposition | Source |`, with a closing notes section. 14-REVIEW.md is untouched.

## Task Commits

1. **Task 1: Disk scan robustness (tracer, TDD)**
   - RED: `d341f36` (test) - 6 expected failures
   - GREEN: `f9b7fe3` (feat) - 7 related test files, 230 tests pass; typecheck clean
2. **Task 2: Dispositions and phase regression gate** - `32548c8` (docs)

**Plan metadata:** committed separately (docs: complete plan)

The tracer gate ran in default mode with an automated-only verify: the verify was re-run end-to-end, passed, and expansion continued.

## Files Created/Modified

- `server/src/jobs/job.ts` - `runGuarded` is now `protected` with a doc comment
- `server/src/jobs/disk-usage-job.ts` - in-flight guard around private `scan()`, kickoff via `runGuarded()`, volumes lstat check
- `server/src/infrastructure/disk-usage-scanner.ts` - 64 MiB maxBuffer, overflow warning, `hasErrorCode` helper
- `server/test/unit/jobs/disk-usage-job.test.ts` - kickoff reporting, overlap guard, symlinked volumes cases; the two planned fixture and log-text updates
- `server/test/unit/infrastructure/disk-usage-scanner.test.ts` - overflow warning and no-warning cases
- `.planning/phases/14-health-uptime-and-disk-visibility/14-REVIEW-DISPOSITION.md` - 18 dispositions

## Decisions Made

- A skipped overlapping run resolves normally and therefore counts as a run on the health reporter (the job is alive, a scan is in progress). Noted in a code comment.
- A symlinked `volumes` folder is treated like a missing one: 0 bytes and no rows.
- No GitHub issues were opened for the deferred findings; the developer decides at triage.

## Deviations from Plan

None - plan executed exactly as written. The only pre-existing test changes are the two named in the plan (`createScanner` fixture fidelity and the kickoff-failure log text).

## Issues Encountered

None in the planned work. The full server unit suite reported one failing file, `test/unit/infrastructure/git-executor.test.ts` (two 5 s timeouts: "pull on second sync" and "re-clone fallback"), the known Windows git/temp-dir timeouts documented in deferred-items.md. `template-source-reader.test.ts`, the other documented one, passed on this run. 108 of 109 files passed.

## Verification Results

- Task 1 verify (7 files, 230 tests): pass. Acceptance greps for `protected async runGuarded`, `this.runGuarded()`, `isRealDirectory(volumesDir)`, `maxBuffer: DU_MAX_BUFFER_BYTES` and `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` each print 1.
- Task 2 greps: 7 fixed, 11 deferred, 0 open, 1 header, 18 finding rows; `git diff --stat` on 14-REVIEW.md prints nothing.
- Phase 14 regression list (22 files): pass.
- `yarn typecheck`: exit 0.

## Disposition Tally

| Disposition | Count | Findings |
|-------------|-------|----------|
| fixed | 7 | CR-01 (14-15), WR-01, WR-05, WR-11 (14-16), WR-03, WR-04, WR-09 (14-17) |
| deferred | 11 | WR-02, WR-06, WR-07, WR-08, WR-10, IN-01 to IN-06 |
| open | 0 | - |

## Known Stubs

None.

## Threat Flags

None. The plan's threats T-14-66, T-14-67 and T-14-68 are mitigated as listed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

This is the final gap-closure plan for Phase 14. Phase 14 is ready for re-verification (`/gsd-verify-work`).

## Self-Check: PASSED

- Files exist: job.ts, disk-usage-job.ts, disk-usage-scanner.ts, both test files, 14-REVIEW-DISPOSITION.md.
- Commits `d341f36`, `f9b7fe3`, `32548c8` are ancestors of HEAD.

---
*Phase: 14-health-uptime-and-disk-visibility*
*Completed: 2026-10-09*
