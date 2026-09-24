---
phase: 10-backend-architecture-refactor
plan: 10
subsystem: backend-architecture
tags: [ddd, ports-and-adapters, hexagonal-architecture, typescript, routes, application-services, fitness-function]

# Dependency graph
requires:
  - phase: 10-09
    provides: "The route-to-service layering pattern (a route's cross-layer reach moves into a service method with the identical fold/shape, never changing the response) this plan closes out on the last remaining route file, plus SettingsService.upsertEncryptedSetting() (10-09 Task 1), the single encrypted-write path this plan reuses for backup credentials"
provides:
  - "server/src/routes/backups.ts imports no repository, infrastructure module, job module or database client — every handler calls backupService/settingsService only"
  - "BackupSchedulePort (application/ports/backup-schedule-port.ts) — the seam BackupService uses to tell the scheduler about a change without importing a job module; the exported backupScheduler facade in jobs/backup-scheduler.ts is annotated Job & BackupSchedulePort so a member removed from the facade is a compile error"
  - "BackupService.saveBackupConfig() — one call that validates the cron expression, persists the stack's schedule/retention/hooks, and notifies the schedule port (persist-then-notify ordering)"
  - "server/test/unit/architecture/layering.test.ts's new routes rule — no file under server/src/routes/ may import repositories/, infrastructure/, jobs/, or lib/db.js — enforced for every route file in the server, not just backups.ts"
affects: [10-11, 10-12, 10-13, 10-14, 10-15]

# Actuals (#2632)
actuals:
  tokens: 15500
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Concurrent-fetch context methods: instead of a route's fire-and-forget async block calling three repositories directly through a bare Promise.all (backupRepository.findByIdOrThrow, stackRepository.findByIdOrThrow, backupService.getBackupRepoConfig), one service method (getBackupRunContext()/getBackupAndStack()) performs the identical Promise.all internally and returns the destructured shape — preserving the exact round-trip count and concurrency, not just moving the calls."
    - "409-conflict-as-typed-error: the route's inline 'if transitional state, reply.status(409).send(...)' guard becomes a service method (getSnapshotsIfIdle()) that throws ConflictError, letting the same global error handler that already converts NotFoundError/BadRequestError to HTTP responses produce the byte-identical 409 body — one conversion mechanism for every typed error, not a second ad hoc branch in the route."
    - "Grouped settings write reused across a new domain: SettingsService.saveBackupRepositorySettings() follows the exact saveSmtpConfig() shape from 10-09 (plain fields via repo.upsert() in original order/conditionals, secrets via the shared upsertEncryptedSetting() path) — proving that pattern generalizes to a second settings domain (backup credentials) without a new encrypted-write primitive."

key-files:
  created:
    - server/src/application/ports/backup-schedule-port.ts
  modified:
    - server/src/application/backup-service.ts
    - server/src/application/index.ts
    - server/src/application/settings-service.ts
    - server/src/jobs/backup-scheduler.ts
    - server/src/repositories/stack-repository.ts
    - server/src/routes/backups.ts
    - server/test/unit/application/backup-service.test.ts
    - server/test/unit/application/settings-service.test.ts
    - server/test/unit/architecture/layering.test.ts

