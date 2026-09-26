---
phase: 10-backend-architecture-refactor
plan: 01
subsystem: backend-architecture
tags: [ddd, ports-and-adapters, repository-pattern, dependency-injection, prisma, nodemailer, vitest]

# Dependency graph
requires: []
provides:
  - "server/src/repositories/index.ts — the single source of repository singletons for the composition root (D-09)"
  - "server/src/application/ports/ — the ports directory every later plan in this phase joins (PD-1)"
  - "server/test/unit/architecture/layering.test.ts — table-driven architecture fitness test later plans (10-05, 10-07, 10-10, 10-13, 10-14) append rule cases to"
  - "NotificationService with no infrastructure or data-access imports of its own — the phase's proven tracer slice"
affects: [10-02, 10-05, 10-07, 10-10, 10-13, 10-14]

# Actuals (#2632)
actuals:
  tokens: 7330
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Named port interface declared in the consuming application-layer module (UserReadPort, SmtpClientPort), concrete adapter in infrastructure/ implementing it"
    - "repositories/index.ts as a flat, no-DI-container composition file mirroring application/index.ts's shape one layer down"
    - "Data-driven architecture fitness test reading source files from disk via node:fs, line-anchored import regex, no module imports of the code under test"

key-files:
  created:
    - server/src/repositories/user-repository.ts
    - server/src/repositories/index.ts
    - server/src/application/ports/smtp-client-port.ts
    - server/src/infrastructure/smtp-client.ts
    - server/test/unit/architecture/layering.test.ts
    - server/test/unit/repositories/index.test.ts
    - server/test/unit/infrastructure/smtp-client.test.ts
  modified:
    - server/src/application/notification-service.ts
    - server/src/application/index.ts
    - server/src/repositories/settings-repository.ts
    - server/test/unit/application/notification-service.test.ts

key-decisions:
  - "SmtpClientPort.sendMail(config, message) takes the full SmtpConfig plus a message shape, covering both notify() and testSmtp() so they cannot diverge onto two transport paths (per plan prohibition)"
  - "settingsRepository singleton added directly to settings-repository.ts (matching the other 6 repos' bottom-of-file convention) rather than only in repositories/index.ts, so index.ts stays a pure re-export list with no exceptions"
  - "application/index.ts keeps exporting settingsRepository (and the local repo/certificateRepositoryInstance aliases) under their original names, now pointing at repositories/index.ts's singletons, so routes/backups.ts and routes/settings.ts (out of this plan's scope, PD-4 defers route fixes to waves 5-7) needed zero changes"

patterns-established:
  - "Read port declared immediately above the consuming service class, doc-commented with the 'why a port, not the concrete class' rationale — copied from StackEventReadRepo, now has two instances (UserReadPort, SmtpClientPort) for later plans to match"
  - "Architecture fitness test as a RULES table of {describeName, files, itName, forbidden[]} — later plans append entries instead of writing new test files"

requirements-completed: [D-01, D-05, D-07, D-09, D-10]

coverage:
  - id: D1
    description: "NotificationService resolves recipient emails through UserReadPort -> UserRepository -> Prisma instead of an inline prisma.user.findMany() call (D-10)"
    requirement: "D-10"
    verification:
      - kind: unit
        ref: "server/test/unit/application/notification-service.test.ts#sends email when SMTP is configured"
        status: pass
      - kind: unit
        ref: "server/test/unit/architecture/layering.test.ts#application/notification-service.ts has no top-level import of lib/db.js"
        status: pass
    human_judgment: false
  - id: D2
    description: "NotificationService sends mail through SmtpClientPort (constructor-injected) instead of importing nodemailer itself; SmtpClient adapter implements the port and never logs the SMTP config (D-07, T-10-01)"
    requirement: "D-07"
    verification:
      - kind: unit
        ref: "server/test/unit/application/notification-service.test.ts#testSmtp > sends test email"
        status: pass
      - kind: unit
        ref: "server/test/unit/infrastructure/smtp-client.test.ts#never lets the decrypted password reach any console method (T-10-01)"
        status: pass
      - kind: unit
        ref: "server/test/unit/architecture/layering.test.ts#application/notification-service.ts has no top-level import of nodemailer"
        status: pass
    human_judgment: false
  - id: D3
    description: "repositories/index.ts publishes exactly one singleton per repository class; application/index.ts obtains every repository from it instead of constructing with new (D-09)"
    requirement: "D-09"
    verification:
      - kind: unit
        ref: "server/test/unit/repositories/index.test.ts#<name> is reference-identical to the singleton exported by its own module (9 cases)"
        status: pass
      - kind: unit
        ref: "server/test/unit/architecture/layering.test.ts#repositories/index.ts re-exports a singleton from <file> (8 cases)"
        status: pass
    human_judgment: false
  - id: D4
    description: "An automated architecture fitness test fails a run when application/ imports lib/db.js or nodemailer, or domain/ imports lib/db.js/infrastructure/repositories (D-01)"
    requirement: "D-01"
    verification:
      - kind: unit
        ref: "server/test/unit/architecture/layering.test.ts (32 tests, full RULES table)"
        status: pass
      - kind: other
        ref: "one-off local check: injected a top-level lib/db.js import into notification-service.ts, confirmed layering.test.ts failed with a self-diagnosing message, reverted (git diff confirmed byte-identical after revert)"
        status: pass
    human_judgment: false

duration: 22min
completed: 2026-09-23
status: complete
---

# Phase 10 Plan 01: Notification Layering Tracer Summary

