---
phase: 22-migration-hardening
plan: 06
subsystem: migration
tags: [disk-space, statfs, du, backup, issue-107, D-01, D-02, D-03, D-08]

requires:
  - phase: 22-migration-hardening
    provides: 22-05 (MigrationPlan.volumes with the real Docker volume names and the VolumeDockerRunner seam) and 22-03/22-04 (verified stop, step enum order)
provides:
  - "domain/disk-space.ts: DISK_SPACE_MARGIN (1.1), assessDiskSpace, diskShortfallMessage, formatByteSize"
  - "DiskSpaceProbePort + DiskSpaceProbe (statfs and device id, du for directories, helper container du for volumes)"
  - "preflight refuses a per-filesystem shortfall or an unmeasurable size before anything is stopped"
  - "backup layout (stack/, bind-mounts/<n>-<name>/, manifest.json) taken after the verified stop and before any data copy; planBackupCopies"
  - "MigrationPreview.diskSpace {withoutBackup, withBackup} (shared migrationDiskSpaceSchema, migrationPreviewDiskSpaceSchema)"
  - "Backup step shows needed versus available space and the wizard blocks a shortfall; MIG-09 and ROADMAP SC#4 amended (D-02)"
affects: [22-07, 22-08]

actuals:
  tokens: 27100
  tasks: 3
  commits: 6
plan_head_before: 1a5082ce6d7e51de92e90cdeb6787aa844c3577a
plan_head_after: 3e25860f081585b5827ae69703428e42183bffd1

tech-stack:
  added: []
  patterns:
    - "Measure once, assess twice: the preview measures the copy set and the backup set one time and derives the with-backup and without-backup assessments from the same sizes"
    - "Integer percent arithmetic for the 10% margin, so 1000 bytes needs exactly 1100 and never 1101 through floating point noise"
    - "An unmeasurable size is a refusal, never a skipped check (fail closed before downtime)"

key-files:
  created:
    - server/src/domain/disk-space.ts
    - server/src/application/ports/disk-space-probe-port.ts
    - server/src/infrastructure/disk-space-probe.ts
    - server/test/unit/domain/disk-space.test.ts
    - server/test/unit/infrastructure/disk-space-probe.test.ts
    - client/src/routes/setup/components/migration-disk-space.tsx
    - client/test/unit/routes/setup/migration-backup-step.test.tsx
  modified:
    - server/src/application/migration-service.ts
    - server/src/domain/migration-target.ts
    - server/src/infrastructure/disk-usage-scanner.ts
    - server/src/infrastructure/volume-migrator.ts
    - shared/src/validation/brownfield.ts
    - client/src/lib/brownfield-types.ts
    - client/src/routes/setup/components/migration-backup-step.tsx
    - client/src/routes/setup/components/migration-wizard.tsx
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md

key-decisions:
  - "The whole requirement lands on one filesystem, the one holding the new stack directory (filesystemOf(targetDir), nearest existing ancestor); grouping by device id keeps assessDiskSpace correct should a destination ever live elsewhere"
  - "In place, no backup copy is measured or counted: the renamed original is the backup"
  - "The preview throws BadRequestError for an unmeasurable size, exactly like the start does; only a shortfall is reported as ok:false"
  - "Backup layout: stack/ (the old directory), bind-mounts/<n>-<name>/ for selected sources outside it, manifest.json with createdAt, stackDirectory {source, backup} and bindMounts [{originalPath, source, backup}]; sources inside the old directory are left to the stack copy; named volumes are never duplicated"
  - "The disk check runs after every other preflight refusal so the user sees the more specific refusal first"

patterns-established:
  - "Probe seams are injectable (sizer, docker runner, fs ops) so the walk to an existing ancestor and the du argv are unit-tested without a host"

requirements-completed: [MIG-09]

