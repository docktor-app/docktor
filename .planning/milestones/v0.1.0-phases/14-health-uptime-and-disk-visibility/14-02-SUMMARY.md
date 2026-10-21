---
phase: 14-health-uptime-and-disk-visibility
plan: 02
subsystem: api
tags: [prisma, fastify, du, interval-job, bigint, disk-usage]

requires:
  - phase: 14-health-uptime-and-disk-visibility
    provides: plan 14-01 route registration spot (healthRoutes in app.ts), newest-model header-comment style
provides:
  - StackVolumeUsage table and Stack.backupSizeBytes column with the add_stack_disk_usage migration
  - DiskUsageScannerPort + DiskUsageScanner (du -sk via execFile argv, readdir withFileTypes)
  - DiskUsageJob (daily, non-blocking 60s kickoff, registered last) writing Stack.volumeSizeBytes/volumeSizeAt and replacing StackVolumeUsage rows in one transaction
  - pure summarizeDiskUsage() totals rule (volumes + backups, unmeasured excluded)
  - StorageService.getStorageOverview() and GET /api/storage (requireAuth)
  - toStackSizeDto: BigInt disk sizes serialized as numbers on every stack response
affects: [14-05 storage page, 14-07 stack overview size, 14-14 backups measurement and du failure handling]

actuals:
  tokens: 11300
  tasks: 1
  commits: 1
plan_head_before: 339f390c9c13b2d9f1ee693127cdb5cdd3c5097c
plan_head_after: 67d08760b826d589ebc12eb062e56a2908e8e5a3

tech-stack:
  added: []
  patterns:
    - "Non-blocking first scan: IntervalJob with runImmediatelyOnStart=false plus an unref()ed, non-awaited kickoff timer, registered last"
    - "Replace-wholesale child rows and parent totals in one prisma.$transaction"
    - "DTO boundary in the application service for Prisma BigInt columns (toStackSizeDto)"

key-files:
  created:
    - server/prisma/schema/stack-volume-usage.prisma
    - server/prisma/migrations/20261008074500_add_stack_disk_usage/migration.sql
    - server/src/domain/disk-usage.ts
    - server/src/application/ports/disk-usage-scanner-port.ts
    - server/src/infrastructure/disk-usage-scanner.ts
    - server/src/repositories/stack-disk-usage-repository.ts
    - server/src/application/storage-service.ts
    - server/src/jobs/disk-usage-job.ts
    - server/src/routes/storage.ts
    - server/test/integration/storage.test.ts
  modified:
    - server/prisma/schema/stack.prisma
    - server/src/application/stack-service.ts
    - server/src/application/index.ts
    - server/src/repositories/index.ts
    - server/src/jobs/index.ts
    - server/src/app.ts

key-decisions:
  - "Measurement covers exactly <stack>/volumes/*; a missing volumes folder is recorded as measured (0 bytes, no rows) with no Service.volumes fallback (RESEARCH Open Question 3)"
  - "Per-volume sizes live in a dedicated StackVolumeUsage model (not a JSON column) so they are listed, sorted and cascaded like other per-stack children"
  - "StackService converts BigInt sizes to numbers at its boundary (toStackSizeDto) instead of patching serialization globally"
  - "Migration generated through Branch B (migrate diff from a HEAD-schema copy), same as 14-01"

patterns-established:
  - "Daily heavy job: delayed, unref()ed kickoff timer cleared by stop(); public kickoff() never rejects"

requirements-completed: ["#27"]