key-decisions:
  - "StackRepository gained a narrow updateBackupConfig() method (writing exactly the four backup-config columns) rather than a generic update(id, data) — mirrors the existing narrow-write convention (updateStatusFields(), updateStackHash(), setConfigChanged()) instead of introducing the first unconstrained field-bag write on this repository."
  - "The exported backupScheduler facade in jobs/backup-scheduler.ts is annotated Job & BackupSchedulePort using a type-only import of BackupSchedulePort — confirmed (by reading the file) that the facade's only top-level runtime imports remain cron and ./job.js, so application/index.ts's new static import of this module carries no risk of a runtime module cycle; the facade's own reach back into application/index.js stays behind a lazy dynamic import inside its own start(), unchanged from before this plan. Verified live: importing application/index.ts standalone via tsx resolves cleanly and backupService.saveBackupConfig is callable."
  - "Backup-settings read/write methods (getMaskedBackupRepositorySettings/saveBackupRepositorySettings/getBackupDefaults/updateBackupDefaults) were added to SettingsService, not BackupService — even though BackupService already owns backup.* setting reads via its BackupSettingsService port. This keeps every write-capable settings method behind SettingsService's single upsert()/upsertEncrypted() choke point (matching 10-09's SMTP precedent) rather than teaching a second application service how to write settings directly."
  - "getSnapshotsIfIdle() preserves the original route's double stack-fetch (one explicit findByIdOrThrow for the transitional-status check, then getSnapshots()'s own internal findByIdOrThrow) rather than deduplicating it — the plan's byte-identical-response boundary covers behavior, not incidentally removing a pre-existing inefficiency outside this plan's declared scope."
  - "Per-task git history was reconstructed to match the plan's three-task structure (temporarily reducing backup-service.ts/routes/backups.ts/backup-service.test.ts to each task's exact scope, verifying typecheck+tests at each checkpoint, then restoring and committing the next task's content) after an interrupted first pass had produced all three tasks' code in a merged working-tree state — preserves the atomic-commit-per-task contract every other plan in this phase follows, rather than landing all three tasks in one commit."

requirements-completed: ["D-01", "D-07", "D-10"]

coverage:
  - id: D1
    description: "Every route file in the server calls application services only; the routes case in layering.test.ts fails if any route file (not just backups.ts) reintroduces a repository/infrastructure/jobs/database-client import"
    requirement: "D-01"
    verification:
      - kind: unit
        ref: "server/test/unit/architecture/layering.test.ts — routes call application services only describe block (10 route files), all pass"
        status: pass
      - kind: other
        ref: "grep -rcE '^\\s*import .*(lib/db|repositories/|infrastructure/|jobs/)' server/src/routes/ -> 0 for every file; grep -cE 'prisma\\.' server/src/routes/backups.ts -> 0; grep -cE '\\bencrypt\\(' server/src/routes/backups.ts -> 0; manually reintroduced a repositories/ import into routes/backups.ts, confirmed the new layering test rule fails, reverted"
        status: pass
    human_judgment: false
  - id: D2
    description: "Persisting a stack's backup schedule and informing the scheduler are one application-service call (BackupService.saveBackupConfig() -> BackupSchedulePort), with the cron validation and its refusal (BadRequestError -> 400 {error: \"Invalid cron expression\"}) unchanged, and the exported scheduler facade compile-checked against the port"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "server/test/unit/application/backup-service.test.ts — saveBackupConfig() describe block (5 cases incl. persist-before-schedule-port-notify ordering, upsert-vs-remove branching, invalid-cron rejection), all pass"
        status: pass
      - kind: other
        ref: "grep -cE '^\\s*import .*jobs/' server/src/routes/backups.ts -> 0; grep -cE 'backupScheduler' server/src/routes/backups.ts -> 0; grep -cE 'cron\\.validate' server/src/routes/backups.ts -> 0 and exactly 1 in backup-service.ts; yarn typecheck confirms Job & BackupSchedulePort compiles (a member removed from the facade would fail this build)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Backup credentials (sftpKey, s3SecretKey, password) use the same encrypted-write path (SettingsService.upsertEncryptedSetting()) as every other secret, with blank-value-leaves-stored-value-untouched conditionals preserved per field; every remaining repository/infrastructure/database-client reach in routes/backups.ts is closed (D-10 defect class)"
    requirement: "D-10"
    verification:
      - kind: unit
        ref: "server/test/unit/application/settings-service.test.ts — saveBackupRepositorySettings/getMaskedBackupRepositorySettings/getBackupDefaults/updateBackupDefaults describes (12 new tests incl. one blank-value case per secret field), all pass"
        status: pass
      - kind: unit
        ref: "server/test/unit/application/backup-service.test.ts — getSnapshotsIfIdle/listBackups/getBackupDto/getBackupRecordOrThrow/getBackupAndStack/getBackupRunContext/getBackupConfig/checkResticStatus describes (18 new tests incl. NotFoundError propagation for a missing backup id), all pass"
        status: pass
      - kind: unit
        ref: "yarn workspace @docktor/server test:unit -> 54 files, 946 passed + 2 todo (up from 10-09's 907 passed + 2 todo baseline by 39 new tests)"
        status: pass
      - kind: unit
        ref: "yarn typecheck -> 0 errors"
        status: pass
    human_judgment: false

