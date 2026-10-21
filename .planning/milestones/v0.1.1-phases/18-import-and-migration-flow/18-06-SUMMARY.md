---
phase: 18-import-and-migration-flow
plan: 06
subsystem: api
tags: [migration, rollback, filesystem, error-handling, typescript, vitest]
gap_closure: true

requires:
  - phase: 18-import-and-migration-flow
    provides: "18-03 MigrationService.migrate() with rollback (D-09, D-11)"
provides:
  - "hasErrorCode(err, code) errno type guard shared from lib/errors.ts"
  - "Bind-mount copy failures fail the migration and roll back (CR-01)"
  - "StackFilesystemPort.createDirectoryExclusive (EEXIST -> ConflictError with cause)"
  - "recordCreated-scoped record delete in the rollback (CR-02)"
  - "MigrationService.preflight(input) -> MigrationPlan (typed 400/409 refusals, no side effects) and execute(plan) seam for the G-18-job background operation"
affects: [18-07, 18-11, 18-12, 18-14, 18-16]

actuals:
  tokens: 7873
  tasks: 2
  commits: 4
plan_head_before: 99e957f83be9b194d6f253ef59fb95f12b91409f
plan_head_after: af6ed306f56088fc5c9e02ffa428ec9964714f2c
commits: 4

tech-stack:
  added: []
  patterns:
    - "Exclusive leaf mkdir so rollback only ever removes a directory this run created"
    - "preflight (side-effect-free, typed refusals) / execute (steps + rollback) split"
    - "ENOENT-only fallback via shared hasErrorCode guard"

key-files:
  created:
    - server/test/unit/infrastructure/stack-filesystem.test.ts
  modified:
    - server/src/lib/errors.ts
    - server/src/infrastructure/disk-usage-scanner.ts
    - server/src/application/migration-service.ts
    - server/src/application/ports/stack-filesystem-port.ts
    - server/src/infrastructure/stack-filesystem.ts
    - server/test/unit/lib/errors.test.ts
    - server/test/unit/application/migration-service.test.ts

key-decisions:
  - "Only ENOENT on the bind-mount source existence check means an empty volume; every other access or copy error reaches the rollback (CR-01)"
  - "Target directory is created with a non-recursive leaf mkdir; an EEXIST leaves createdStackDir false so rollback never removes a foreign directory (CR-02)"
  - "Refusals (empty slug, existing record, existing/overlapping target) are typed BadRequestError/ConflictError thrown from preflight; step failures still resolve with success false"
  - "Tolerant createDirectory stays on the port for stack-service and proxy-service"

requirements-completed: [MIG-03, MIG-04]

duration: 28min
completed: 2026-10-16
status: complete
---

# Phase 18 Plan 06: Migration rollback gap closure (CR-01, CR-02) Summary

**A failing bind-mount copy now fails the migration and restarts the old stack, rollback removes only the directory and record the run created (exclusive mkdir plus `recordCreated`), and refusals moved into a side-effect-free `preflight()` that feeds `execute(plan)`.**

## Performance

- **Duration:** ~28 min (excludes the human-action pause for the dependency install)
- **Tasks:** 2
- **Files modified:** 8 (1 created, 7 modified)

## Accomplishments

- CR-01: Step 5 extracted into `copyBindMounts`; `sourceExists` treats only ENOENT as "missing" (empty destination directory). ENOSPC/EACCES/mid-copy errors propagate to the rollback, which removes the new directory and restarts the old stack.
- `hasErrorCode` moved to `lib/errors.ts`; the disk-usage scanner imports it instead of keeping a private copy.
- CR-02: `createDirectoryExclusive` on the port and `StackFilesystem` (EEXIST -> `ConflictError` with `cause`, other errors -> `AppError` with `cause`); `recordCreated` gates `stackRepo.delete`.
- `migrate()` is now `execute(await preflight(input))`; `MigrationPlan` exported. 18-07, 18-11, 18-12, 18-14, 18-16 build on `preflight`/`execute`.

## Task Commits

