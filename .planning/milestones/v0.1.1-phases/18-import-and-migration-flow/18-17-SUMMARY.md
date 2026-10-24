---
phase: 18-import-and-migration-flow
plan: 17
subsystem: ui
tags: [react, sse, sonner, hooks, migration, tdd, gap-closure, playwright]

requires:
  - phase: 18-import-and-migration-flow
    provides: "POST migrate answers 202 with a MigrationOperation, GET .../migrations list endpoints (18-14); migration_progress SSE event on GET /api/events (18-16); preview input object and inPlaceAsideName (18-15); discovered-stack-actions row (18-13)"
provides:
  - "useMigrationOperations(listOperations, {onUpdate}): operations, runningByComposePath, track - follows operations through migration_progress SSE events, resyncs from the list on mount and on every stream (re)open"
  - "migration-progress lib: migrationStepLabel and showMigrationToast (one toast per operation id: loading, success, failure)"
  - "useContainerEvents optional onOpen callback and MigrationProgressEvent in the StateEvent mirror"
  - "Rows of running migrations are disabled (Migrating..., Adopt disabled, current step shown)"
  - "listMigrationOperations in import-api and setup-api; executeMigration typed as the 202 MigrationOperation"
affects: [phase 18 verification, G-18-job UAT retest]

actuals:
  tokens: 11500
  tasks: 3
  commits: 5
plan_head_before: 9ba3311bb3fcf411350f4efd50fef206eaa6a055
commits: 5
plan_head_after: af8241cd4befa44bdb30f0e77cbc99a00c277ddf

tech-stack:
  added: []
  patterns:
    - "Operation snapshots are upserted into a ref-held Map; a snapshot that repeats the stored one, moves a finished operation back to running or an earlier step is dropped (T-18-47)"
    - "An operation is followed (reported through onUpdate) once tracked or seen running, so old finished operations never raise toasts"
    - "A sonner toast id equal to the operation id turns progress, success and failure into one replacing toast"

key-files:
  created:
    - client/src/hooks/use-migration-operations.ts
    - client/src/lib/migration-progress.ts
    - client/test/unit/hooks/use-migration-operations.test.ts
  modified:
    - client/src/hooks/use-container-events.ts
    - client/src/hooks/use-stack.ts
    - client/src/components/domain/stack/brownfield-import.tsx
    - client/src/components/domain/stack/discovered-stack-actions.tsx
    - client/src/lib/brownfield-types.ts
    - client/src/lib/import-api.ts
    - client/src/lib/setup-api.ts
    - client/src/routes/app/stacks/import.tsx
    - client/src/routes/setup/components/brownfield-step.tsx
    - client/test/unit/components/domain/stack/brownfield-import.test.tsx
    - client/test/unit/hooks/use-container-events.test.ts
    - client/test/integration/setup-wizard.spec.ts
    - client/test/integration/fixtures.ts

key-decisions:
  - "listOperations runs on mount AND on every EventSource open (including the first): the first open closes the window between the mount read and the stream connecting; duplicate snapshots are dropped, so there is no double toast"
  - "The hook owns the stale-snapshot rules (finished never back to running, running never to an earlier step by MIGRATION_OPERATION_STEPS order, identical snapshot ignored) because the 202 response can arrive after the first SSE events"
  - "showMigrationToast reads backup/stopOldStack from the operation itself, so the description notes are also right after a reload"
  - "The refused-start path (400/409) stays a plain toast.error with the server message and tracks nothing"

patterns-established:
  - "Background operation UI: hook (list + SSE upsert) + toast helper keyed by operation id + row component fed by a Map lookup"

requirements-completed: [MIG-01, MIG-04]

