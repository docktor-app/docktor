---
phase: 18-import-and-migration-flow
plan: 12
subsystem: api
tags: [fastify, ddd, zod, brownfield-import, migration, rollback, gap-closure, vitest]

requires:
  - phase: 18-import-and-migration-flow
    provides: "preflight/execute/MigrationPlan, createDirectoryExclusive, recordCreated rollback (18-06), own-stack guard (18-07), already-managed guard (18-11)"
provides:
  - "Pure classifyMigrationTarget (separate | in-place | nested) and asideNameCandidates"
  - "In-place migration: stop, rename original aside, rebuild in the original path from the renamed copy, renamed original is the backup (keptOriginalAt)"
  - "In-place rollback: remove new directory, rename original back into a free path, restart; manual-restore message when impossible, nothing deleted"
  - "VolumeMigratorPort.moveDirectory (never replaces an existing destination)"
  - "previewMigration(request) returning target {stackId, directory, originalDirectory, inPlace, suggestedAsideName}; shared assessTarget used by preview and preflight"
  - "Shared stackDirectoryNameSchema, migrationExecuteSchema.inPlaceAsideName, migrationPreviewSchema.displayName, migrationTargetSchema"
affects: [18-13, 18-14, 18-15, import page, setup wizard]

actuals:
  tokens: 60000
  tasks: 3
  commits: 6
plan_head_before: 91c473caea47b1c192cce349c14707faf216dfab
commits: 6
plan_head_after: d21df0975535a7ad2c89e837027300b810787d1f

tech-stack:
  added: []
  patterns:
    - "Target classification is a pure domain function; the service decides what each kind means (nested refused, in-place renames aside, separate unchanged)"
    - "Preview and preflight share one private assessTarget so the two cannot drift"
    - "Rollback of a rename is conditional: move back only into a free path, otherwise leave everything and tell the user the exact manual step"

key-files:
  created:
    - server/src/domain/migration-target.ts
    - server/test/unit/domain/migration-target.test.ts
    - server/test/unit/infrastructure/volume-migrator.test.ts
  modified:
    - server/src/application/migration-service.ts
    - server/src/application/ports/volume-migrator-port.ts
    - server/src/infrastructure/volume-migrator.ts
    - shared/src/validation/brownfield.ts
    - server/src/routes/imports.ts
    - server/src/routes/setup.ts
    - server/test/unit/application/migration-service.test.ts
    - server/test/unit/routes/brownfield-routes.test.ts
    - server/test/integration/imports.test.ts
    - shared/test/unit/validation/brownfield.test.ts

key-decisions:
  - "In-place always forces the stop: a request with stopOldStack false is a BadRequestError before any side effect (same compose project name and directory)"
  - "Aside name is a single validated segment (shared stackDirectoryNameSchema, enforced at the route schema and again in preflight) that differs from the original's own name and must not exist; default is the first free <id>-pre-migration[-N]"
  - "moveDirectory lstat-checks the destination first because fs.rename silently replaces an empty directory on POSIX"
  - "Rollback restarts the old stack only when the original is back at its path; if the rename back is impossible nothing is restarted or deleted"
  - "The explicit backup copy is skipped in place: the renamed original is the backup"

patterns-established:
  - "Pre-existing overlap message and already-exists message texts are preserved verbatim for nested and separate targets"

requirements-completed: [MIG-03, MIG-04]

coverage:
  - id: D1
    description: "A stack already in the stacks folder under the same name migrates in place: stop, original renamed aside and kept as the backup, new stack built in the original directory from the renamed copy, keptOriginalAt reported"
    requirement: MIG-03
    verification:
      - kind: unit
        ref: "server/test/unit/application/migration-service.test.ts#in-place migration (G-18-7)"
        status: pass
      - kind: unit
        ref: "server/test/unit/domain/migration-target.test.ts#classifyMigrationTarget (G-18-7)"
        status: pass
    human_judgment: false
  - id: D2
    description: "In-place refusals (no stop, invalid/taken aside name, nested overlap) happen before any side effect"
    requirement: MIG-03
    verification:
      - kind: unit
        ref: "server/test/unit/application/migration-service.test.ts#refusals before any side effect"
        status: pass
      - kind: unit
        ref: "shared/test/unit/validation/brownfield.test.ts#stackDirectoryNameSchema (T-18-33)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A failed in-place migration restores the original directory and restarts the old stack, or leaves it untouched with exact manual instructions"
    requirement: MIG-04
    verification:
      - kind: unit
        ref: "server/test/unit/application/migration-service.test.ts#in-place migration (G-18-7) > rollback"
        status: pass
      - kind: unit
        ref: "server/test/unit/infrastructure/volume-migrator.test.ts#moveDirectory"
        status: pass
    human_judgment: false
  - id: D4
    description: "Preview (both route families) takes the stack name and returns the target with a free suggested aside name, refusing what migrate refuses"
    requirement: MIG-03
    verification:
      - kind: unit
        ref: "server/test/unit/application/migration-service.test.ts#previewMigration (MIG-02, D-04, G-18-7)"
        status: pass
      - kind: unit
        ref: "server/test/unit/routes/brownfield-routes.test.ts#preview"
        status: pass
      - kind: integration
        ref: "server/test/integration/imports.test.ts#POST /api/stacks/import/migrate/preview"
        status: unknown
    human_judgment: false