coverage:
  - id: D1
    description: "Daily DiskUsageJob measures <stack>/volumes/* with one du -sk -- per path, records per-volume rows and the stack total in one transaction, and records a stack without a volumes folder as 0 bytes"
    requirement: "#27"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/disk-usage-job.test.ts"
        status: pass
      - kind: unit
        ref: "server/test/unit/infrastructure/disk-usage-scanner.test.ts"
        status: pass
      - kind: integration
        ref: "server/test/integration/storage.test.ts#replaces the per-volume rows on the next scan"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET /api/storage returns stacks with per-volume rows, the backups list, measuredAt and volumes + backups totals behind auth"
    requirement: "#27"
    verification:
      - kind: unit
        ref: "server/test/unit/application/storage-service.test.ts"
        status: pass
      - kind: unit
        ref: "server/test/unit/domain/disk-usage.test.ts"
        status: pass
      - kind: integration
        ref: "server/test/integration/storage.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "GET/PUT/POST /api/stacks endpoints keep returning 200/201 with numeric sizes once BigInt values are stored"
    requirement: "#27"
    verification:
      - kind: unit
        ref: "server/test/unit/application/stack-service.test.ts#toStackSizeDto (RESEARCH Finding 5)"
        status: pass
      - kind: integration
        ref: "server/test/integration/storage.test.ts#serves the measured volumes and totals after a scan, and keeps the stack endpoints working"
        status: pass
    human_judgment: false
  - id: D4
    description: "DiskUsageJob never delays boot: first scan on a non-awaited 60s timer, cancelled by stop(), registered last"
    requirement: "#27"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/disk-usage-job.test.ts#non-blocking kickoff (RESEARCH Finding 7)"
        status: pass
      - kind: unit
        ref: "server/test/unit/jobs/index.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Migration SQL applied to the dev database; du behaviour on a real Linux host"
    requirement: "#27"
    verification: []
    human_judgment: true
    rationale: "The dev host is Windows, so du is only exercised through a fake runner; the migration was generated but not applied to the dev database (recorded in .planning/WINDOWS.md), the integration suite uses prisma db push, and syncDatabaseSchema() applies it at next boot"

duration: 9min
completed: 2026-10-08
status: complete
---

# Phase 14 Plan 02: Disk usage server (tracer) Summary

**Daily non-blocking `du` job writes per-stack and per-volume sizes, served at GET /api/storage with volumes + backups totals, plus a BigInt-to-number DTO so the stack endpoints stay up**

## Performance

- **Duration:** 9 min
- **Started:** 2026-10-08T07:38:16Z
- **Completed:** 2026-10-08T07:47:30Z
- **Tasks:** 1 (tracer)
- **Files modified:** 23

## Accomplishments
- `StackVolumeUsage` model (cascade from Stack, `@@unique([stackId, name])`) and `Stack.backupSizeBytes`, with the `add_stack_disk_usage` migration (unedited generated SQL).
- `DiskUsageScanner`: one `du -sk -- <path>` per path through `execFile` argv, KiB x 1024, `readdir withFileTypes` so symlinked entries under `volumes/` are never listed or measured; empty or unparseable `du` output yields null, never 0.
- `DiskUsageJob` (`15 0 * * *`, `runImmediatelyOnStart = false`): `start()` returns before any `du`; the first scan runs on an `unref()`ed, non-awaited timer 60 s later, cancelled by `stop()`. Registered last in `jobs/index.ts`. A stack with no `volumes` folder is recorded as 0 bytes with no rows.
- `StackDiskUsageRepository.recordStackUsage` replaces a stack's volume rows and writes its totals in one `$transaction`; `findStorageRows` hands BigInts out as numbers.
- `summarizeDiskUsage` (pure) and `StorageService.getStorageOverview()`; `GET /api/storage` behind `requireAuth` returns stacks with volumes (largest first), backups (largest first, only stacks with a local repository), `measuredAt` (newest) and totals where `totalBytes = volumes + backups`; totals are null when nothing is measured.
- `toStackSizeDto` applied in `createStack`, `listStacks`, `getStack` (so `getStackWithUpdateInfo`) and `updateStack`; integration test proves list, detail and update return 200 with a numeric `volumeSizeBytes` after a real write.
- Tracer verified end-to-end (real Postgres + real Fastify): job kickoff with a fake scanner, `GET /api/storage`, `GET /api/stacks`, `GET /api/stacks/:id`, `PUT /api/stacks/:id`, replace-on-rescan, 401 without a session.

## Task Commits

1. **Task 1: End-to-end disk usage (tracer)** - `67d0876` (feat)

**Plan metadata:** committed separately (docs: complete plan)

_Note: tests were written first alongside each unit and the whole task was committed once because CLAUDE.md forbids committing failing tests._

## Decisions Made
- Migration branch used: **Branch B** (see deviations); migration folder `20261008074500_add_stack_disk_usage`.
- The integration test points `DOCKTOR_STACKS_DIR` at a temp directory so `POST /api/stacks` does not write into the repo's `server/stacks/`.
- `DiskUsageScanner.listVolumeDirectories` returns null only for ENOENT and rethrows other read errors, so an unreadable folder is never mistaken for "no volumes".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Live `prisma migrate dev` not runnable; Branch B used**
- **Found during:** Task 1, step 2
- **Issue:** Same session constraint as 14-01: commands naming the dev env file are blocked, so `dotenv -e <dev env file> -- prisma migrate dev` cannot be issued.
- **Fix:** Copied HEAD's schema directory to a scratch directory, ran `prisma migrate diff --from-schema <scratch> --to-schema server/prisma/schema --script` with a placeholder `DATABASE_URL` (the diff never connects), saved the SQL unedited, ran `prisma validate` and `prisma generate` with the placeholder URL.
- **Files modified:** `server/prisma/migrations/20261008074500_add_stack_disk_usage/migration.sql`
- **Verification:** SQL contains `CREATE TABLE "StackVolumeUsage"` and `ADD COLUMN "backupSizeBytes"` (count 2); schema valid; storage integration suite green against a schema pushed by `prisma db push`
- **Committed in:** 67d0876