coverage:
  - id: D1
    description: "Before anything is stopped, the data to write (selected bind sources, converted named volumes, plus the backup when chosen and not in place) is grouped per destination filesystem and a filesystem lacking required x 1.1 refuses the start, showing needed versus available; an unmeasurable size also refuses"
    requirement: MIG-09
    verification:
      - kind: unit
        ref: "server/test/unit/domain/disk-space.test.ts; server/test/unit/infrastructure/disk-space-probe.test.ts; server/test/unit/application/migration-service.test.ts (free disk space on the receiving filesystem)"
        status: pass
    human_judgment: false
  - id: D2
    description: "With backup chosen the backup is taken after the verified stop and before any data copy; it holds the old stack directory and the selected outside bind sources plus a manifest, not named volumes"
    requirement: MIG-09
    verification:
      - kind: unit
        ref: "server/test/unit/application/migration-service.test.ts (the backup comes after the verified stop and before any data is copied); server/test/unit/domain/migration-target.test.ts (planBackupCopies)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The preview carries the disk assessment for both backup choices (null with backup in place) and the shared schemas validate it"
    requirement: MIG-09
    verification:
      - kind: unit
        ref: "server/test/unit/application/migration-service.test.ts (the disk space check, preview); shared/test/unit/validation/brownfield.test.ts#migrationPreviewDiskSpaceSchema"
        status: pass
    human_judgment: false
  - id: D4
    description: "The backup step shows needed versus available space per filesystem and the wizard disables Next on a shortfall for the current backup choice"
    requirement: MIG-09
    verification:
      - kind: unit
        ref: "client/test/unit/routes/setup/migration-backup-step.test.tsx; client/test/unit/routes/setup/migration-wizard.test.tsx (free disk space)"
        status: pass
    human_judgment: false
  - id: D5
    description: "MIG-09 and ROADMAP SC#4 describe the backup as taken after the verified stop and before any data copy"
    requirement: MIG-09
    verification:
      - kind: other
        ref: "grep -c 'after the verified stop' .planning/REQUIREMENTS.md returns 1; no 'backs up before stopping' or 'taken before the old stack is stopped' remains"
        status: pass
    human_judgment: false
  - id: D6
    description: "A real statfs, du and helper-container du against a live host and Docker daemon behave as the unit fakes assume"
    requirement: MIG-09
    verification: []
    human_judgment: true
    rationale: "Only GitHub Actions or a manual run can exercise the real filesystem calls and docker; the VPS rule forbids Docker-heavy local actions, so the unit tests assert argv and behaviour through fakes"

duration: 18 min
completed: 2026-10-22
status: complete
---

# Phase 22 Plan 06: Disk space check and backup after the verified stop Summary