1. **Task 1 RED** `77f1945` test(18-06): failing tests for bind-mount copy failure rollback and hasErrorCode
2. **Task 1 GREEN** `ab9dee8` fix(18-06): fail and roll back the migration when a bind-mount copy fails
3. **Task 2 RED** `2edf4e6` test(18-06): failing tests for exclusive target creation, recordCreated and preflight refusals
4. **Task 2 GREEN** `af6ed30` feat(18-06): create the target exclusively, scope record rollback and split preflight from execute

## TDD Gate Compliance

Both tasks produced a `test(18-06)` commit before the `fix`/`feat(18-06)` commit.

- Task 1 RED: copy failure and EACCES tests returned `success: true` (old swallow-all catch created an empty directory); `hasErrorCode` tests failed because the guard did not exist. The missing-source and copy-success tests passed against HEAD, as expected (they pin retained behaviour). Semantic assessment: failures were on the planned assertions for the intended reason.
- Task 2 RED: failures came from the missing `createDirectoryExclusive`/`preflight`/`execute` and from the old unconditional behaviour; the migration-service suite failed broadly because the fake no longer provides the tolerant `createDirectory` (the planned contract change). The plan is `type: execute`, so `gsd_run check tdd-red-evidence` records were not produced.

## Files Created/Modified

- `server/src/lib/errors.ts` - `hasErrorCode`
- `server/src/infrastructure/disk-usage-scanner.ts` - uses shared guard
- `server/src/application/migration-service.ts` - `sourceExists`, `copyBindMounts`, `MigrationPlan`, `preflight`, `execute`, `recordCreated`
- `server/src/application/ports/stack-filesystem-port.ts` - `createDirectoryExclusive`
- `server/src/infrastructure/stack-filesystem.ts` - exclusive create
- `server/test/unit/infrastructure/stack-filesystem.test.ts` (new), `server/test/unit/lib/errors.test.ts`, `server/test/unit/application/migration-service.test.ts`

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Dependencies not installed in the checkout**
- **Found during:** Task 1 (previous executor run)
- **Issue:** `node_modules` missing; `yarn` not on PATH.
- **Fix:** user approved the install at a human-action checkpoint; the orchestrator ran `corepack yarn install --immutable` and built `shared/dist`. Tests were run as `cd server && corepack yarn vitest run --project unit --coverage.enabled=false <files>` instead of `../node_modules/.bin/vitest`.
- **Files modified:** none tracked.

**2. [Rule 1 - Test fixture] "still backs up when not renamed" expectation**
- **Found during:** Task 2 GREEN
- **Issue:** with the stack-fs fake deriving paths from the stackId (as planned), that test's displayName (`original`) now maps to `<tmp>/stacks/original`, not the fixture `newStackPath`.
- **Fix:** the expected backup destination uses the path derived from that slug; assertion intent unchanged.
- **Commit:** af6ed30

**Total deviations:** 2 (1 blocking environment, 1 fixture adjustment). **Impact:** none on scope.

## Verification

- Unit run (8 files: migration-service, stack-filesystem, errors, disk-usage-scanner, stack-service, proxy-service, brownfield-routes, layering): 8 files, 411 tests passed.
- `cd server && corepack yarn tsc --noEmit -p .`: no errors.
- Left for CI per the project's no-heavy-local-actions rule: `tsc --build`, server integration tests, Playwright, Windows unit job.

## Known Stubs

None.

## Threat Flags

None. T-18-18 and T-18-19 are mitigated as planned.

## Issues Encountered

None beyond the dependency install above.

## Next Phase Readiness

`preflight`/`execute`/`MigrationPlan` and `createDirectoryExclusive` are in place for plans 18-07, 18-11, 18-12, 18-14 (per-slug in-flight 409 on operation start) and 18-16.

## Self-Check: PASSED

- Created/modified files exist; commits 77f1945, ab9dee8, 2edf4e6, af6ed30 are ancestors of HEAD.
- All task acceptance greps pass; verify commands exit 0.
