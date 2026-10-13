---
phase: 14-health-uptime-and-disk-visibility
plan: 01
subsystem: api
tags: [prisma, fastify, domain-events, docker-healthcheck, zod]

requires:
  - phase: 10-backend-architecture-refactor
    provides: domain event bus, subscriber registration, repository singleton barrel, layering test
provides:
  - ServiceHealthEvent table + HealthSource enum, keyed by (stackId, serviceName) with no FK to Service
  - service.health_changed domain event emitted by StatePoller.handleEvent after the Service row write
  - single-writer history subscriber (subscribeServiceHealthHistory)
  - GET /api/stacks/:id/health-events (requireAuth, shared query schema)
  - pure domain helpers normalizeHealth / isHealthTransition / HealthSourceName
affects: [14-03 health client, 14-06 http probes, 14-11 stable health state, 14-12 incident tracking/pruning]

actuals:
  tokens: 8600
  tasks: 1
  commits: 1
plan_head_before: 2b96ad0e7123c616b421039d9f26ea11c116c087
plan_head_after: 0791aacfac2b37c6d359981dba4ebf6e20999bd7

tech-stack:
  added: []
  patterns:
    - "Producer -> domain event -> single-writer subscriber for a retained history table (write-before-emit)"
    - "History keyed by natural key (stackId, serviceName) instead of an FK to rows that deploys recreate"

key-files:
  created:
    - server/prisma/schema/service-health-event.prisma
    - server/prisma/migrations/20261008073041_add_service_health_events/migration.sql
    - shared/src/validation/health.ts
    - server/src/domain/service-health.ts
    - server/src/repositories/service-health-event-repository.ts
    - server/src/application/subscribers/service-health-history-subscriber.ts
    - server/src/application/service-health-history-service.ts
    - server/src/routes/health.ts
    - server/test/integration/health.test.ts
  modified:
    - server/prisma/schema/stack.prisma
    - server/src/domain/events.ts
    - server/src/jobs/state-poller.ts
    - server/src/application/subscribers/register.ts
    - server/src/application/index.ts
    - server/src/repositories/index.ts
    - server/src/app.ts
    - shared/src/validation/index.ts

key-decisions:
  - "ServiceHealthEvent is keyed by (stackId, serviceName) with onDelete Cascade to Stack only; no serviceId and no FK to Service, so replaceServices cannot drop or orphan history (D-12 amended)"
  - "service.health_changed is emitted only when the Service row exists in the polled stack and the normalized health differs; emitted after updateServiceState and before the existing container_state_changed emit"
  - "Migration generated through Branch B (migrate diff from a HEAD-schema copy) because the dev database env file cannot be named in commands under this session's secret-read guard"

patterns-established:
  - "History subscriber catches and logs write failures with the stackId/serviceName pair so a bad write never rejects into the bus"

requirements-completed: ["#23"]

coverage:
  - id: D1
    description: "Docker-healthcheck transitions (including a clear to null) persist as ServiceHealthEvent rows keyed by (stackId, serviceName) and survive replaceServices"
    requirement: "#23"
    verification:
      - kind: integration
        ref: "server/test/integration/health.test.ts#keeps the history after replaceServices deletes and recreates the Service rows"
        status: pass
      - kind: unit
        ref: "server/test/unit/jobs/state-poller.test.ts#handleEvent — service.health_changed (#23, D-12)"
        status: pass
    human_judgment: false
  - id: D2
    description: "GET /api/stacks/:id/health-events returns newest-first per-service history with serviceName filter, limit 1-200, 404 for unknown stack, 401 without session, 400 for bad limit"
    requirement: "#23"
    verification:
      - kind: integration
        ref: "server/test/integration/health.test.ts"
        status: pass
      - kind: unit
        ref: "shared/test/unit/validation/health.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Write-before-emit and failure isolation: no event for unchanged health or a container without a Service row; a rejected history write is logged with stack/service and never rejects"
    requirement: "#23"
    verification:
      - kind: unit
        ref: "server/test/unit/application/service-health-history-subscriber.test.ts"
        status: pass
      - kind: unit
        ref: "server/test/unit/jobs/state-poller.test.ts#handleEvent — service.health_changed (#23, D-12)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Migration SQL applied to the dev database"
    requirement: "#23"
    verification: []
    human_judgment: true
    rationale: "Migration was generated but not applied to the dev database in this session (recorded in .planning/WINDOWS.md); the integration suite exercises the same schema via prisma db push, and syncDatabaseSchema() applies the migration at next boot"