**A migration is refused before any downtime when the filesystem receiving the data lacks size x 1.1 (needed versus available shown, an unmeasurable size also blocks), the optional backup now holds the old directory plus the selected bind sources with a manifest and is taken after the verified stop and before any copy, and the dialog shows the space check and blocks a shortfall (#107, D-01, D-02, D-03, D-08).**

## Performance

- **Duration:** 18 min
- **Started:** 2026-10-22T18:04:23Z
- **Completed:** 2026-10-22T18:22:11Z
- **Tasks:** 3 (all TDD: RED commit then GREEN commit each; Task 1 is the tracer)
- **Commits:** 6 (measured from the plan ledger: `plan_head_before..HEAD`)
- **Files:** 25 changed in the plan range (7 created, 18 modified)

## Accomplishments

- **Tracer (Task 1).** `assessDiskSpace` sums requirements per filesystem id, applies the margin with integer percent arithmetic and judges each filesystem; `diskShortfallMessage` and `formatByteSize` (B to TiB, one decimal, rounding-aware so 1023.99 KiB reads 1.0 MiB). `DiskSpaceProbe` answers `filesystemOf` (device id plus `bavail x bsize` of the nearest existing ancestor), delegates directory sizes to the existing `du` scanner and measures a volume with `du -sk` in a read-only `alpine` helper container (name validated against `COMPOSE_VOLUME_NAME_PATTERN`, null on failure). `MigrationService.preflight` measures the copy set (existing bind sources, converted volumes by real Docker name) and, with a backup that is not in place, the backup set, and throws `BadRequestError(diskShortfallMessage(...))` before anything is stopped; null sizes throw naming the path or volume.
- **Backup after the verified stop (Task 2).** `execute` now runs stop, verify, move aside (in place), create directory, then `takeBackup` (`stack/`, each `planBackupCopies` source under `bind-mounts/<n>-<name>/`, `manifest.json`), and only then creates `volumes/` and copies data. A vanished planned source fails the step and rolls back before any data copy. The preview returns `diskSpace {withoutBackup, withBackup}` from one set of measurements (`withBackup` null in place).
- **Dialog (Task 3).** New `MigrationDiskSpace` section lists `<label>: needs <size>, <size> available` per filesystem and a `role="alert"` (red with dark counterpart) `Not enough free space on <label>: free up <difference> or turn off the backup.` per short filesystem (in place: `... free up <difference>.`). The wizard derives the assessment for the current backup choice and disables Next on step 3 and Confirm on step 4 on a shortfall; the backup description states the order and scope.
- **Docs (D-02).** MIG-09 and ROADMAP SC#4 amended with the plan's wording; the Phase 22 goal line and phase-list bullet say "a backup exists before any data is changed".

## Task Commits

1. Task 1 RED: `6fdbd47` failing tests for the per-filesystem disk space check
2. Task 1 GREEN: `477aba0` refuse a migration before downtime when a filesystem lacks the space
3. Task 2 RED: `81172d3` failing tests for the backup after the verified stop and the preview assessment
4. Task 2 GREEN: `1207639` backup after the verified stop with the bind sources, disk space in the preview
5. Task 3 RED: `d9aa199` failing tests for the backup step disk space and the wizard gating
6. Task 3 GREEN: `3e25860` space check in the backup step, shortfall blocked, requirement wording amended

**Plan metadata:** the docs commit of this SUMMARY with STATE.md, ROADMAP.md and REQUIREMENTS.md.

## RED evidence (semantic assessment)

- Service, wizard and `planBackupCopies` tests failed on the planned assertions (for example `planBackupCopies is not a function`, `promise resolved instead of rejecting`, shortfall message not thrown). The two brand-new modules (`disk-space.ts`, `disk-space-probe.ts`) failed at module resolution, which is unavoidable for a file that does not exist yet; the RED commit holds only tests, so there are no stubs to make that an assertion failure. A few negative-assertion tests (no backup writes nothing, named volumes not copied, in place ignores backup) passed already in RED by design: they are regression guards for behaviour the change must keep.
- The formal `gsd_run check tdd-red-evidence` record was not produced (plan tasks are `tdd="true"` inside a non-`type: tdd` plan, gate enforcement is off).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] planBackupCopies pulled forward into Task 1**
- **Found during:** Task 1
- **Issue:** The backup set of the preflight measurement needs "the selected bind sources outside the old directory", which is exactly `planBackupCopies` (planned for Task 2).
- **Fix:** Implemented `planBackupCopies` and the three backup layout constants in `migration-target.ts` with the Task 1 commits instead of duplicating an "outside" rule; Task 2 then uses it for the copy and the manifest.
- **Files modified:** server/src/domain/migration-target.ts, server/test/unit/domain/migration-target.test.ts
- **Committed in:** 6fdbd47 (tests), 477aba0

**2. [Rule 3 - Blocking] Exports needed to reuse the du parser and the docker runner**
- **Issue:** The plan says to reuse du handling and the `VolumeDockerRunner` seam; the `du` parser and the production runner were module-private.
- **Fix:** `parseDuBytes` (disk-usage-scanner.ts) and `defaultVolumeDockerRunner` (volume-migrator.ts) are now exported, one-word changes.
- **Committed in:** 477aba0

**3. [Rule 3 - Blocking] brownfield-routes test drove the real probe**
- **Found during:** Task 2 verification (failed since Task 1: `defaultVolumeDockerRunner` missing on its `volume-migrator.js` mock)
- **Fix:** `brownfield-routes.test.ts` stubs `disk-space-probe.js` next to its other infrastructure stubs; `imports.test.ts` (integration, run in CI) gained an assertion on the preview `diskSpace` shape.
- **Files modified:** server/test/unit/routes/brownfield-routes.test.ts, server/test/integration/imports.test.ts
- **Committed in:** 1207639