coverage:
  - id: D1
    description: "Confirm & Migrate starts the 202 operation and shows one persistent progress toast that becomes the success toast (View stack, kept original/backup/stopped notes) or the failure toast with the server's rollback message"
    requirement: MIG-04
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/stack/brownfield-import.test.tsx#operation-driven toasts (G-18-job)"
        status: pass
      - kind: unit
        ref: "client/test/unit/hooks/use-migration-operations.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Rows of running migrations are disabled (Migrating..., Adopt disabled, step text) and become Imported or actionable again"
    requirement: MIG-01
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/stack/brownfield-import.test.tsx#rows of running migrations (G-18-job)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Reload and SSE reconnect restore running migrations and report ones that finished meanwhile"
    requirement: MIG-04
    verification:
      - kind: unit
        ref: "client/test/unit/hooks/use-migration-operations.test.ts#resync when the event stream (re)opens"
        status: pass
      - kind: unit
        ref: "client/test/unit/hooks/use-container-events.test.ts#calls onOpen each time the EventSource opens"
        status: pass
    human_judgment: false
  - id: D4
    description: "Browser flow: 202 start, running row, SSE-delivered outcome for both route families' mocks (setup wizard)"
    verification:
      - kind: e2e
        ref: "client/test/integration/setup-wizard.spec.ts (Migration wizard flow) - left for CI"
        status: unknown
    human_judgment: true
    rationale: "Playwright specs were written/updated but not executed locally (shared VPS rule); CI runs desktop and mobile projects"

duration: 15min
completed: 2026-10-16
status: complete
---

# Phase 18 Plan 17: Client migration progress from background operations Summary

**Migrations now run as 202 background operations on the client: a hook follows them via `migration_progress` SSE events (resynced from the list on mount and every stream open), one toast per operation id shows progress then the outcome, and rows of running migrations are disabled with their current step.**

## Performance

- **Duration:** about 15 min (start time was not captured at executor start; estimated from test run timestamps)
- **Completed:** 2026-10-16T10:52Z
- **Tasks:** 3 (Task 1 tracer, Task 2 TDD, Task 3 wiring)
- **Files modified:** 16 (3 created)

## Accomplishments

- `useMigrationOperations` keeps an id-keyed Map of operations, follows tracked or running ones, drops stale/duplicate snapshots, closes its EventSource through `useContainerEvents` cleanup, and survives a failing list call (`console.warn`).
- `showMigrationToast` replaces the old synchronous result handling: `toast.loading("Migrating <name>: <step>...")`, `toast.success` with `View stack` plus notes (kept original, backup, stopped old stack), `toast.error` with the server's rollback message or the generic fallback, all with `{id: operation.id}`.
- `DiscoveredStackActions` takes `runningOperation`: Migrate reads `Migrating...`, Adopt is disabled, an `aria-live` line shows the step label.
- Both API clients return the 202 `MigrationOperation` and expose `listMigrationOperations`; both pages pass it; the local `MigrationResult` type is gone.
- Playwright `setup-wizard.spec.ts` mocks 202 + operation list + `text/event-stream` frames (`retry: 100`), keeps the run "running" until `finish()` so "Migrating..." is asserted deterministically.

## Task Commits

1. **Task 1 (tracer): Confirm & Migrate progress toast driven by SSE**
   - RED `0713983` (test) - hook tests failed on missing module; 7 component tests failed on assertions (no `toast.loading`, no operation handling)
   - GREEN `ed684e6` (feat)
   - Tracer gate: `<verify>` re-run after GREEN passed (3 files, 35 tests) - tracer verified end-to-end, expanded.
2. **Task 2: Running migrations disable their rows and survive reload/reconnect**
   - RED `f04a0ad` (test) - 10 new tests failed (row, reload, reconnect, onOpen)
   - GREEN `9044c07` (feat)
3. **Task 3: API clients, page wiring and Playwright** - `af8241c` (feat)

**Plan metadata:** committed separately (docs: complete plan).

## Files Created/Modified

- `client/src/hooks/use-migration-operations.ts` - operation Map, follow rules, stale-snapshot guard, mount + reopen resync
- `client/src/lib/migration-progress.ts` - step labels (exhaustive `Record<MigrationOperationStep, string>`), operation toast, generic failure fallback
- `client/src/hooks/use-container-events.ts` - `MigrationProgressEvent` mirror, optional `onOpen` (kept in a ref)
- `client/src/components/domain/stack/brownfield-import.tsx` - tracks the 202 operation, `onUpdate` -> toast + adoptedIds, passes `runningOperation` per row
- `client/src/components/domain/stack/discovered-stack-actions.tsx` - running state
- `client/src/lib/brownfield-types.ts`, `import-api.ts`, `setup-api.ts`, `routes/app/stacks/import.tsx`, `routes/setup/components/brownfield-step.tsx` - operation types, list calls, wiring
- `client/src/hooks/use-stack.ts` - ignores `migration_progress` (type narrowing)
- tests: `use-migration-operations.test.ts` (new), `brownfield-import.test.tsx` (toast tests rewritten to operation-driven, running-row/reload/reconnect added), `use-container-events.test.ts` (onOpen), `setup-wizard.spec.ts`, `fixtures.ts`