**NotificationService rewired off Prisma and nodemailer onto UserReadPort/SmtpClientPort, repositories/index.ts established as the single repository-singleton source, and a data-driven architecture fitness test now fails a build on a layering regression.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-09-23T08:44:00Z (approx, first file read)
- **Completed:** 2026-09-23T09:06:48Z
- **Tasks:** 3
- **Files modified:** 11 (7 created, 4 modified)

## Accomplishments
- Wired the "notify a user" path end-to-end through composition root -> application service -> `UserReadPort` -> `userRepository` -> Prisma, replacing `notification-service.ts`'s direct `prisma.user.findMany()` call (D-10)
- Created `server/src/repositories/index.ts`, the single published source of all nine repository singletons; `application/index.ts` now imports every repository instead of constructing one with `new` (D-09)
- Put the SMTP mail transport behind `SmtpClientPort` (declared in the new `application/ports/` directory) and `infrastructure/smtp-client.ts` (D-07); `nodemailer` is now imported in exactly one file in `server/src/`
- Added `server/test/unit/architecture/layering.test.ts`, a table-driven fitness test that reads the source tree from disk and fails when application/domain/repositories layering rules are violated — verified live by injecting and reverting a deliberate violation

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "notify a user" through repositories/index.ts and a repository port** - `2776eb1` (feat)
2. **Task 2: Put the mail transport behind a named port and an infrastructure adapter** - `d0a23ff` (feat)
3. **Task 3: Add the architecture fitness test that makes a layering regression fail a test run** - `9f64b1f` (test)

_No TDD tasks in this plan — single commit per task._

## Files Created/Modified
- `server/src/repositories/user-repository.ts` - `UserRepository.findAllEmails()`, thin Prisma wrapper, `userRepository` singleton
- `server/src/repositories/index.ts` - Flat re-export of all nine repository singletons; the composition root's single repository source
- `server/src/repositories/settings-repository.ts` - Added `settingsRepository` singleton export (the one repo that had none)
- `server/src/application/notification-service.ts` - Gained `UserReadPort` and `SmtpClientPort` constructor params; dropped the `prisma` import, the `nodemailer` import, and the private `createTransport()` helper
- `server/src/application/index.ts` - Every repository now imported from `repositories/index.js`; `smtpClient` wired into `NotificationService`
- `server/src/application/ports/smtp-client-port.ts` - `SmtpClientPort` interface (PD-1's first file in the ports directory)
- `server/src/infrastructure/smtp-client.ts` - `SmtpClient implements SmtpClientPort`, the transport-construction logic moved out of the service, never logs the config object
- `server/test/unit/application/notification-service.test.ts` - Updated for the new 5-arg constructor; fake `UserReadPort`/`SmtpClientPort` doubles replace the Prisma and nodemailer module mocks
- `server/test/unit/architecture/layering.test.ts` - New architecture fitness test, RULES table with 4 entries this plan populates
- `server/test/unit/repositories/index.test.ts` - New; asserts every `repositories/index.ts` export is reference-identical to its own module's singleton
- `server/test/unit/infrastructure/smtp-client.test.ts` - New; covers transport-option branches and the T-10-01 password-never-logged assertion

## Decisions Made
- `SmtpClientPort.sendMail(config, message)` takes the full `SmtpConfig` on every call (not just once at construction) so both `notify()` and `testSmtp()` route through the identical operation shape — matches the plan's explicit prohibition against the port being shaped around one caller's convenience.
- `settingsRepository`'s singleton was added directly inside `settings-repository.ts` rather than only inside `repositories/index.ts`, keeping the "one instance per repository, published from its own module, re-exported by index.ts" rule exception-free — `repositories/index.ts` never itself calls `new`.
- Kept `application/index.ts`'s public export names (`settingsRepository`, local `repo`/`certificateRepositoryInstance` aliases) unchanged so `routes/backups.ts` and `routes/settings.ts` (out of this plan's scope; route layering fixes are PD-4's waves 5-7) required zero edits.

## Deviations from Plan

None - plan executed exactly as written. All three tasks, their acceptance criteria, and the plan's own `<verification>`/`<success_criteria>` sections were satisfied without needing a Rule 1-4 deviation.

## Issues Encountered

None. The pre-existing unused `decrypt` import in `notification-service.ts` was left untouched — it predates this plan, is not caused by this plan's changes, and `noUnusedLocals` is not enabled in `server/tsconfig.json`, so it does not fail typecheck; fixing it is out of this plan's scope (CLAUDE.md's scope-boundary rule: only auto-fix issues directly caused by the current task's changes).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `server/src/application/ports/` and `server/src/repositories/index.ts` are established conventions; wave 2 (plan 10-02) extends both for `DockerExecutor`, `StackFilesystem`, `ResticExecutor`, `DockerodeClient` per D-07/PD-2.
- `server/test/unit/architecture/layering.test.ts`'s RULES table is ready for 10-05 (infrastructure-port rule), 10-07 (jobs rule), 10-10 (routes rule), 10-13 (audit single-writer rule), and 10-14 (deleted-directory rule) to append cases to.
- No blockers. `yarn workspace @docktor/server test:unit` (48 files, 777 passed, 2 pre-existing todo) and `yarn typecheck` both exit zero on the full tree, confirming no regression outside this plan's scope.

---
*Phase: 10-backend-architecture-refactor*
*Completed: 2026-09-23*

## Self-Check: PASSED

All 7 created/modified source files and the SUMMARY.md itself confirmed present on disk; all 3 task commits (`2776eb1`, `d0a23ff`, `9f64b1f`) confirmed present in git history.
