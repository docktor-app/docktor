---
phase: 22-migration-hardening
plan: 03
subsystem: migration
tags: [toast, sse, zod, shared-contract, operation-store, issue-105, issue-100]

requires:
  - phase: 22-migration-hardening
    provides: 22-01 and 22-02 (no direct dependency; same phase, shared build only)
provides:
  - "client MigrationOperationsStore (module-level) + MigrationToastTracker mounted in AppLayout and the setup page"
  - "useMigrationOperationFeed (one list per stream open, reconcile with lost detection) and a read-only useMigrationOperations"
  - "@docktor/shared state-events: stateEventSchema, STATE_EVENT_TYPES and the eight event schemas/types, used by server and client"
  - "operation contract: rolled_back status, D-01 step order (verifying_stop, restarting_old_stack), migrationRollbackReportSchema"
  - "server migrationOperationStatusOf; client migrationOutcomeMessage with verified-outcome wording"
affects: [22-04, 22-07, 22-08, phase-24, phase-25]

actuals:
  tokens: 19000
  tasks: 3
  commits: 6
plan_head_before: cbc69ebf64d79f17446349f3c0c309003210a113
plan_head_after: 77d8397b53a7b6d1dd72aa4122b5951d23988e57

tech-stack:
  added: []
  patterns:
    - "Module-level external store (useSyncExternalStore) for state whose lifecycle must outlive pages"
    - "One Zod definition per SSE frame in @docktor/shared; server types and client safeParse derive from it"
    - "Status derived by a pure function from a typed, verified rollback report"

key-files:
  created:
    - client/src/lib/migration-operations-store.ts
    - client/src/components/domain/stack/migration-toast-tracker.tsx
    - shared/src/validation/state-events.ts
    - client/test/unit/lib/migration-operations-store.test.ts
    - client/test/unit/lib/migration-progress.test.ts
    - client/test/unit/components/domain/stack/migration-toast-tracker.test.tsx
    - shared/test/unit/validation/state-events.test.ts
  modified:
    - client/src/hooks/use-migration-operations.ts
    - client/src/components/app-layout.tsx
    - client/src/components/domain/stack/brownfield-import.tsx
    - client/src/hooks/use-container-events.ts
    - client/src/lib/migration-progress.ts
    - client/src/routes/setup.tsx
    - shared/src/validation/index.ts
    - shared/src/validation/migration-operation.ts
    - server/src/lib/state-broadcaster.ts
    - server/src/domain/migration-operation.ts
    - server/src/application/subscribers/state-broadcast-subscriber.ts
    - client/test/unit/hooks/use-migration-operations.test.ts
    - client/test/unit/hooks/use-container-events.test.ts
    - client/test/unit/components/domain/stack/brownfield-import.test.tsx
    - shared/test/unit/validation/migration-operation.test.ts
    - server/test/unit/domain/migration-operation.test.ts
    - server/test/unit/application/state-broadcast-subscriber.test.ts

key-decisions:
  - "A followed running operation the server no longer reports is reported once as lost and DROPPED from the store, so its table row becomes actionable again instead of staying 'Migrating...' forever"
  - "reconcile(listed, requestedWhileRunning?) limits the lost verdict to operations that already ran when the list was requested, so an operation started while the list was in flight is not called lost"
  - "Toasts for failed and rolled_back use a Docktor-worded title ('Migration of X failed' / 'rolled back') and put the server error text plus the verified outcome in the description; the old behavior of using the server text as the title is gone"
  - "A failure without a rollback report claims no outcome (MIGRATION_ERROR_FALLBACK no longer says the original directory was not modified)"
  - "Added one verified-outcome row beyond the plan table: oldStack left-stopped with the original in place says 'The original stack is stopped; start it by hand from <path>.'; left-aside uses keptOriginalAt (falling back to originalPath)"
  - "SSE mapMigrationResult in the server subscriber passes result.rollback through so the report reaches the client once plans 22-04/22-07 populate it"

patterns-established:
  - "Page components read the operation store; only the layout-level tracker owns the EventSource and toasts"
  - "Phase 25 keys EVENT_PERMISSIONS on STATE_EVENT_TYPES from @docktor/shared"

requirements-completed: [MIG-11, MIG-08]

coverage:
  - id: D1
    description: "A migration toast ends in a terminal state after the import page unmounts, after a reload, or after an SSE reconnect; a followed running op the server no longer reports ends in a terminal 'lost track' toast"
    requirement: MIG-11
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/stack/migration-toast-tracker.test.tsx; client/test/unit/lib/migration-operations-store.test.ts; client/test/unit/hooks/use-migration-operations.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Operation list is read exactly once per stream open (no mount-time resync)"
    requirement: MIG-11
    verification:
      - kind: unit
        ref: "client/test/unit/hooks/use-migration-operations.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Server and client share one Zod definition of every /api/events frame; invalid or unknown frames are dropped without throwing"
    requirement: MIG-11
    verification:
      - kind: unit
        ref: "shared/test/unit/validation/state-events.test.ts; client/test/unit/hooks/use-container-events.test.ts; server/test/unit/application/state-broadcast-subscriber.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Operation contract: rolled_back, D-01 step order, typed rollback report; rolled_back derived only from a verified report"
    requirement: MIG-08
    verification:
      - kind: unit
        ref: "shared/test/unit/validation/migration-operation.test.ts; server/test/unit/domain/migration-operation.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Toast and result wording state only verified outcomes (restart requested while pending; restored and running only when verified; check manually when unverified)"
    requirement: MIG-08
    verification:
      - kind: unit
        ref: "client/test/unit/lib/migration-progress.test.ts"
        status: pass
    human_judgment: true