duration: 7min
completed: 2026-10-08
status: complete
---

# Phase 14 Plan 01: Per-service Docker health history Summary

**Docker-healthcheck transitions are now a durable ServiceHealthEvent history keyed by (stackId, serviceName), fed by a new service.health_changed event from StatePoller and served at GET /api/stacks/:id/health-events**

## Performance

- **Duration:** 7 min
- **Started:** 2026-10-08T07:28:18Z
- **Completed:** 2026-10-08T07:35:36Z
- **Tasks:** 1 (tracer)
- **Files modified:** 24

## Accomplishments
- New `ServiceHealthEvent` model and `HealthSource` enum with a migration; no `serviceId`, no FK to `Service`, cascade only from `Stack`.
- `StatePoller.handleEvent` (inspect path) emits `service.health_changed` after `updateServiceState` resolves and only on a real normalized-health change for a service that has a row. The existing `stack.container_state_changed` / `stack.status_changed` payloads and emission conditions are unchanged; `stack-state-derivation.ts` and `notification-watcher.ts` have an empty diff.
- `subscribeServiceHealthHistory` is the single write path and is registered fourth in `registerDomainSubscribers`.
- `ServiceHealthHistoryService` and `healthRoutes` serve the history. `serviceHealthEventsQuerySchema` in `@docktor/shared` bounds `limit` to 1-200 (default 50) and `serviceName` to 1-255.
- Tracer verified end-to-end (real Postgres + real Fastify): emit on the real bus, poll the endpoint, redeploy-style `replaceServices`, 404/401/400 cases.

## Task Commits

1. **Task 1: End-to-end Docker-health history (tracer)** - `0791aac` (feat)

**Plan metadata:** committed separately (docs: complete plan)

_Note: tests were written first and confirmed failing on missing modules (RED) before implementation; they landed in the same commit as the implementation because CLAUDE.md forbids committing failing tests._

## Files Created/Modified
- `server/prisma/schema/service-health-event.prisma` - model, enum, indexes `[stackId, serviceName, createdAt]` and `[createdAt]`
- `server/prisma/migrations/20261008073041_add_service_health_events/migration.sql` - generated by `prisma migrate diff`, unedited
- `shared/src/validation/health.ts` - `serviceHealthEventsQuerySchema` and `ServiceHealthEventsQuery`
- `server/src/domain/service-health.ts` - pure `HealthSourceName`, `normalizeHealth`, `isHealthTransition`
- `server/src/domain/events.ts` - `ServiceHealthChangedEvent` registered as `service.health_changed`
- `server/src/jobs/state-poller.ts` - health event emission; `catch (err: any)` replaced by `unknown` plus a `hasStatusCode` narrowing helper
- `server/src/repositories/service-health-event-repository.ts` - the only Prisma touchpoint; `record`, `findLatestByService`, `findLatestByStack`
- `server/src/application/subscribers/service-health-history-subscriber.ts` - single write path with logged failures
- `server/src/application/service-health-history-service.ts` - read service, `NotFoundError` for unknown stacks
- `server/src/routes/health.ts`, `server/src/app.ts` - route and registration after `templateRoutes`
- Tests: shared `health.test.ts`; server domain, subscriber, service, state-poller (5 new cases), registration, repositories index, integration `health.test.ts` (9 cases)