duration: 10min
completed: 2026-10-16
status: complete
---

# Phase 18 Plan 12: In-place migration (G-18-7 server half) Summary

**A stack that already lives in Docktor's stacks folder under the same name now migrates in place: stop, rename the original aside to `<name>-pre-migration` (user-editable) as the kept backup, rebuild in the original path from the renamed copy, with full rename-back rollback and a preview that reports the target.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-10-16
- **Tasks:** 3 (1 tracer + 2 auto, all TDD)
- **Files modified:** 13 (3 created, 10 modified)

## Accomplishments

- Pure `classifyMigrationTarget` replaces the blanket overlap refusal: equal directories are in-place, strict nesting stays a `ConflictError` ("overlap"), siblings behave exactly as before.
- `execute` in-place branch: `oldStack.stop` -> `moveDirectory(original, aside)` -> exclusive create at the original path -> data, compose and `.env` read from the aside directory -> record with `hostPath` = original path; the pre-migration-backup copy is skipped because the renamed original is the backup; result carries `keptOriginalAt`.
- Rollback: new directory removed, original renamed back only into a free path, then the old stack restarted ("The original directory was moved back to ..." + "The old stack was restarted."). If the path is occupied or the rename back fails, nothing is deleted or restarted and the error names the aside directory, the original path and says to move it back by hand.
- Refusals before any side effect: `stopOldStack` false (T-18-35), traversing/invalid/own-name aside name (T-18-33, shared `stackDirectoryNameSchema` at the route and again in preflight), taken aside name (`ConflictError` naming it).
- `previewMigration({composePath, displayName, volumeSelections, namedVolumeSelections})` returns `{diff, extractedEnv, target}`; preview and preflight share `assessTarget`, so they refuse the same ineligible requests.

## Task Commits

1. **Task 1 (tracer): same-name stack migrates in place** - RED `6c17089` (test), GREEN `c84eb55` (feat)
2. **Task 2: in-place refusals and rollback** - RED `9b40aee` (test), GREEN `1ff9706` (feat)
3. **Task 3: preview reports the target; shared schemas** - RED `989a2df` (test), GREEN `d21df09` (feat)

**Plan metadata:** committed separately (docs: complete plan).

## TDD Gate Compliance

All three tasks have a `test(18-12)` commit preceding their `feat(18-12)` commit. No REFACTOR commits (none needed).

- **RED evidence (semantic assessment, vitest default reporter, not machine-classified with `check tdd-red-evidence`):**
  - Task 1: three in-place service tests failed with the old `ConflictError ... overlap` (intended behavior gap); the domain test file failed to load because `migration-target.ts` did not exist (new module, expected).
  - Task 2: ten service tests failed on the intended assertions (missing refusals, old rollback leaving the renamed directory in place); the shared `stackDirectoryNameSchema` tests failed because the export did not exist. The `moveDirectory` adapter tests and the "rename aside itself fails" test were already green (adapter shipped in Task 1; the failure path already restarted the stack), so they are characterization tests, not RED drivers.
  - Task 3: shared/route tests failed on the missing `displayName` requirement and `target`; the preview service tests failed on the changed call shape (an object passed where a path was expected), which is the planned signature change.

## Files Created/Modified

- `server/src/domain/migration-target.ts` - pure `classifyMigrationTarget`, `asideNameCandidates`
- `server/src/application/migration-service.ts` - in-place plan/execute/rollback, `assessTarget`, `planInPlace`, `previewMigration` with target
- `server/src/application/ports/volume-migrator-port.ts`, `server/src/infrastructure/volume-migrator.ts` - `moveDirectory` (no replace)
- `shared/src/validation/brownfield.ts` - `stackDirectoryNameSchema`, `inPlaceAsideName`, preview `displayName`, `migrationTargetSchema`, `MigrationTarget`
- `server/src/routes/imports.ts`, `server/src/routes/setup.ts` - preview passes the validated body with the Map conversion
- Tests: domain, service (in-place, refusals, rollback, preview), adapter (new), shared, routes, imports integration

