---
phase: 18-import-and-migration-flow
plan: 14
subsystem: api
tags: [fastify, zod, background-operation, in-flight-guard, brownfield-import, gap-closure]

requires:
  - phase: 18-import-and-migration-flow
    provides: "MigrationService preflight/execute split and MigrationPlan (18-06, 18-12), requireAdminAccount guard on setup routes (18-07)"
provides:
  - "Shared migration operation contract (status/step enums, result, operation, params, list schemas and types)"
  - "Pure domain transitions startMigrationOperation / finishMigrationOperation / pruneFinishedOperations"
  - "MigrationOperationService: preflight then background execute, in-flight guard by slug and compose path, 1 h / 50 retention, singleton"
  - "POST /api/stacks/import/migrate and /api/setup/migrate answer 202 with an operation; GET list and by-id routes in both families"
affects: [18-15, 18-16, 18-17, client import page, setup wizard]

actuals:
  tokens: 15000
  tasks: 3
  commits: 6
plan_head_before: 4709c955f324da065b9bb6b105daa11b9138ceb5
commits: 6
plan_head_after: 0a23dc0abbb12669b08e30f7dedcef7f7e8348af

tech-stack:
  added: []
  patterns:
    - "Process-local operation registry with synchronous check-and-hold in-flight keys (stack:<slug>, compose:<path>)"
    - "Refusals stay synchronous because start awaits the side-effect-free preflight; only execute runs in the background"

key-files:
  created:
    - shared/src/validation/migration-operation.ts
    - shared/test/unit/validation/migration-operation.test.ts
    - server/src/domain/migration-operation.ts
    - server/test/unit/domain/migration-operation.test.ts
    - server/src/application/migration-operation-service.ts
    - server/test/unit/application/migration-operation-service.test.ts
  modified:
    - shared/src/validation/index.ts
    - server/src/routes/imports.ts
    - server/src/routes/setup.ts
    - server/test/unit/routes/brownfield-routes.test.ts

key-decisions:
  - "Operations live in memory for the process lifetime (finished ones pruned after one hour, at most 50); a restart ends running migrations anyway, so persistence would only keep stale running rows"
  - "Pruning age is measured from finishedAt; ordering is newest first by startedAt; running operations are never pruned"
  - "The in-flight guard holds both keys synchronously before the first await so racing starts cannot both pass; keys are released in a finally after preflight refusal or when the run ends"
  - "An unexpected rejection of execute becomes a failed operation 'Migration failed: <message>' with originalPath = plan.originalDir and is logged with console.error"

patterns-established:
  - "Both route families share one singleton operation service; the setup family keeps its wizard-complete 410 hook and requireAdminAccount on every migrate and operation route"

requirements-completed: [MIG-03, MIG-04]

coverage:
  - id: D1
    description: "POST migrate answers 202 with a running operation in both route families; the final result is readable by id after the background run"
    requirement: MIG-03
    verification:
      - kind: unit
        ref: "server/test/unit/routes/brownfield-routes.test.ts#POST %s"
        status: pass
    human_judgment: false
  - id: D2
    description: "Second start of the same slug or compose file is refused with ConflictError before preflight; slot released after refusal, failure and success"
    requirement: MIG-04
    verification:
      - kind: unit
        ref: "server/test/unit/application/migration-operation-service.test.ts#in-flight guard"
        status: pass
    human_judgment: false
  - id: D3
    description: "Operation list/by-id routes in both families; setup ones behind the 18-07 admin guard and the wizard-complete 410"
    requirement: MIG-03
    verification:
      - kind: unit
        ref: "server/test/unit/routes/brownfield-routes.test.ts#migration operation lists"
        status: pass
    human_judgment: false
  - id: D4
    description: "Retention: finished operations dropped after one hour, capped at 50, running never pruned"
    requirement: MIG-03
    verification:
      - kind: unit
        ref: "server/test/unit/domain/migration-operation.test.ts#pruneFinishedOperations"
        status: pass
    human_judgment: false

