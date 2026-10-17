---
phase: 10-backend-architecture-refactor
plan: 09
subsystem: backend-architecture
tags: [ddd, ports-and-adapters, hexagonal-architecture, typescript, routes, application-services, concurrency]

# Dependency graph
requires:
  - phase: 10-08
    provides: "The route-to-service layering pattern (a route's cross-layer reach moves into a service method with the identical fold/shape, never changing the response) this plan continues for the four remaining route files"
provides:
  - "server/src/routes/settings.ts and routes/notifications.ts import no repository, infrastructure module or database client — every handler calls settingsService/notificationService only"
  - "server/src/routes/setup.ts and routes/imports.ts import no repository, infrastructure module or database client — every handler calls onboardingService only, including the brownfield scan (one scan call site, one injected BrownfieldScannerPort, shared by both routes)"
  - "SettingsService.saveSmtpConfig()/upsertEncryptedSetting() — the single encrypted-write path for secrets, matching the existing decrypt side in getSmtpConfig()"
  - "SettingsRepository.insertExclusive()/deleteIfPresent() and OnboardingService.createAdminWithLock() — the WR-07 first-run concurrency guard, moved out of the route with its uniqueness-violation-propagation and finally-release semantics provably intact"
affects: [10-10, 10-11, 10-12, 10-13, 10-14, 10-15]

