---
phase: 18-import-and-migration-flow
plan: 16
subsystem: api
tags: [sse, state-broadcaster, domain-events, migration, tdd, gap-closure]

requires:
  - phase: 18-import-and-migration-flow
    provides: "MigrationOperationService, migration-operation domain and the shared step enum (18-14); migrate execute steps incl. the in-place path (18-06, 18-12)"
provides:
  - "migration.progressed domain event and migration_progress StateEvent on GET /api/events carrying the full MigrationOperation"
  - "MigrationService.execute/migrate(…, onProgress?) step reporting with a listener-failure guard"
  - "recordMigrationStep domain function; MigrationOperationService stores and publishes every step"
affects: [18-17, client migration progress toast]

actuals:
  tokens: 30000
  tasks: 2
  commits: 4
plan_head_before: 35293df36a59c9eb9c9d72b195f66068f5b62a4a
commits: 4
plan_head_after: 4306d99da1dd9cfd3930598772b99660191dfe9a

tech-stack:
  added: []
  patterns:
    - "Single save() in the operation service stores and emits, so the published operation always equals what GET returns"
    - "Progress listener isolated with try/catch at the reporting site; a listener is never part of the migration outcome"

key-files:
  created: []
  modified:
    - server/src/domain/events.ts
    - server/src/lib/state-broadcaster.ts
    - server/src/application/subscribers/state-broadcast-subscriber.ts
    - server/src/application/migration-operation-service.ts
    - server/src/application/migration-service.ts
    - server/src/domain/migration-operation.ts
    - server/test/unit/application/state-broadcast-subscriber.test.ts
    - server/test/unit/application/migration-operation-service.test.ts
    - server/test/unit/application/migration-service.test.ts
    - server/test/unit/domain/migration-operation.test.ts

key-decisions:
  - "Operation service takes the event bus as a trailing constructor parameter defaulting to domainEventBus, so 18-14 call sites keep compiling"
  - "Rolling back is reported as the first statement of the catch, so the last reported step of a failed run is rolling_back"
  - "copying_bind_mount detail is the selection's originalPath (e.g. ./data); copying_named_volume detail is the volume name"

patterns-established:
  - "Subscriber maps nested result objects field by field (mapMigrationResult), omitting undefined optionals, never spreading"

requirements-completed: [MIG-04]

duration: 25min
completed: 2026-10-16
status: complete
---

# Phase 18 Plan 16: Migration Progress over SSE Summary

**Every migration state change (start, each step with volume or path detail, finish) is published on GET /api/events as `{type: "migration_progress", operation}` through the domain-event bus and StateBroadcaster, with listener failures isolated from the migration and its rollback.**

## Performance

- **Duration:** about 25 min
- **Started:** 2026-10-16T10:15:00Z
- **Completed:** 2026-10-16T10:41:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Added the `migration.progressed` domain event and the `migration_progress` StateEvent; the state-broadcast subscriber maps every operation and result field explicitly (including `keptOriginalAt`).
- `MigrationService.execute(plan, onProgress?)` and `migrate(input, onProgress?)` report stopping_old_stack, moving_original_aside (in place), creating_directory, backing_up (separate migrations only), copying_named_volume / copying_bind_mount with detail, writing_compose, recording_stack, deploying, and rolling_back on failure.
- `MigrationOperationService` saves and emits via one `save()`, records each reported step with `recordMigrationStep`, and emits nothing for a preflight refusal.

## Task Commits

1. **Task 1: tracer, operation start/finish reaches the SSE channel** - `6e2b5de` (test, RED), `6226462` (feat, GREEN)
2. **Task 2: step reporting recorded and published** - `635e7af` (test, RED), `4306d99` (feat, GREEN)

**Plan metadata:** committed as `docs(18-16): complete migration progress SSE plan` (follows this file).

## TDD Gate Compliance

- Task 1 RED: the new subscriber tests (2) and operation-service emit tests (2) failed on assertions (`publish`/`emit` called 0 times) before any implementation; the disposer and preflight-refusal tests passed trivially by design. Semantic assessment: failures were the planned assertions, not load or syntax faults.
- Task 2 RED: 9 tests failed on the planned assertions (listener never called, `recordMigrationStep` missing, no step events emitted); the test that a throwing listener cannot disturb a failing run passed before GREEN because no listener was invoked yet, and remains as a regression guard.
- GREEN/REFACTOR: both GREEN commits follow their RED commits; no separate refactor commit was needed.

## Files Created/Modified

- `server/src/domain/events.ts` - `MigrationProgressedEvent` and the `migration.progressed` key.
- `server/src/lib/state-broadcaster.ts` - `MigrationProgressEvent` in the `StateEvent` union.
- `server/src/application/subscribers/state-broadcast-subscriber.ts` - explicit mapping of the new event plus `mapMigrationResult`.
- `server/src/application/migration-service.ts` - `MigrationProgressListener`, private `report`, step reports in `execute`/`copyBindMounts`.
- `server/src/domain/migration-operation.ts` - pure `recordMigrationStep`.
- `server/src/application/migration-operation-service.ts` - `events` constructor parameter, `save`, `recordStep`.
- Four unit test files covering the subscriber, both services and the domain function.

## Decisions Made

See key-decisions above; otherwise followed the plan as specified.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- First GREEN attempt for the subscriber did not apply because the disposer loop variable is `unsubscribe`, not `unsubscriber`; caught immediately by the still-failing RED tests and fixed before the commit.
- A `MigrationProgressListener` type was initially inserted between the `MigrationPlan` JSDoc and its interface; corrected before the commit.

## Verification

- Targeted unit run (migration-service, migration-operation domain and service, state-broadcast-subscriber, subscriber-registration, brownfield-routes, layering): 7 files, 337 tests passed.
- `cd server && corepack yarn tsc --noEmit -p .`: no errors.
- Full `tsc --build`, server integration tests and Playwright were not run locally (shared VPS rule); left for CI. No integration or E2E spec files were part of this plan.

## Self-Check: PASSED

- All ten modified files exist; commits 6e2b5de, 6226462, 635e7af, 4306d99 are ancestors of HEAD.
- Acceptance greps: `"migration.progressed"` x1 in events.ts, `migration_progress` present in the broadcaster and subscriber, `export type MigrationProgressListener` x1, 10 step-literal matches in migration-service.ts, `export function recordMigrationStep` x1, `this.migrations.execute(plan, ` x1, no `...payload` in the subscriber.

## Threat Flags

None. T-18-44 (accepted) and T-18-45 (mitigated by `report` try/catch, covered by tests) match the plan's register; the operation never carries `.env` content.

## Known Stubs

None.

## Next Phase Readiness

Plan 18-17 can consume `{type: "migration_progress", operation: MigrationOperation}` frames from GET /api/events; the payload equals the `GET .../migrations/:operationId` shape.

---
*Phase: 18-import-and-migration-flow*
*Completed: 2026-10-16*