duration: 14min
completed: 2026-10-16
status: complete
---

# Phase 18 Plan 14: Migration as a background operation Summary

**Migrations now run as in-memory background operations: POST migrate answers 202 with an operation id, a per-slug and per-compose-file in-flight guard answers 409, and status is readable by id and by list after a reload, shared by the setup and import route families.**

## Performance

- **Duration:** about 14 min
- **Tasks:** 3 (tracer + 2 TDD tasks), 6 commits (3 RED, 3 GREEN)
- **Files:** 6 created, 4 modified

## Accomplishments

- Shared contract `migrationOperationSchema` plus step/status enums, result, params and list schemas (step list already contains the intermediate steps plan 18-16 will report).
- Pure domain transitions and `pruneFinishedOperations`.
- `MigrationOperationService`: `start` awaits `preflight` (refusals propagate, nothing stored), holds the in-flight keys synchronously, runs `execute` without awaiting, finishes the operation with an explicit field mapping, never leaks an unhandled rejection.
- Routes: `POST /api/stacks/import/migrate` and `POST /api/setup/migrate` reply 202; `GET .../migrations` and `GET .../migrations/:operationId` in both families; setup ones keep `requireAdminAccount`, the wizard-complete 410 hook covers them unchanged.

## Task Commits

| Task | Phase | Commit | Message |
| ---- | ----- | ------ | ------- |
| 1 | RED | aae55dd | test(18-14): add failing tests for 202 migration operation on import migrate |
| 1 | GREEN | 36c3c18 | feat(18-14): run import migrations as 202 background operations |
| 2 | RED | 17f4f41 | test(18-14): add failing tests for migration in-flight guard and retention |
| 2 | GREEN | e5900d0 | feat(18-14): guard in-flight migrations and prune finished operations |
| 3 | RED | d255305 | test(18-14): add failing tests for setup migration operations and lists |
| 3 | GREEN | 0a23dc0 | feat(18-14): share migration operations between setup and import routes |

## TDD Gate Compliance

RED evidence (vitest, format-compatible failures on the planned assertions; semantic assessment: each target test ran and failed for the intended reason, not a load/import fault):

- Task 1: 3 tests failed, `expected 200 to be 202` and `expected 404 to be 200` (no operation route yet); the 409/400 cases correctly stayed green because refusal behaviour already existed.
- Task 2: 12 tests failed, `service.list is not a function`, `pruneFinishedOperations is not a function`, and `promise resolved ... instead of rejecting` for the missing guard. The shared schema test passed at RED because the schema was created in Task 1 (it tests already-delivered code).
- Task 3: 10 tests failed, 202 vs 200 for `/api/setup/migrate` and 404 instead of 400/410/200 for the missing list/by-id routes.

The formal `gsd_run check tdd-red-evidence` classifier was not run (no record files were persisted); RED was judged by inspecting the vitest output above.

## Deviations from Plan

None - plan executed exactly as written.

Notes: `tsc --noEmit` for server and shared ran once at the end (clean). Per the shared-VPS rule, server integration tests (`imports.test.ts` keeps its 400/401/409 migrate cases) and Playwright specs were not run and are left for CI. Client code (`client/src/lib/import-api.ts`, `setup-api.ts`, wizard Playwright mocks) still expects the old synchronous 200 result; that is plan 18-17's scope.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (T-18-38..41 mitigated: in-flight keys, admin/wizard gates on setup operation routes, pruning, rejection-to-failed conversion).

## Next Phase Readiness

Ready for 18-15/18-16 (SSE progress using the `step` / `stepDetail` fields) and 18-17 (client switches to 202 plus polling/resync).

## Self-Check: PASSED

- Created files exist on disk (shared schema + test, domain + test, service + test).
- Commits aae55dd, 36c3c18, 17f4f41, e5900d0, d255305, 0a23dc0 are ancestors of HEAD.
- Verify commands (shared build, shared tests, server unit tests for domain, service, routes, layering, schema parity) passed; server and shared `tsc --noEmit` clean.