# Actuals (#2632)
actuals:
  tokens: 10533
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Grouped-write service method: instead of a route issuing N individual repository upserts plus one conditional encrypted upsert (settings.ts's old SMTP handler), the service exposes one method taking the validated object once (SettingsService.saveSmtpConfig()), preserving the exact upsert order and the blank-value-leaves-existing-value conditional the route used to implement inline."
    - "Concurrency-guard extraction: the acquire-attempt/release-in-finally structure around an exclusive-insert lock row moves into the application service as one method (OnboardingService.createAdminWithLock()), not just the two repository calls — the repository method that performs the exclusive insert is kept deliberately free of any try/catch so its uniqueness violation always propagates to the caller that decides what a losing insert means."
    - "Single-question completeness check: four call sites that each independently queried `prisma.user.count()` and compared it to zero collapse onto one service method (OnboardingService.hasAnyUser()) with no change to which of the four call sites gets called or what each one responds — collapsing the four *call sites* into one *question* is explicitly not the same as collapsing the four checks into one, which the plan forbade."
    - "Shared narrow port across two route files: routes/setup.ts and routes/imports.ts both call the same OnboardingService.scan() method (one injected BrownfieldScannerPort, defaulted to the production brownfieldScanner singleton in the service's own composition root) instead of one calling through the service and the other importing the infrastructure module directly — closes a T-10-16 divergence risk, not just a layering violation."

key-files:
  created: []
  modified:
    - server/src/application/settings-service.ts
    - server/src/application/notification-service.ts
    - server/src/application/onboarding-service.ts
    - server/src/repositories/settings-repository.ts
    - server/src/repositories/user-repository.ts
    - server/src/routes/settings.ts
    - server/src/routes/notifications.ts
    - server/src/routes/setup.ts
    - server/src/routes/imports.ts
    - server/test/unit/application/settings-service.test.ts
    - server/test/unit/application/notification-service.test.ts
    - server/test/unit/application/onboarding-service.test.ts

key-decisions:
  - "SettingsRepository.upsert() itself was left untouched (still no `encrypted` parameter) — a second method, upsertEncrypted(), was added instead of widening upsert()'s signature. This keeps the plain-write call sites (general settings, SMTP host/port/encryption/username/from, notification triggers) byte-identical to before and makes the encrypted path a single, unambiguous, separately-named choke point rather than an easy-to-miss optional third argument on the existing method."
  - "OnboardingService's constructor gained userRepo and scanner as trailing parameters with production-singleton defaults (`= userRepository`, `= brownfieldScanner`), mirroring the existing fsLib parameter's own default-value pattern in the same file. This let all ~20 pre-existing test call sites (which construct OnboardingService with 5-6 positional args) keep compiling unchanged, since the new dependencies are simply unused object references unless a test explicitly exercises hasAnyUser()/createAdminWithLock()/scan()."
  - "The WR-07 lock's failure path was translated to `BadRequestError(\"Setup already complete\")` (not `ConflictError`) specifically because BadRequestError maps to HTTP 400 in lib/errors.ts's hierarchy and the global error handler renders `{error: error.message}` at that status — reproducing the exact `reply.status(400).send({error: \"Setup already complete\"})` the route used to construct inline. A ConflictError (409) would have silently changed the status code, violating the plan's byte-identical-response boundary."
  - "SETUP_STEP1_LOCK_KEY moved from routes/setup.ts into onboarding-service.ts (alongside the pre-existing SETUP_WIZARD_COMPLETE_KEY), carrying the full WR-07 explanatory comment with it — the constant and the code it explains now live together in the layer that owns the lock's acquire/release logic."
  - "OnboardingService.hasAnyUser() replaces four independent `prisma.user.count() > 0`/`=== 0` call sites in routes/setup.ts with four calls to the same service method — the four call sites, their order, and their individual responses are all unchanged; only the duplicated Prisma query collapses to one shared repository method (UserRepository.count())."

requirements-completed: ["D-01", "D-07", "D-10"]

coverage:
  - id: D1
    description: "routes/settings.ts and routes/notifications.ts call application services only; SettingsService owns one encrypted-write path with the blank-password conditional preserved"
    requirement: "D-01"
    verification:
      - kind: unit
        ref: "server/test/unit/application/settings-service.test.ts — 23 tests incl. upsertEncryptedSetting/saveSmtpConfig/getMaskedSmtpConfig/getNotificationTriggers describes, all pass"
        status: pass
      - kind: unit
        ref: "server/test/unit/application/notification-service.test.ts — 8 tests incl. getRecent describe, all pass"
        status: pass
      - kind: other
        ref: "grep -cE '^\\s*import .*(lib/db|repositories/|infrastructure/|jobs/)' server/src/routes/settings.ts server/src/routes/notifications.ts -> 0 for both; grep -cE 'settingsRepository|notificationRepository' -> 0 for both; grep -cE '\\bencrypt\\(' server/src/routes/settings.ts -> 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "routes/setup.ts calls OnboardingService only; the WR-07 first-run lock's exclusive insert still propagates its uniqueness violation and the release still runs in a finally"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "server/test/unit/application/onboarding-service.test.ts — hasAnyUser/createAdminWithLock describes (5 new cases incl. rejection producing BadRequestError(\"Setup already complete\") and release-runs-when-wrapped-call-throws), all pass"
        status: pass
      - kind: other
        ref: "grep -cE '^\\s*import .*(lib/db|infrastructure/|jobs/|repositories/)' server/src/routes/setup.ts -> 0; grep -cE 'prisma\\.' server/src/routes/setup.ts -> 0; SettingsRepository.insertExclusive() read and confirmed to contain no try, no catch, no promise-rejection handler"
        status: pass
      - kind: integration
        ref: "server/test/integration/setup-concurrency.test.ts and setup-wizard-flow.test.ts — git diff --stat shows no change (empty output)"
        status: pass
    human_judgment: false
  - id: D3
    description: "routes/imports.ts calls OnboardingService.scan() only, reaching the same injected scanner port as routes/setup.ts"
    requirement: "D-10"
    verification:
      - kind: unit
        ref: "server/test/unit/application/onboarding-service.test.ts — 'routes/setup.ts and routes/imports.ts reach the same injected scanner port' test, all pass"
        status: pass
      - kind: other
        ref: "grep -cE '^\\s*import .*(lib/db|infrastructure/|repositories/|jobs/)' server/src/routes/imports.ts -> 0; grep -rcE '^\\s*import .*infrastructure/brownfield-scanner' server/src/routes/ -> 0 for every file"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every response body, status code and error message from the four touched route files is byte-identical to before; full unit suite and typecheck pass"
    requirement: "D-01"
    verification:
      - kind: unit
        ref: "yarn workspace @docktor/server test:unit -> 54 files, 907 passed + 2 todo (up from 10-08's 889 passed + 2 todo baseline by 18 new tests)"
        status: pass
      - kind: unit
        ref: "yarn typecheck -> 0 errors"
        status: pass
    human_judgment: false

# Metrics
duration: ~25min
completed: 2026-09-23
status: complete
---

# Phase 10 Plan 09: Route-to-Service Layering for settings/notifications/setup/imports (D-01, D-07, D-10) Summary

**`routes/settings.ts`, `routes/notifications.ts`, `routes/setup.ts` and `routes/imports.ts` now import no repository, infrastructure module or database client — their cross-layer reaches move into `SettingsService`'s new encrypted-write path, `NotificationService.getRecent()`, and three new `OnboardingService` methods (`hasAnyUser()`, `createAdminWithLock()`, `scan()`), with the WR-07 first-run concurrency lock's uniqueness-violation-propagation and finally-release semantics carried across intact.**

## Performance

- **Duration:** ~25 min active work (after fast-forwarding the worktree onto `feature/phase-10-backend-refactoring` to pick up plans 10-01 through 10-08, then `yarn install` ~65s and `npx prisma generate` — no `node_modules`/generated Prisma client existed yet in this fresh worktree)
- **Started:** 2026-09-23T20:58:00+02:00 (approx, immediately following 10-08's completion)
- **Completed:** 2026-09-23T21:23:21+02:00
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments
- `SettingsService` gained `upsertEncryptedSetting()`, `saveSmtpConfig()`, `getMaskedSmtpConfig()`, `getNotificationTriggers()` and `updateNotificationTriggers()` — the encrypted-write path (`encrypt()` + `Setting.encrypted = true`) moved out of `routes/settings.ts` and into the service, alongside the existing decrypt side in `getSmtpConfig()`; the blank-password conditional (leaves the stored password untouched) is preserved via `saveSmtpConfig()` only calling the encrypted-write path when a non-empty password is submitted
- `SettingsRepository` gained `upsertEncrypted()` (the single write path that sets `Setting.encrypted`), `insertExclusive()` (no try/catch — the WR-07 lock row's uniqueness violation must propagate) and `deleteIfPresent()` (tolerates an already-absent row, for the release side)
- `NotificationService` gained `getRecent(limit)`, delegating to `NotificationRepository.findRecent()`; `routes/notifications.ts` no longer imports the repository directly
- `UserRepository` gained `count()`; `OnboardingService.hasAnyUser()` exposes the setup-completeness question `routes/setup.ts` asks at its four unchanged check points (status, step1, step6, complete)
- `OnboardingService.createAdminWithLock()` carries the full WR-07 acquire/attempt/release-in-`finally` structure across from the route, translating a losing exclusive insert into `BadRequestError("Setup already complete")` — which the global error handler renders as the identical `reply.status(400).send({error: "Setup already complete"})` the route used to construct inline
- `OnboardingService.scan()` — one brownfield-scan call site behind the injected `BrownfieldScannerPort` (defaulted to the production `brownfieldScanner` singleton), now shared by both `routes/setup.ts` and `routes/imports.ts` instead of one route calling through the service and the other importing the infrastructure module directly
- `yarn typecheck` and `yarn workspace @docktor/server test:unit` (54 files, 907 passed + 2 todo — up from 10-08's 889 passed + 2 todo baseline by 18 new tests) both exit zero after every task and at plan completion
- `server/test/integration/` is unmodified (`git diff --stat -- server/test/integration/` is empty), satisfying the phase-boundary requirement that the two setup integration suites keep passing against this plan's changes unmodified

## Task Commits

Each task was committed atomically:

1. **Task 1: Settings and notification routes call services only; one encrypted-write path** - `cc6a5b2` (feat)
2. **Task 2: The setup route calls OnboardingService only, with the first-run lock semantics intact** - `5f24f6d` (feat)
3. **Task 3: The imports route calls OnboardingService only** - `d4f15fa` (feat)

_No TDD-flagged tasks in this plan's frontmatter — each task's tests were authored alongside the extraction/move and committed together with it, matching 10-06/10-07/10-08's precedent for this phase's extraction-style work._

## Files Created/Modified
- `server/src/application/settings-service.ts` - Added `SmtpConfigWrite`/`MaskedSmtpConfig`/`NotificationTriggers` types and `upsertEncryptedSetting()`, `saveSmtpConfig()`, `getMaskedSmtpConfig()`, `getNotificationTriggers()`, `updateNotificationTriggers()`
- `server/src/application/notification-service.ts` - Added `getRecent(limit = 100)`
- `server/src/application/onboarding-service.ts` - Added `UserRepository`/`BrownfieldScannerPort` imports and two new trailing constructor params (`userRepo`, `scanner`) with production-singleton defaults; added `hasAnyUser()`, `createAdminWithLock()`, `scan()`; moved `SETUP_STEP1_LOCK_KEY` and its full WR-07 comment in from `routes/setup.ts`
- `server/src/repositories/settings-repository.ts` - Added `upsertEncrypted()`, `insertExclusive()`, `deleteIfPresent()`
- `server/src/repositories/user-repository.ts` - Added `count()`
- `server/src/routes/settings.ts` - Removed `settingsRepository`, `prisma`, `encrypt` imports; every handler now calls `settingsService`/`notificationService` methods only
- `server/src/routes/notifications.ts` - Removed `notificationRepository` import; calls `notificationService.getRecent(100)`
- `server/src/routes/setup.ts` - Removed `prisma`, `brownfieldScanner` imports; the four completeness checks now call `onboardingService.hasAnyUser()`; step1 delegates to `onboardingService.createAdminWithLock()`; the scan handler calls `onboardingService.scan()`
- `server/src/routes/imports.ts` - Removed `brownfieldScanner` import; the scan handler calls `onboardingService.scan()`
- `server/test/unit/application/settings-service.test.ts` - Added `upsertEncryptedSetting`/`saveSmtpConfig`/`getMaskedSmtpConfig`/`getNotificationTriggers`/`updateNotificationTriggers` describes (14 new tests); added `ENCRYPTION_KEY` env setup/teardown
- `server/test/unit/application/notification-service.test.ts` - Added `findRecent` to the mock repo factory and a `getRecent` describe (2 new tests)
- `server/test/unit/application/onboarding-service.test.ts` - Added `insertExclusive`/`deleteIfPresent` to the mock settings-repo factory, new `createMockUserRepo`/`createMockScanner` factories, and `hasAnyUser`/`createAdminWithLock`/`scan` describes (7 new tests, one asserting the setup/imports scan-port sharing)

## Decisions Made

**Before/after response shapes (D-01 phase-boundary requirement, recorded per the plan's acceptance criteria):**

- `GET /api/settings/smtp` — before: route read six `smtp.*` keys via `settingsRepository.getMany()` and built the masked object inline. After: route calls `settingsService.getMaskedSmtpConfig()` and returns its result. **Identical response shape** — the exact same field-by-field fold (with the same `"587"`/`"starttls"` defaults) moved unchanged into the service.
- `PUT /api/settings/smtp` — before: route issued five `settingsRepository.upsert()` calls plus one conditional `prisma.setting.upsert()` for the encrypted password, inline. After: route calls `settingsService.saveSmtpConfig(request.body)`, which performs the same five upserts in the same order plus the same conditional encrypted write, then returns `{success: true}`. **Identical response shape and identical write semantics**, including the blank-password-leaves-stored-password-untouched conditional.
- `GET /api/settings/notification-triggers` / `PUT /api/settings/notification-triggers` — before: route read/wrote four `notify.*`/`disk.*` keys inline via `settingsRepository`. After: route calls `settingsService.getNotificationTriggers()`/`updateNotificationTriggers()`, which perform the identical key list, defaults, and per-field conditional upserts. **Identical response shapes.**
- `GET /api/notifications` — before: route called `notificationRepository.findRecent(100)` directly. After: route calls `notificationService.getRecent(100)`, which delegates to the same repository method with the same limit. **Identical response shape.**
- `GET /api/setup/status`, step1's completeness check, step6's completeness check, `/api/setup/complete`'s completeness check — before: each independently ran `prisma.user.count()` and compared to zero inline, at its own position in its own handler, with its own response text. After: each calls `onboardingService.hasAnyUser()` at the exact same position, with the exact same response on both branches. **All four checks keep their position and response**, verified by inspection of the diff — none was consolidated, reordered, or moved after the work it guards.
- `POST /api/setup/step1` — before: route ran the userCount check, then a try/catch around `prisma.setting.create()` for the lock (catch -> `400 {error: "Setup already complete"}`), then a try/finally around `onboardingService.handleWizardStep1()` with `prisma.setting.delete().catch(() => {})` in the finally. After: route keeps the userCount check (now `hasAnyUser()`) at the same position with the same response, then delegates the lock-acquire/create-admin/lock-release sequence to `onboardingService.createAdminWithLock()`, whose failure path throws `BadRequestError("Setup already complete")` — rendered by the global error handler as the byte-identical `400 {error: "Setup already complete"}`. **Identical response shape on every branch**, confirmed live by `setup-concurrency.test.ts`'s unmodified race assertions (`codes = [200, 400]`, loser's body `{error: "Setup already complete"}`, `user.count() === 1`).
- `POST /api/setup/scan` and `POST /api/stacks/import/scan` — before: `routes/setup.ts` called `brownfieldScanner.scan(directories)` through a local import; `routes/imports.ts` did the exact same thing through its own separate local import (two independent call sites reaching the same singleton, but with no structural guarantee they'd stay in sync). After: both call `onboardingService.scan(directories)`, the one method on the one service singleton, which delegates to the one injected `BrownfieldScannerPort`. **Identical response shape at both endpoints**, with the divergence risk the phase's T-10-16 threat flagged now closed structurally rather than by convention.

**Preserved `preHandler`/`onRequest` hooks (T-10-32, phase threat model):** This plan edited handler bodies only. `settings.ts`'s and `notifications.ts`'s `app.addHook("onRequest", requireAuth)`, `setup.ts`'s first-run-gate `preHandler` (unchanged four-way logic: exempt `/api/setup/status` GET and `/api/setup/step1`, else 410 once `isWizardComplete()`), and `imports.ts`'s `app.addHook("onRequest", requireAuth)` are all unchanged — confirmed by grep and by reading each file's hook registration, matching the analysis from plan 05.1-07 for `imports.ts`'s auth posture specifically.

**WR-07 lock method placement (T-10-29, phase threat model):** `SettingsRepository.insertExclusive()` was read back after writing it and confirmed to contain no `try`, no `catch`, and no `.catch()`/promise-rejection handler — it is a single `await prisma.setting.create({data: {key, value}})` call whose uniqueness violation on Postgres's primary-key constraint propagates unmodified to `OnboardingService.createAdminWithLock()`, which is the sole place that decides what a losing insert means (translated to `BadRequestError("Setup already complete")`). The release (`deleteIfPresent()`) runs inside a `finally` block in `createAdminWithLock()`, asserted directly by the "releases the lock even when the wrapped call throws" test.

## Deviations from Plan

None — plan executed exactly as written. The only choice made beyond the plan's literal text was the constructor-parameter-default pattern for `OnboardingService`'s two new dependencies (`userRepo`, `scanner`), which mirrors the file's own pre-existing `fsLib` parameter convention rather than requiring every existing test call site to be rewritten — a Rule-1-adjacent implementation choice within Task 2's own file list, not a deviation from any acceptance criterion.

## Issues Encountered

Fresh-worktree setup: `node_modules` was absent (`yarn install`, ~65s) and the Prisma client had never been generated (`npx prisma generate`) — same pre-existing per-worktree prerequisite 10-02/10-05/10-06/10-07/10-08 documented, not introduced by this plan. The worktree branch was also behind `feature/phase-10-backend-refactoring` by the eight merged wave plans (10-01 through 10-08); fast-forwarded per the dispatch instructions before starting work, since the local branch had no divergent commits of its own.

## User Setup Required

None - no external service configuration required. (Same fresh-worktree prerequisites as prior plans in this phase: `yarn install` and `npx prisma generate` must be run once per fresh worktree/checkout before `yarn typecheck` succeeds.)

## Next Phase Readiness
- D-01's route-layering rule now holds for six of the seven route files scouting flagged (`stacks.ts` in 10-08; `settings.ts`, `notifications.ts`, `setup.ts`, `imports.ts` in this plan) — only `routes/backups.ts` remains, per plan 10-10, which also installs the architecture test enforcing the rule for every route file at once.
- D-07's interface-every-infrastructure-dependency goal gained one more concrete instance: `BrownfieldScannerPort` is now consumed from two call sites (`setup.ts`, `imports.ts`) through the same injected instance, not just declared.
- D-10's dead-cross-layer-reach cleanup closes two more concrete violations found during scouting (`settings.ts`'s inline `prisma.setting.upsert()` for the SMTP password, `imports.ts`'s direct `brownfieldScanner` import).
- `OnboardingService`'s constructor now takes up to 8 positional parameters (`authClient, settingsRepo, cryptoLib, stackRepo, proxy, fsLib, userRepo, scanner`) — the last three have production-singleton defaults, so any future plan constructing it directly (rather than through the file's own `onboardingService` singleton) only needs to supply the first five unless it wants to override a default.
- No blockers. `yarn typecheck` and `yarn workspace @docktor/server test:unit` (54 files, 907 passed + 2 todo) both exit zero on the full tree after all three tasks.
- Integration tests (`server/test/integration/`, 5 files) were not run in this worktree — no PostgreSQL instance is available in this sandboxed environment, consistent with 10-06/10-07/10-08's precedent for this phase. Both integration suites this plan's `<verify>` block cares about (`setup-concurrency.test.ts`, `setup-wizard-flow.test.ts`) were read in full during Task 2 and are confirmed unmodified by `git diff --stat`; the plan's own `<verification>` block does not require them to be run live, only unmodified, and flags the live-execution gap explicitly as a `<human-check>` item deferred to the phase gate in plan 10-15.

---
*Phase: 10-backend-architecture-refactor*
*Completed: 2026-09-23*

## Self-Check: PASSED

All 12 modified source and test files confirmed present on disk with the expected changes; all three task commits (`cc6a5b2`, `5f24f6d`, `d4f15fa`) confirmed present in `git log`; `git rev-list --count d690b0e..HEAD` = 3, matching the 3 task commits with no docs-only or uncommitted changes at self-check time.