duration: 55min
completed: 2026-10-22
status: complete
---

# Phase 22 Plan 03: Layout-owned migration toasts, shared SSE schemas and verified-outcome contract Summary

**Migration toasts now live in a module-level operation store owned by a layout-mounted tracker, so they end in done, failed, rolled back or "lost track" whatever the user does (#105); every /api/events frame has one shared Zod definition guarded by `safeParse` on the client; and the operation contract carries `rolled_back`, the D-01 step order and a typed rollback report that drives honest wording (#100).**

## Performance

- **Duration:** about 55 min (start time not captured at launch; estimated)
- **Completed:** 2026-10-22T14:18Z
- **Tasks:** 3 (all TDD: RED commit then GREEN commit each; Task 1 is the tracer)
- **Files:** 24 changed (7 created, 17 modified)

## Accomplishments

- `MigrationOperationsStore` (module singleton) holds operations, a followed set, a cached snapshot and two listener sets. The stale-snapshot rules moved over unchanged. `reconcile` applies the server list and reports a followed, still-running operation missing from the list once as `lost`, then drops it.
- `useMigrationOperationFeed` lists only when the stream opens (the mount-time resync is gone, #105 AC2) and feeds `migration_progress` events into the store. `useMigrationOperations()` is a read-only `useSyncExternalStore` view with `runningByComposePath` and `track`; it opens no EventSource.
- `MigrationToastTracker` renders nothing and routes updates to `showMigrationToast` and lost operations to a `toast.error` with `lostMigrationMessage` (an observation, not an outcome). It is mounted once in `AppLayout` and once in the setup page; `BrownfieldImport` no longer shows toasts and marks a stack imported when its operation is `succeeded` in the store.
- `shared/src/validation/state-events.ts`: one schema per event, `stateEventSchema` (discriminated union), `STATE_EVENT_TYPES`, inferred types with today's names. The server's `state-broadcaster.ts` and the client's `use-container-events.ts` lost their hand-kept interface sets and re-export the shared types; the client runs `stateEventSchema.safeParse` after `JSON.parse` and only calls the handler with `parsed.data` (T-22-08).
- Contract: statuses `running, succeeded, failed, rolled_back`; steps in the exact D-01 order with `verifying_stop` and `restarting_old_stack`; `migrationRollbackReportSchema` (`oldStack`, `original`, `keptOriginalAt?`, `cleanupErrors`) as an optional `rollback` on the result. Server `migrationOperationStatusOf` yields `rolled_back` only when both the old stack (`not-stopped` / `restored-running`) and the original directory (`untouched` / `restored`) are verified; everything else, including no report, is `failed`.
- Wording: `migrationOutcomeMessage` builds the description from the server error text plus the verified outcome; `showMigrationToast` renders `rolled_back` as `toast.warning`, `failed` as `toast.error`, both with the operation id. "Restarted" never appears unless `oldStack` is `restored-running` (and then as "restored and running").

## Task Commits

| Task | RED | GREEN |
|------|-----|-------|
| 1 module store, layout tracker, one list per open (tracer) | 92bb3bc | 1ee1499 |
| 2 shared SSE event schemas, guarded client parse | 915e304 | d93a9b4 |
| 3 operation contract, status derivation, verified wording, setup tracker | 330ad90 | 77d8397 |

## TDD Gate Compliance

Each RED commit precedes its GREEN commit and was run before GREEN. RED states were made assertion failures with minimal stubs (store and tracker stubs; a pass-through `stateEventSchema`; empty rollback constants; a `migrationOperationStatusOf` that always returns `failed`; a `migrationOutcomeMessage` that returns an empty title), so failures are on planned behavior, not on missing modules: Task 2 RED had 10 shared and 6 client assertion failures, Task 3 RED had 8 shared, 6 server and 15 client. Caveats on Task 1 RED: the old hook file was still in place, so the hook and tracker cases partly failed with "not a function / not called" runtime errors rather than pure assertions, and the stub-passing "never claims restarted" cases pass vacuously against the stub. The formal `gsd_run check tdd-red-evidence` classifier was not run (no reporter record was produced); the failures were inspected directly. No REFACTOR commits were needed.

Tracer gate: Task 1's `<verify>` (store, hook, tracker, brownfield-import suites) passed end to end before Tasks 2 and 3 began (see the first-test timeout note below).

## Decisions Made

See key-decisions above. User-visible: failed and rolled-back toasts now carry a Docktor-worded title with the server error and verified outcome as description; a lost operation ends in an error toast and its row becomes actionable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] SSE mapper dropped the rollback report**
- **Found during:** Task 3
- **Issue:** `mapMigrationResult` in the server state-broadcast subscriber copies result fields one by one, so the new `result.rollback` would have been stripped from every `migration_progress` event, leaving the client unable to word a verified outcome live (it would only appear after a list refresh).
- **Fix:** pass `rollback` through when present; added a subscriber test for a rolled-back operation.
- **Files modified:** `server/src/application/subscribers/state-broadcast-subscriber.ts`, `server/test/unit/application/state-broadcast-subscriber.test.ts`
- **Commit:** 77d8397

**2. [Rule 1 - Bug] Race in lost-operation detection**
- **Found during:** Task 1 design
- **Issue:** Reconciling every followed running operation against the list would falsely call an operation lost when it was started (202 response tracked) after the list request was sent but before the response arrived.
- **Fix:** `reconcile(listed, requestedWhileRunning?)` plus `runningIds()`; the feed captures the running ids before the request. Covered by a store and a hook test.
- **Files modified:** `client/src/lib/migration-operations-store.ts`, `client/src/hooks/use-migration-operations.ts`
- **Commit:** 1ee1499

**3. [Rule 1 - Bug] Existing tests asserted the old toast contract**
- **Found during:** Tasks 1 and 3
- **Issue:** `brownfield-import.test.tsx` relied on the list being read on mount, on BrownfieldImport owning the toasts, and on the failed toast title being the server text and the old fallback sentence; `use-container-events.test.ts` delivered frames that are not valid events.
- **Fix:** tests render a `MigrationToastTracker` next to the page and open the stream explicitly; failed-toast assertions use the new title/description; container-events tests use valid frames.
- **Commits:** 92bb3bc, 1ee1499, 915e304, 77d8397

**Total deviations:** 3 auto-fixed (1 Rule 2, 2 Rule 1). **Impact:** none on scope; the extra wording row (left-stopped with original in place) is a design decision recorded above.

### Process notes (not code deviations)

- **Verification scope (MEMORY rule).** No full `tsc --build`, integration or Playwright suites, no full suites. Ran only the targeted vitest files named in the `<verify>` blocks plus `migration-wizard.test.tsx`, `app-layout.test.tsx` and the shared build, and scoped `tsc --noEmit -p tsconfig.json` for client and server after Tasks 2 and 3 (about 20 s each, zero errors). Full typecheck, full suites and Playwright (`stacks-import.spec.ts`, `setup-wizard.spec.ts`) remain for GitHub Actions CI.
- **Flaky first test.** `brownfield-import.test.tsx` "sends backup false and stopOldStack true by default" (the first test of the file, about 2.7 s alone) exceeded the 5 s default timeout twice when run in parallel with other suites on this VPS and passed alone and in a whole-file run (31/31). It is load-related, not a logic failure.
- **Branch guard.** As in 22-01 and 22-02, this is the sequential executor on `feature/phase-22-migration-hardening`; the `agent-*` allow-list of the parallel-worktree assertion was not applied, the protected-branch check and the root pin ran before every commit.

## Issues Encountered

None beyond the deviations above.

## Known Stubs

None. (The RED-commit stubs were replaced in the GREEN commits.)

## Threat Flags

None beyond the plan's threat model. T-22-08 (frame tampering) is mitigated by the guarded parse; T-22-09 (misleading wording) by `migrationOutcomeMessage` and the lost-operation observation text.

## User Setup Required

None.

## Next Phase Readiness

Ready for 22-04 and later plans. They can emit `verifying_stop`, `restarting_old_stack` and `result.rollback` (wire `rollback` through `toOperationResult` in `migration-operation-service.ts` when `MigrationResult` gains it: only the SSE mapper was updated here). `STATE_EVENT_TYPES` is available for Phase 25's EVENT_PERMISSIONS. The changelog entry (plan 22-08) should note the new failed/rolled-back toast wording and the lost-track toast.

## Self-Check: PASSED

- Created files exist: `client/src/lib/migration-operations-store.ts`, `client/src/components/domain/stack/migration-toast-tracker.tsx`, `shared/src/validation/state-events.ts`, `client/test/unit/lib/migration-operations-store.test.ts`, `client/test/unit/lib/migration-progress.test.ts`, `client/test/unit/components/domain/stack/migration-toast-tracker.test.tsx`, `shared/test/unit/validation/state-events.test.ts`.
- Commits found on the branch: 92bb3bc, 1ee1499, 915e304, d93a9b4, 330ad90, 77d8397 (6, matching `git rev-list --count` from the plan ledger).
- Acceptance greps: `<MigrationToastTracker` 1 in app-layout and 1 in setup.tsx; `showMigrationToast` 0 in brownfield-import; `useSyncExternalStore` 2 and `useEffect(resync` 0 in the hook; `export interface` 0 in state-broadcaster and use-container-events; `stateEventSchema.safeParse` 1; `state-events.js` 1 in the validation index; `"verifying_stop"` 1, `"restarting_old_stack"` 1, `"rolled_back"` 1 in the shared contract; `migrationOperationStatusOf` 2 in the server domain; `was not modified` 0 in migration-progress.