## Decisions Made

See `key-decisions` above. Additionally: the redundant `displayName` on `migrationExecuteSchema` was dropped because it now extends the preview schema, which carries the identical `z.string().min(1)` (validation behavior unchanged).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Absolute bind-mount sources inside the original directory pointed at a path that no longer exists after the rename**
- **Found during:** Task 1 (designing the aside read path)
- **Issue:** `copyBindMounts` used an absolute `originalPath` verbatim; in place, that path no longer exists after the original is renamed, so `sourceExists` would treat the volume as empty and data would be silently skipped.
- **Fix:** `relocateIntoSource` remaps an absolute source inside the original directory to the aside directory (identity for separate migrations and for sources outside the original directory).
- **Files modified:** `server/src/application/migration-service.ts`
- **Verification:** test "reads an absolute bind-mount source inside the original directory from the renamed directory" (added with the Task 2 RED commit `9b40aee`; passed from Task 1 GREEN since the fix landed there)
- **Committed in:** `c84eb55`

**2. [Rule 3 - Blocking] Routes unit test would hit the database through the real migration service**
- **Found during:** Task 3
- **Issue:** the preview now runs `stackRepo.exists`/`listLocations` and the self-stack lookup; `brownfield-routes.test.ts` deliberately uses the real `migrationService` singleton.
- **Fix:** mocked `stack-repository.js` and `docker-self-stack.js` in that test file (empty store, no self stack); the service preview tests pass a self-stack fake instead of the real docker lookup.
- **Files modified:** `server/test/unit/routes/brownfield-routes.test.ts`, `server/test/unit/application/migration-service.test.ts`
- **Committed in:** `989a2df`

**3. [Rule 2 - Missing critical] Server integration test sends the new required field**
- **Found during:** Task 3
- **Issue:** `server/test/integration/imports.test.ts` posts the preview without `displayName`, which now answers 400.
- **Fix:** added `displayName` to both preview payloads and asserted `target`. Not executed locally (CI only).
- **Committed in:** `d21df09`

---

**Total deviations:** 3 auto-fixed (1 bug, 1 blocking, 1 missing critical)
**Impact on plan:** All necessary for correctness; no scope creep.

## Issues Encountered

None.

## Cross-plan notes

- **Client contract change (consumed by plan 18-15):** `migrationPreviewSchema` now requires `displayName`, so the existing client `previewMigration` calls (`client/src/lib/import-api.ts`, `setup-api.ts`) get a 400 until plan 18-15 sends the stack name. This is the planned contract split (server half here, dialog half in 18-15); the client was intentionally not touched.
- The `Playwright` setup-wizard spec mocks the preview endpoint, so it is unaffected until 18-15.

## Verification

- `node_modules/.bin/tsc --project shared/tsconfig.json` (rebuilt shared) - ok
- `shared`: `brownfield.test.ts` - 55 passed
- `server` unit: `migration-target`, `migration-service`, `volume-migrator`, `brownfield-routes`, `shared-schema-parity`, `layering` - 282 passed
- `cd server && tsc --noEmit -p .` - zero errors
- All acceptance-criteria greps from the plan pass (counts match or exceed the stated minimums).
- **Left for CI (per the VPS resource rule):** full `tsc --build`, server integration (`imports.test.ts` updated but not run), Windows unit job (the classifier uses host-native paths like the check it replaces), Playwright.

## Known Stubs

None.

## Threat Flags

None beyond the plan's `<threat_model>`: T-18-33 (aside-name traversal) mitigated by `stackDirectoryNameSchema` at the route and in preflight plus the sibling-only path construction; T-18-34 (rename data loss) mitigated by `moveDirectory` never replacing, exclusive create, conditional rename-back and no deletion of the original; T-18-35 (forced stop) mitigated by the explicit `BadRequestError`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 18-13/18-14/18-15: the preview returns `target`, the execute body accepts `inPlaceAsideName`, and the result reports `keptOriginalAt`. Plan 18-15 must send `displayName` with the preview request and read `target`.

## Self-Check: PASSED

- Created files exist: `server/src/domain/migration-target.ts`, `server/test/unit/domain/migration-target.test.ts`, `server/test/unit/infrastructure/volume-migrator.test.ts`.
- Task commits `6c17089`, `c84eb55`, `9b40aee`, `1ff9706`, `989a2df`, `d21df09` are ancestors of HEAD.

---
*Phase: 18-import-and-migration-flow*
*Completed: 2026-10-16*