## Decisions Made

See `key-decisions` in the frontmatter. The deliberate contract change (synchronous-result toast tests rewritten to operation-driven cases) is per the plan (G-18-job).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Type error in use-stack.ts after widening StateEvent**
- **Found during:** Task 3 (single-workspace `tsc --noEmit`)
- **Issue:** Adding `MigrationProgressEvent` (no top-level `stackId`) to the union broke `event.stackId` in `useStack`'s handler.
- **Fix:** Early return for `migration_progress` next to the existing `notification_created` guard.
- **Files modified:** `client/src/hooks/use-stack.ts`
- **Verification:** `tsc --noEmit -p .` clean; `use-stack.test.ts` passes.
- **Committed in:** `af8241c`

**2. [Rule 3 - Blocking] Playwright API-route guard would fail every Import-page spec**
- **Found during:** Task 3 (reading `client/test/integration/fixtures.ts`)
- **Issue:** The hook reads `GET /api/setup/migrations` and `/api/stacks/import/migrations` on mount; the fixture's catch-all aborts unstubbed `/api/**` calls and fails the test, so every spec that renders `BrownfieldImport` (setup wizard step 5, `stacks-import.spec.ts`) would have failed.
- **Fix:** Default stubs for both list routes (`{operations: []}`) in `fixtures.ts`; migration tests override per test.
- **Files modified:** `client/test/integration/fixtures.ts` (not in the plan's file list)
- **Committed in:** `af8241c`

**3. [Rule 1 - Bug, found by own test] Identical running snapshot re-reported on resync**
- **Found during:** Task 2 GREEN (test "does not report an unchanged operation again")
- **Issue:** `isStale` let an identical running snapshot through, so every stream reopen would re-call `onUpdate`.
- **Fix:** A running snapshot equal to the stored one is stale.
- **Files modified:** `client/src/hooks/use-migration-operations.ts`
- **Committed in:** `9044c07`

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug)
**Impact on plan:** All necessary for type-correctness and a green CI; no scope creep.

## TDD Gate Compliance

RED (`test(18-17)`) precedes GREEN (`feat(18-17)`) for Tasks 1 and 2. Note on RED evidence for Task 1: the hook test file failed at module resolution (hook did not exist), which is a load failure and not by itself valid RED; the valid assertion-level RED for that task is the 7 failing component tests in `brownfield-import.test.tsx` (missing `toast.loading` / operation handling), and the hook behaviour is covered by the same file's end-to-end cases. Task 2 RED was assertion-level for all 10 failing tests (the `does not require an onOpen callback` guard test passed before GREEN by design).

## Issues Encountered

None blocking. Intermediate commit `ed684e6` leaves `import-api.ts`/`setup-api.ts` typed with the old `MigrationResult` until Task 3 (`af8241c`), as the plan splits them; the single-workspace type check was run once at the end (clean).

## Verification

- `cd client && ../node_modules/.bin/vitest run --coverage.enabled=false` on `use-migration-operations`, `use-container-events`, `brownfield-import`, `migration-wizard`, `use-stack`, `use-stacks` tests: 6 files, 110 tests, all pass.
- `tsc --noEmit -p .` in `client`: clean. Playwright spec and fixtures type-checked in isolation: clean.
- Not run locally (shared VPS rule; left for CI): full `tsc --build`, Playwright desktop and mobile projects (`setup-wizard.spec.ts`, `stacks-import.spec.ts`), server integration tests.

## Known Stubs

None.

## Threat Flags

None. T-18-46 (EventSource closed via `useContainerEvents` cleanup, tested), T-18-47 (stale snapshots dropped, tested), T-18-48 (server 409 stays authoritative; client only disables rows) are mitigated as planned.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

All G-18-job client items are closed; 18-VERIFICATION CR-02 client item closed here. This was the final gap-closure plan of phase 18: ready for phase verification (CI must confirm the Playwright specs).

## Self-Check: PASSED

---
*Phase: 18-import-and-migration-flow*
*Completed: 2026-10-16*