**2. [Rule 3 - Blocking] Migration not applied to the dev database; ledger entry recorded**
- **Fix:** `unrun-verify` entry appended to `.planning/WINDOWS.md` naming `add_stack_disk_usage`, as the plan prescribes. `syncDatabaseSchema()` applies it at next boot.

**3. [Rule 1 - Bug] Partial sum would have been recorded when a volume could not be sized**
- **Found during:** Task 1, writing DiskUsageJob
- **Issue:** Skipping a volume whose `measureBytes` returned null and still recording would replace a stack's rows and total with an undercount. The plan assigns the skip-on-null rule to 14-14, but writing the tracer without it would persist wrong data.
- **Fix:** `measureStack` returns null when any volume cannot be sized and the stack keeps its previous figures. Unit test added. 14-14 still owns `du` failure classification (exit-1 tolerance, missing `du`, timeout) and per-stack error isolation.
- **Files modified:** `server/src/jobs/disk-usage-job.ts`, `server/test/unit/jobs/disk-usage-job.test.ts`
- **Committed in:** 67d0876

**4. [Rule 1 - Bug] Existing stack-service fixtures lacked the size columns**
- **Issue:** Prisma rows always carry `volumeSizeBytes`/`backupSizeBytes`; fixtures without them turned into `NaN` once `toStackSizeDto` ran, breaking four `toEqual` assertions.
- **Fix:** Fixtures now include the two columns as null via a shared `NO_SIZES` constant.
- **Files modified:** `server/test/unit/application/stack-service.test.ts`
- **Committed in:** 67d0876

---

**Total deviations:** 4 auto-fixed (2 bug, 2 blocking)
**Impact on plan:** No scope change. The only open item is applying the migration to a dev database.

## Issues Encountered
- The full server unit suite still shows the 2 pre-existing failures in `test/unit/infrastructure/git-executor.test.ts` (Windows timeouts / `EBUSY`), already logged in `deferred-items.md` by 14-01; untouched.
- `eslint` is not installed in this workspace, so lint was not run; `yarn typecheck` (tsc --build) is clean.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None. `backupSizeBytes` is intentionally written as null by the job until 14-14 measures `<stack>/backups`; GET /api/storage already serves a stored value (covered by the integration test).

## Threat Flags
None beyond the plan's threat model: the new surface is `GET /api/storage` (T-14-05, requireAuth plus 401 test), `du` argv with `--` and Dirent-only listing (T-14-06, T-14-07), the delayed non-awaited kickoff (T-14-08) and the DTO fix (T-14-09).

## Next Phase Readiness
- 14-14 can add the `<stack>/backups` measurement (widening the scanner port with `isRealDirectory`), `du` exit-1/timeout/missing-binary handling and per-stack error isolation inside `measureStack`.
- 14-05 and 14-07 can render from `GET /api/storage` and the numeric `volumeSizeBytes` on stack payloads.
- Open: apply the migration to the developer's dev database (WINDOWS.md entry).

## Self-Check: PASSED

- All created files exist on disk (schema, migration, domain, port, scanner, repository, service, job, route, 5 test files).
- Commit `67d0876` is an ancestor of HEAD.
- Acceptance criteria re-run: migration folder count 1; SQL count 2; `onDelete: Cascade` count 1; `toStackSizeDto` count 6; `"-sk", "--"` count 1; `runImmediatelyOnStart = false` count 1; last `jobRegistry.register(` is `diskUsageJob`; `storageRoutes` in app.ts 2; `stackDiskUsageRepository` in repositories/index.ts 1; `DiskUsageJobStore` has exactly `listStackIds` and `recordStackUsage`.
- Verification: plan unit set 306/306 (8 files incl. layering); storage integration 5/5; full server unit suite 1483 passed, 2 pre-existing git-executor failures; `prisma validate` ok; `yarn typecheck` clean.

---
*Phase: 14-health-uptime-and-disk-visibility*
*Completed: 2026-10-08*