**4. [Rule 3 - Blocking] Fixture updates beyond the wizard test**
- **Issue:** `MigrationPreview.diskSpace` is required, so `brownfield-import.test.tsx` and the Playwright `setup-wizard.spec.ts` preview fixtures needed it too (the plan names only the wizard fixtures).
- **Committed in:** d9aa199

**5. [Rule 2 - Missing critical] New component file, one extra ROADMAP phrase**
- The space section is its own component (`migration-disk-space.tsx`, client CLAUDE.md: no helper components inline) rather than inline markup in the step. ROADMAP's note line "backup-before-stop with disk check" was updated to "backup after the verified stop with disk check" so no stale wording survives next to the amended criterion.
- **Committed in:** 3e25860

### Deliberate behaviour notes

- **The step-4 Confirm gate is not reachable disabled through the UI.** Next on step 3 is already disabled on a shortfall, so step 4 cannot be entered with a failing assessment; `disabled={!diskOk}` is implemented as the plan asks (defence in depth) and not separately tested because no user path reaches it.
- **A shortfall text may read "1.1 KiB needed, 1.1 KiB available"** when needed and available differ by bytes only: the sizes use one decimal as specified; the refusal still fires on the exact byte comparison.
- **The preview throws on an unmeasurable size** (the dialog shows the message and cannot reach step 3), consistent with "refused exactly like migrate refuses it".

**Total deviations:** 5 auto-fixed (4 Rule 3, 1 Rule 2). **Impact:** none on scope or contract.

## Issues Encountered

- The VPS was loaded (load average about 7): the first full client vitest run exceeded the 120 s tool timeout and was moved to the background; it completed green.
- Per the user's memory rule, no full `tsc --build`, integration, Playwright or full suites were run locally. Run instead: targeted vitest (server unit: application, domain, infrastructure, routes, architecture layering; shared brownfield; client `test/unit/routes/setup`, `test/unit/lib`, `brownfield-import`), `corepack yarn workspace @docktor/shared build`, and scoped `npx tsc --noEmit -p server` and `-p client` (zero errors, about 22 s and 29 s). `server/test/integration/imports.test.ts` and `client/test/integration/setup-wizard.spec.ts` were edited and are left to GitHub Actions CI.

## Known Stubs

None.

## Threat Flags

None. The new surface (statfs/stat of the stacks path, `du` through argv arrays, a read-only helper container with a validated volume name) is exactly T-22-16 and T-22-18 in the plan's register.

## Verification

- Task 1 verify (server unit: disk-space, disk-space-probe, migration-service, layering): pass, with `@docktor/shared build`.
- Task 2 verify (shared brownfield; server migration-service and migration-target): pass.
- Task 3 verify (client migration-backup-step and migration-wizard): pass; `grep -c "after the verified stop" .planning/REQUIREMENTS.md` is 1.
- Acceptance greps: `DISK_SPACE_MARGIN = 1.1` 1, `implements DiskSpaceProbePort` 1, `assessDiskSpace(` in the service 1, `planBackupCopies(` in the service 2, `BACKUP_MANIFEST_NAME` in the service 2, `migrationPreviewDiskSpaceSchema` in shared 2, `backs up before stopping` 0, `taken before the old stack is stopped` 0, `dark:text-red` in the backup step 1 (and in the new disk space component), `diskSpace` in the wizard 5.
- CI-only: `yarn typecheck` across test files, integration and Playwright suites.

## Self-Check: PASSED

## Next Phase Readiness

- Ready for 22-07 and 22-08. The step enum order stays `stopping_old_stack -> verifying_stop -> moving_original_aside -> creating_directory -> backing_up -> copy steps`; the backup layout and manifest are now part of what a rollback ledger or recovery plan may rely on (the backup lives under the new stack directory, which a rollback removes, so a failed run leaves no backup behind and the original is untouched).

---
*Phase: 22-migration-hardening*
*Completed: 2026-10-22*