## Decisions Made
- Migration branch used: **Branch B** (see deviations).
- The integration test points `DOCKTOR_STACKS_DIR` at a temp directory so `POST /api/stacks` does not write into the repo's `server/stacks/`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Live `prisma migrate dev` not runnable; Branch B used**
- **Found during:** Task 1, step 2
- **Issue:** The session's secret-read guard blocks any Bash command naming the dev env file, so the plan's `dotenv -e <dev env file> -- prisma migrate dev` could not be issued. The guard was not worked around.
- **Fix:** Followed the plan's Branch B: copied HEAD's schema directory into a scratch directory, ran `prisma migrate diff --from-schema <scratch> --to-schema server/prisma/schema --script` with a placeholder `DATABASE_URL` (the diff never connects), saved the SQL unedited as the migration, ran `yarn db:generate`. `prisma validate` also run with the placeholder URL.
- **Files modified:** `server/prisma/migrations/20261008073041_add_service_health_events/migration.sql`
- **Verification:** SQL contains both `CREATE TABLE "ServiceHealthEvent"` and `CREATE TYPE "HealthSource"` (count 2); schema valid; integration suite green against a schema pushed by `prisma db push`
- **Committed in:** 0791aac

**2. [Rule 3 - Blocking] Migration not applied to the dev database; ledger entry recorded**
- **Issue:** Same guard prevents `migrate deploy`/`migrate status` against the dev database.
- **Fix:** `unrun-verify` entry appended to `.planning/WINDOWS.md` naming `add_service_health_events`, as the plan prescribes. `syncDatabaseSchema()` applies the migration at next boot.

**3. [Rule 1 - Bug] Integration test left stack directories in `server/stacks/`**
- **Found during:** Task 1 verification
- **Issue:** `POST /api/stacks` wrote `server/stacks/health-*` into the repo working tree.
- **Fix:** Removed the generated directories and redirected `DOCKTOR_STACKS_DIR` to a temp dir (removed in `afterAll`), matching `proxy.test.ts`.
- **Files modified:** `server/test/integration/health.test.ts`
- **Committed in:** 0791aac

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** No scope change. The only open item is applying the migration to a dev database.

## Issues Encountered
- The full server unit suite shows 2 failures in `test/unit/infrastructure/git-executor.test.ts` (5s timeouts and an `EBUSY` temp-dir removal on Windows). They are unrelated to this plan's files and were not touched; logged in `deferred-items.md`.
- `eslint` is not installed in this workspace (`yarn eslint` finds no script), so lint was not run; `yarn typecheck` (tsc --build) is clean.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None.

## Threat Flags
None. The only new network surface is `GET /api/stacks/:id/health-events`, which is covered by T-14-01/T-14-02 in the plan (auth hook, bounded query schema, 401/404/400 tests).

## Next Phase Readiness
- 14-11 can build on `service.health_changed`, `isHealthTransition` and the history subscriber to cover reconcile, the handleEvent 404 path and the catch-up.
- 14-03 can render the endpoint; 14-06 adds the `http-probe` source over the same pipeline.
- Open: apply the migration to the developer's dev database (WINDOWS.md entry).

## Self-Check: PASSED

- All created files exist on disk (migration, schema, shared schema, domain, repository, subscriber, service, route, 6 test files).
- Commit `0791aac` is an ancestor of HEAD.
- Acceptance criteria re-run: migration folder count 1; SQL count 2; `serviceId` count 0; `onDelete: Cascade` count 1; `"service.health_changed"` in events.ts 1; state-poller reference 1; `subscribeServiceHealthHistory` in register.ts 2; `healthRoutes` in app.ts 2; `serviceHealthEventRepository` in repositories/index.ts 1; empty diff for `stack-state-derivation.ts` and `notification-watcher.ts`.
- Verification: shared health test 10/10; server unit set 188/188 (7 files incl. layering); integration `health.test.ts` 9/9; `yarn typecheck` clean.

---
*Phase: 14-health-uptime-and-disk-visibility*
*Completed: 2026-10-08*