# Metrics
duration: ~2h (across an interrupted-and-resumed session; see Issues Encountered)
completed: 2026-09-24
status: complete
---

# Phase 10 Plan 10: Close the Last Route File — routes/backups.ts (D-01, D-07, D-10) Summary

**`routes/backups.ts` — the route file with the most cross-layer reaches in the server (two repositories, an infrastructure executor, a job module, the database client) — now imports nothing but application services, behind a new `BackupSchedulePort`, eight new `BackupService` read/context methods, four new `SettingsService` backup-settings methods, and a routes-wide architecture fitness rule that fails the build if any route file backslides.**

## Performance

- **Duration:** ~2h across an interrupted-and-resumed session (the first pass was cut short by a session rate-limit after ~11 tool calls, still in the reading/investigation phase, with no commits made; this run restarted from scratch per the coordinator's instructions)
- **Started:** 2026-09-23 (first, interrupted attempt) / 2026-09-24 (this completed run)
- **Completed:** 2026-09-24
- **Tasks:** 3
- **Files modified:** 10 (1 created, 9 modified)

## Accomplishments
- `BackupSchedulePort` (`application/ports/backup-schedule-port.ts`) — the seam that lets `BackupService` tell the scheduler about a change without importing `jobs/`; the exported `backupScheduler` facade in `jobs/backup-scheduler.ts` is annotated `Job & BackupSchedulePort` so a member removed from the facade fails the TypeScript build
- `BackupService.saveBackupConfig()` — one call replacing the route's inline validate-cron / resolve-effective-schedule-and-retention / `prisma.stack.update()` / `backupScheduler.upsert()`-or-`.remove()` sequence; persists first, notifies the schedule port second
- `StackRepository.updateBackupConfig()` — the narrow write path for the four per-stack backup-config columns, wired through a new adapter member on the existing `BackupStackRepo` interface in `application/index.ts`
- Eight new `BackupService` methods move every remaining repository/infrastructure reach out of the route: `listBackups()`, `getBackupDto()`, `getBackupRecordOrThrow()`, `getBackupAndStack()`, `getBackupRunContext()` (all preserving the original handlers' concurrent-fetch round-trip counts), `getSnapshotsIfIdle()` (the pre-existing 409-transitional-state guard, now a typed `ConflictError`), `getBackupConfig()`, and `checkResticStatus()`
- `SettingsService` gains `saveBackupRepositorySettings()`/`getMaskedBackupRepositorySettings()`/`getBackupDefaults()`/`updateBackupDefaults()` — backup credentials now flow through the same `upsertEncryptedSetting()` path SMTP secrets used since plan 10-09, with every blank-value-leaves-stored-value-untouched conditional preserved per secret field
- `routes/backups.ts` no longer imports `backupRepository`, `stackRepository`, `resticExecutor`, `backupScheduler`, `encrypt`, `prisma`, or `node-cron` — every one of its 14 handlers calls `backupService`/`settingsService` exclusively
- `server/test/unit/architecture/layering.test.ts` gained the routes rule: no file under `server/src/routes/` may have a top-level import into `repositories/`, `infrastructure/`, `jobs/`, or `lib/db.js` — confirmed live by temporarily reintroducing a repository import into `routes/backups.ts`, watching the new test fail, then reverting
- `yarn typecheck` and `yarn workspace @docktor/server test:unit` (54 files, 946 passed + 2 todo — up from 10-09's 907 passed + 2 todo baseline by 39 new tests) both exit zero after every task and at plan completion
- `server/test/integration/` is unmodified (`git diff --stat -- server/test/integration/` is empty against the pre-plan baseline), satisfying the phase-boundary requirement

## Task Commits

Each task was committed atomically:

1. **Task 1: One service call persists a stack's backup schedule and informs the scheduler** - `f18a053` (feat)
2. **Task 2: BackupService serves the backup and stack reads and the restic version check** - `96f9985` (feat)
3. **Task 3: Backup credentials use the shared encrypted-write path; install the routes fitness rule** - `2c38d21` (feat)

_No TDD-flagged tasks in this plan's frontmatter — each task's tests were authored alongside the extraction/move and committed together with it, matching 10-06 through 10-09's precedent for this phase's extraction-style work._

_Commit-history note: the working session that produced this code was interrupted mid-Task-1 (before any commit) by a session rate-limit and restarted from scratch per the coordinator. During the restart, all three tasks' code was written in a merged pass before atomic per-task commits were reconstructed by temporarily reducing the shared files (`backup-service.ts`, `routes/backups.ts`, `backup-service.test.ts`) to each task's exact scope, verifying `yarn typecheck` + the relevant test files at each checkpoint, then restoring the next task's content — so the git history still matches the plan's three-task structure exactly, verified independently at each step rather than reconstructed from memory alone._

## Files Created/Modified
- `server/src/application/ports/backup-schedule-port.ts` - New: `BackupSchedulePort` interface (`upsert`/`remove`)
- `server/src/application/backup-service.ts` - Added `schedulePort` constructor param, `BackupStackRepo.updateBackupConfig` interface member, `saveBackupConfig()`, `getSnapshotsIfIdle()`, `listBackups()`, `getBackupDto()`, `getBackupRecordOrThrow()`, `getBackupAndStack()`, `getBackupRunContext()`, `getBackupConfig()`, `checkResticStatus()`
- `server/src/application/index.ts` - Imports `backupScheduler` from `jobs/backup-scheduler.js`; `backupStackRepo` adapter gains `updateBackupConfig`; `backupService` construction passes `backupScheduler` as the 9th (schedule port) argument
- `server/src/application/settings-service.ts` - Added `MaskedBackupRepositorySettings`/`BackupDefaultsView` types and `getMaskedBackupRepositorySettings()`, `saveBackupRepositorySettings()`, `getBackupDefaults()`, `updateBackupDefaults()`
- `server/src/jobs/backup-scheduler.ts` - Exported `backupScheduler` facade re-typed as `Job & BackupSchedulePort` (type-only import, no runtime edge added)
- `server/src/repositories/stack-repository.ts` - Added `updateBackupConfig()`
- `server/src/routes/backups.ts` - Removed `backupRepository`, `stackRepository`, `resticExecutor`, `backupScheduler`, `encrypt`, `prisma`, `node-cron` imports; every handler now calls `backupService`/`settingsService` methods only
- `server/test/unit/application/backup-service.test.ts` - Added `mockSchedulePort`, extended `mockBackupRepository`/`mockStackRepository`/`mockResticExecutor` mock factories, and 8 new describe blocks (23 new tests)
- `server/test/unit/application/settings-service.test.ts` - Added `saveBackupRepositorySettings`/`getMaskedBackupRepositorySettings`/`getBackupDefaults`/`updateBackupDefaults` describes (12 new tests)
- `server/test/unit/architecture/layering.test.ts` - Added the routes-wide "no repository/infrastructure/jobs/database-client import" rule, covering all 10 files under `server/src/routes/`

## Decisions Made

**Before/after response shapes (D-01/D-07/D-10 phase-boundary requirement, recorded per the plan's acceptance criteria):**

- `PUT /api/stacks/:id/backup-config` — before: route validated the cron expression inline (`400 {error: "Invalid cron expression"}` on failure), resolved effective schedule/retention, wrote via `prisma.stack.update()`, then called `backupScheduler.upsert()`/`.remove()` directly. After: route calls `backupService.saveBackupConfig(id, request.body)`, which performs the identical validate → resolve → persist → notify sequence and throws the same `BadRequestError("Invalid cron expression")` (rendered by the global handler as the byte-identical 400 body). **Identical response shape on both branches.**
- `POST /api/stacks/:id/backup` / `POST /api/stacks/:id/restore` — before: each route's fire-and-forget block ran its own `Promise.all` against `backupRepository`/`stackRepository`/`backupService.getBackupRepoConfig()` directly. After: one call to `backupService.getBackupRunContext()`/`getBackupAndStack()` performs the identical `Promise.all` internally. **Identical response shape** (`202 {backupId}`) and identical concurrency (same round-trip count, not sequential awaits).
- `GET /api/stacks/:id/backups` — before: route called `backupRepository.findByStackId()` then mapped through `.toDto()` itself. After: `backupService.listBackups()` performs the identical fetch + map. **Identical response shape.**
- `GET /api/stacks/:id/snapshots` — before: route fetched the stack, checked `["BACKING_UP", "RESTORING"].includes(stack.status)`, and built `409 {error: "Backup in progress, try again shortly"}` inline before calling `backupService.getSnapshots()`. After: `backupService.getSnapshotsIfIdle()` performs the identical check and throws `ConflictError("Backup in progress, try again shortly")`, rendered by the global handler as the byte-identical 409 body. **Identical response shape on both branches**, including the pre-existing double stack-fetch (preserved, not deduplicated — out of this plan's declared scope).
- `GET /api/backups/:id` — before: `backupRepository.findByIdOrThrow()` + `.toDto()` inline. After: `backupService.getBackupDto()`. **Identical response shape**; a missing id still raises the repository's typed `NotFoundError` (-> 404), confirmed by a new unit test.
- `GET /api/backups/:id/stream` (SSE) — before: two separate `backupRepository.findByIdOrThrow()` call sites (initial fetch, and the no-live-broadcaster re-read). After: both call `backupService.getBackupRecordOrThrow()`, returning the same raw (non-DTO) row shape the handler already consumed (`backup.status`, `backup.logLines`). **Identical SSE frame sequence** — no change to the hijacked-response header/write/end logic, which stayed in the route untouched.
- `GET /api/stacks/:id/backup-config` — before: route fetched the stack plus two global-default settings inline and built the response object itself. After: `backupService.getBackupConfig()` performs the identical fetch/parse/fold, reading the two global-default keys through the service's already-injected `settings` port. **Identical response shape.**
- `GET /api/settings/backup` — before: route read ten `backup.*` keys via `settingsRepository.getMany()` and built the masked object inline. After: route calls `settingsService.getMaskedBackupRepositorySettings()`. **Identical response shape** — same field-by-field fold with the same presence-indicator masking for the three secrets.
- `PUT /api/settings/backup` — before: route issued up to seven `settingsRepository.upsert()` calls plus three conditional `prisma.setting.upsert()` calls (one per secret, each constructing its own encrypted row via `encrypt()`) inline. After: route calls `settingsService.saveBackupRepositorySettings(request.body)`, which performs the same plain upserts in the same order and the same three conditional writes through the shared `upsertEncryptedSetting()` path. **Identical response shape and identical write semantics**, including all three blank-value-leaves-stored-value-untouched conditionals (T-10-33).
- `GET /api/settings/backup-defaults` / `PUT /api/settings/backup-defaults` — before: route read/wrote two `backup.default*` keys inline via `settingsRepository`. After: route calls `settingsService.getBackupDefaults()`/`updateBackupDefaults()`, performing the identical key list, JSON parse/stringify, and per-field conditional upserts. **Identical response shapes.**
- `GET /api/settings/backup/status` — before: route called `resticExecutor.checkVersion()` directly. After: route calls `backupService.checkResticStatus()`, which delegates to the same already-injected restic port. **Identical response shape.**

**Preserved `preHandler`/`onRequest` hooks (T-10-32, phase threat model):** This plan edited handler bodies only. `routes/backups.ts`'s single `app.addHook("onRequest", requireAuth)` registration is unchanged — confirmed by grep (one occurrence, same position) and by reading the full diff, which touches no route registration, schema, or hook.

**Module-cycle confirmation (T-10-34, phase threat model):** `jobs/backup-scheduler.ts`'s top-level imports, after adding the type-only `BackupSchedulePort` import, remain exactly `cron` (runtime) and `./job.js` (type-only) — confirmed by reading the file's import block. `application/index.ts`'s new static import of the `backupScheduler` object from this module therefore introduces no runtime cycle: the facade's own reach back into `application/index.js` (via `createProductionScheduler()`'s `await import("../application/index.js")`) stays behind a lazy dynamic import triggered only when `.start()` runs, well after both modules have finished their own top-level evaluation. Verified live in this session: `yarn node --import tsx -e "import('./src/application/index.ts')..."` resolves cleanly and `backupService.saveBackupConfig` is callable, with no hang or circular-dependency error.

**Not-found mechanism (T-10-35, phase threat model):** Every new `BackupService` read method (`getBackupDto`, `getBackupRecordOrThrow`, `getBackupAndStack`, `getBackupRunContext`) delegates to `BackupRepository`'s existing throwing `findByIdOrThrow()` — an unknown backup id still raises the typed `NotFoundError` the global handler maps to 404, never a null-return-plus-route-check. Asserted directly by two new unit tests (`getBackupDto`/`getBackupRecordOrThrow` "propagates the repository's NotFoundError for an unknown id, unchanged").

## Deviations from Plan

**1. [Rule 2 — auto-add missing critical layering fix] Also closed `GET /api/settings/backup` and `GET`/`PUT /api/settings/backup-defaults`, beyond Task 3's literal read-first scope**

- **Found during:** Task 3
- **Issue:** Task 3's `<read_first>`/`<action>` text names only the `PUT /api/settings/backup` handler ("the backup-repository settings handler", lines 340-400 in the original file) as needing conversion to `SettingsService`. But `GET /api/settings/backup` and both `backup-defaults` handlers also called `settingsRepository` directly (imported via the `application/index.js` barrel re-export, which the plan's own grep-based acceptance criteria — specifier-literal `repositories/` matching — would not have caught, since the import specifier is `../application/index.js`, not `../repositories/settings-repository.js`). The plan's `must_haves.truths` and `success_criteria` state unconditionally that every route file "calls application services only" and "imports no repository" — a truth the grep-based acceptance criteria only partially operationalized for this one file's remaining non-secret settings reads/writes.
- **Fix:** Added `getMaskedBackupRepositorySettings()`, `getBackupDefaults()`, and `updateBackupDefaults()` to `SettingsService` (alongside the plan-mandated `saveBackupRepositorySettings()`) and routed all four `/api/settings/backup*` handlers through it, eliminating the `settingsRepository` import from `routes/backups.ts` entirely rather than leaving three read/write paths on the repository singleton.
- **Files modified:** `server/src/application/settings-service.ts`, `server/src/routes/backups.ts`, `server/test/unit/application/settings-service.test.ts` (already in Task 3's declared file list)
- **Verification:** `grep -cE 'settingsRepository' server/src/routes/backups.ts` -> 0 (not itself a plan acceptance criterion, but confirms the fuller closure); all Task 3 acceptance-criteria greps and the full unit suite pass unchanged.
- **Committed in:** `2c38d21` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 — missing critical layering closure, not a plan-scope acceptance-criteria gap)
**Impact on plan:** Closes the same defect class (D-01/D-10, direct repository access from a route) the plan's own truths require closed for the whole file, using only files already in Task 3's declared scope. No architectural change, no new port, no scope creep beyond the file list the plan itself named for Task 3.

## Issues Encountered

**Session interruption and restart:** The first execution attempt was interrupted by a session rate-limit after ~11 tool calls, still in the reading/investigation phase (all required-reading files had been read; no code had been written and no commits existed). The coordinator restarted execution from the beginning per its own instructions. The worktree was already based on the latest `feature/phase-10-backend-refactoring` (through plan 10-09) at restart, so no fast-forward merge was needed this time (confirmed via `git merge-base --is-ancestor`).

**Fresh-worktree setup:** `node_modules` was absent (`yarn install`, ~67s) and the Prisma client had never been generated (`yarn db:generate`) — same pre-existing per-worktree prerequisite every plan since 10-02 has documented, not introduced by this plan.

**Per-task commit reconstruction:** Because the interrupted-then-restarted session wrote all three tasks' code changes to the shared files (`backup-service.ts`, `routes/backups.ts`, `backup-service.test.ts`) before any commit existed, a single merged commit would have violated this phase's established atomic-commit-per-task convention. Rather than accept that, the shared files were temporarily reduced to each task's exact scope (removing Task 2/3 content from the Task 1 commit point, then restoring it), with `yarn typecheck` and the relevant test files verified green at each of the three checkpoints before committing — see the "Commit-history note" under Task Commits above.

## User Setup Required

None - no external service configuration required. (Same fresh-worktree prerequisites as prior plans in this phase: `yarn install` and `yarn db:generate` must be run once per fresh worktree/checkout before `yarn typecheck` succeeds.)

## Next Phase Readiness
- D-01's route-layering rule now holds for **all** route files scouting flagged, and — unlike every prior plan in this phase — is now enforced by an automated fitness-function test (`layering.test.ts`'s routes case) rather than by convention alone. A route file that starts importing a repository, infrastructure module, job module, or `lib/db.js` fails the unit suite immediately.
- D-07's interface-every-infrastructure-dependency goal gained its second job-layer port instance: `BackupSchedulePort` (after `DockerExecutorPort`/`StackFilesystemPort`/`ResticExecutorPort`/etc. from earlier plans), proving the pattern extends cleanly from infrastructure adapters to a job facade.
- D-10's dead-cross-layer-reach cleanup closes the last four concrete violations found during this phase's scouting pass across all route files (`routes/backups.ts`'s two repositories, one infrastructure executor, one job module, database client, and `encrypt()` call).
- `BackupService`'s constructor now takes 9 positional parameters (`resticExecutor, backupRepo, stackRepo, settings, notificationService, filesystem, docker, broadcaster, schedulePort`) — any future plan constructing it directly (rather than through the file's own `backupService` singleton) needs to supply all nine; no default-value escape hatch was added since every existing test call site already constructs it with all-mock arguments.
- No blockers. `yarn typecheck` and `yarn workspace @docktor/server test:unit` (54 files, 946 passed + 2 todo) both exit zero on the full tree after all three tasks.
- Integration tests (`server/test/integration/`, 6 files) were not run in this worktree — no PostgreSQL instance is available in this sandboxed environment, consistent with every prior plan's precedent in this phase. `server/test/integration/` is confirmed unmodified by this plan's diff (`git diff --stat` against the pre-plan HEAD is empty for that directory).
- This plan closes out the route-layering wave (10-06 through 10-10) for the server. Per `10-CONTEXT.md`'s wave sequencing note, later plans in this phase (10-11 onward) build on domain expansion, job-kind formalization, and the event bus — areas independent of route-layering completeness but downstream of the clean application-service boundaries this wave established.

---
*Phase: 10-backend-architecture-refactor*
*Completed: 2026-09-24*

## Self-Check: PASSED

All 10 created/modified source and test files confirmed present on disk with the expected changes; all three task commits (`f18a053`, `96f9985`, `2c38d21`) confirmed present in `git log`; `git rev-list --count fe0428d..HEAD` = 3, matching the 3 task commits with no docs-only or uncommitted changes at self-check time (`git status --short` empty before this SUMMARY was written).
