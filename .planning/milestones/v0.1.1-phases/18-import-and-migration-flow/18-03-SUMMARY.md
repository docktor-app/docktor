---
phase: 18-import-and-migration-flow
plan: 03
subsystem: api
tags: [migration, docker-compose, zod, rollback, ports-and-adapters, vitest]

requires:
  - phase: 18-import-and-migration-flow
    provides: plan 18-02 shared brownfield schemas and migrate handlers that spread the validated body into the service
provides:
  - migrationExecuteSchema with required backup and stopOldStack booleans (no defaults)
  - ExternalStackControlPort and execFile adapter (docker compose -f <path> stop/start)
  - MigrationService.migrate honouring both choices with a non-destructive rollback
  - Target-directory guards (existing / overlapping) enforced before any side effect
affects: [18-05, import-flow, setup-wizard]

status: complete
plan_head_before: 0db6806f31ac0b3bb14b2eceb5ee8fd091237b44
plan_head_after: 0493d41ed802aba33a1abced3f74018db6fffa7b

actuals:
  tokens: 11400
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Injectable ComposeCommandRunner (argv-only execFile) for testing docker shell-outs without mocking child_process"
    - "Rollback tracks what Docktor itself did (oldStackStopped, createdStackDir) and undoes only that"
    - "Pre-flight target guards return a failure result before any side effect"

key-files:
  created:
    - server/src/application/ports/external-stack-control-port.ts
    - server/src/infrastructure/external-stack-control.ts
    - server/test/unit/infrastructure/external-stack-control.test.ts
  modified:
    - shared/src/validation/brownfield.ts
    - shared/test/unit/validation/brownfield.test.ts
    - server/src/application/migration-service.ts
    - server/test/unit/application/migration-service.test.ts
    - server/test/unit/routes/brownfield-routes.test.ts
    - server/test/integration/imports.test.ts
    - docs/design.md

key-decisions:
  - "backup and stopOldStack are required with no schema default so an old client cannot let the server choose (D-12)"
  - "A failed stop aborts the migration fail-closed; nothing is created (orchestrator decision 2)"
  - "docker.up(stackId) is unchanged in both stop/no-stop cases; a port clash surfaces as a compose error and triggers rollback (orchestrator decision 1)"
  - "Rollback restarts the old stack with docker compose start only, never the recreate-capable up (RESEARCH Pitfall 2)"
  - "Absolute bind-mount sources through /host (Pitfall 5) stay out of scope"

patterns-established:
  - "Application layer no longer shells out; docker interactions go through ports"

requirements-completed: [MIG-03, MIG-04]

coverage:
  - id: D1
    description: "Both migrate endpoints reject a body missing backup or stopOldStack with 400 and never call the service; both flags are forwarded unchanged"
    requirement: MIG-03
    verification:
      - kind: unit
        ref: "server/test/unit/routes/brownfield-routes.test.ts#rejects a body without %s with 400 and never migrates (D-12)"
        status: pass
      - kind: unit
        ref: "shared/test/unit/validation/brownfield.test.ts#migrationExecuteSchema"
        status: pass
    human_judgment: false
  - id: D2
    description: "backup true copies the old directory to pre-migration-backup/ inside the new stack (also without rename) and keeps it after success; backup false creates none and nothing is written to the OS temp directory"
    requirement: MIG-03
    verification:
      - kind: unit
        ref: "server/test/unit/application/migration-service.test.ts#keeps a real copy of the old directory in pre-migration-backup/ after success (D-08)"
        status: pass
      - kind: unit
        ref: "server/test/unit/application/migration-service.test.ts#creates no backup when backup is false (MIG-03, D-07)"
        status: pass
    human_judgment: false
  - id: D3
    description: "stopOldStack true stops the old stack (docker compose stop, exact argv/cwd/timeout) before any directory is created; false never stops or starts it; a failed stop aborts fail-closed"
    requirement: MIG-04
    verification:
      - kind: unit
        ref: "server/test/unit/application/migration-service.test.ts#stops the old stack before creating anything and keeps the backup copy (D-07, D-10)"
        status: pass
      - kind: unit
        ref: "server/test/unit/infrastructure/external-stack-control.test.ts#ExternalStackControl"
        status: pass
    human_judgment: false
  - id: D4
    description: "Rollback removes only the directory and record Docktor created, restarts the old stack only if Docktor stopped it, never modifies the original directory; existing or overlapping targets are refused before any side effect"
    requirement: MIG-04
    verification:
      - kind: unit
        ref: "server/test/unit/application/migration-service.test.ts#rolls back without touching the original directory and restarts the stack it stopped (D-09, D-11)"
        status: pass
      - kind: unit
        ref: "server/test/unit/application/migration-service.test.ts#refuses a target directory that already exists before anything is stopped or created (D-09)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Integration contract: preview returns the UnifiedDiff shape and migrate without backup returns 400 against the real app and database"
    requirement: MIG-03
    verification:
      - kind: integration
        ref: "server/test/integration/imports.test.ts (CI only, not run locally)"
        status: pending
    human_judgment: true
    rationale: "Integration suite is not run on the VPS (project rule); CI must be green before /gsd-verify-work"
---

# Phase 18 Plan 03: Migrate backup and stop-old-stack choices Summary

**MigrationService.migrate now does exactly what the user chose: an optional `pre-migration-backup/` copy kept inside the new stack, an optional `docker compose stop` of the old stack before anything is copied (via a new ExternalStackControlPort), and a rollback that never touches the original directory.**

## Performance

- **Duration:** about 4 min (2026-10-15T07:16Z to 07:20Z)
- **Tasks:** 3 (one tracer, two auto; two TDD cycles)
- **Files:** 10 modified or created

## Accomplishments

- `migrationExecuteSchema` requires explicit `backup` and `stopOldStack` booleans; both route families (spread body from 18-02) reject omissions with 400 and forward the flags unchanged, with no route edits needed.
- New `ExternalStackControlPort` and `ExternalStackControl` adapter: argv-only `execFile("docker", ["compose","-f",path,"stop"|"start"])`, cwd = compose directory, 120 s timeout, injectable runner, failures wrapped in `AppError` with stderr and `cause`.
- `migrate()` order is now stop (optional) -> create -> backup (optional) -> copy -> rewrite -> record -> deploy. The OS-temp backup, the destructive delete-and-restore of the original directory, the swallowed best-effort stop and the two spawn-based helpers (plus the `node:child_process`/`node:os` imports) are gone.
- Rollback removes only a directory created in this run (`createdStackDir`), deletes the record, and restarts with `docker compose start` only if Docktor stopped the stack (`oldStackStopped`, set before the call so a partial stop is undone). The error text tells the user whether the old stack was restarted or how to restart it manually.
- Pre-flight guard refuses a target directory that already exists or overlaps the old directory before anything is stopped or created (D-09, Pitfall 4).
- `docs/design.md` Import Modes items 1 and 3 describe the excluded own stack, the four-step dialog and the non-destructive rollback. CI integration cases cover the preview shape and the mandatory flag.

## Task Commits

1. **Task 1 (tracer) RED:** `78187d2` test(18-03): pin migrate backup/stop flags, kept backup and non-destructive rollback
2. **Task 1 (tracer) GREEN:** `1d2cbab` feat(18-03): honour backup and stopOldStack in migrate with non-destructive rollback
3. **Task 2 RED:** `ded01d5` test(18-03): pin failure, opt-out and target-guard semantics and docker argv
4. **Task 2 GREEN:** `69ec901` feat(18-03): refuse unsafe target directories and wrap docker compose failures
5. **Task 3:** `0493d41` docs(18-03): contract-test migrate request shapes and document the new migration flow

Tracer gate: `<verify>` is automated-only and was re-run after the tracer commit (migration-service, route, shared-schema-parity and layering tests, 203 passing); verified end-to-end, then expanded.

## Deviations from Plan

None to the plan's contract. Process notes:

- The shared `migrationExecuteSchema` tests listed under Task 2 passed immediately because the schema fields landed in Task 1's feat commit (the plan puts the schema change in Task 1, the schema tests in Task 2). The service, adapter and route cases did have genuine RED runs (5 failures before `69ec901`; 9 before `1d2cbab`).
- Verification ran with `tsc --project shared/tsconfig.json` and the targeted vitest invocation instead of `yarn workspace ... build` (yarn is not on PATH on this host).

## Verification

- Targeted unit run (server): migration-service, external-stack-control, brownfield-routes, shared-schema-parity, layering: 5 files, 218 tests passed.
- Shared: `test/unit/validation/brownfield.test.ts` 25 tests passed.
- All Task 1, 2 and 3 acceptance greps pass (no child_process/os/tmpdir/spawn/`rm(originalDir` in the service; `this.oldStack.stop/start(composePath)` once each; CR-02 `VOLUME_NAME_PATTERN` and `assertWithin` intact; no `"up"` or `shell: true` in the adapter; docs and integration greps).
- **Deferred to CI (project rule: no heavy local actions on the VPS):** repo-wide `tsc --build` type-check, `yarn workspace @docktor/server test:integration` (Task 3 cases), the Windows unit job. Recorded as an `unrun-verify` entry in `.planning/WINDOWS.md`.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-18-08 (argv-only, no shell, exact argv pinned by test), T-18-09 (non-destructive rollback, target guards), T-18-10 (CR-02 regression tests) and T-18-12 (120 s timeout, fail-closed stop) are mitigated as planned.

## Issues Encountered / Follow-ups

- **Client is now out of sync until plan 18-05:** `client/src/lib/import-api.ts` and `client/src/lib/setup-api.ts` `executeMigration` still send bodies without `backup` and `stopOldStack`, so the existing migration dialog's confirm gets a 400 until 18-05 adds the Back Up and Old Stack steps. This is the intended D-12 contract change; the client was outside this plan's `files_modified`.
- Known limitations carried from the plan: absolute bind-mount sources read through `/host` (Pitfall 5), and `docker compose -f <file> stop` matching nothing for stacks started with a custom `-p` project name (T-18-13). Recommend one GitHub issue (area:server, type Bug) covering both after the phase.
- The new "target already exists" guard is stricter than before: a pre-existing directory at `<stacks>/<slug>` now blocks migration rather than being reused.

## Next Phase Readiness

Ready for 18-05 (dialog steps send `backup` and `stopOldStack`). CI must be green (typecheck, integration, Windows unit) before `/gsd-verify-work`.

## Self-Check: PASSED

- Created files present: external-stack-control-port.ts, external-stack-control.ts, external-stack-control.test.ts.
- Commits present on HEAD: 78187d2, 1d2cbab, ded01d5, 69ec901, 0493d41.
- Commit count measured from the ledger: 5 (`plan_head_before` 0db6806, `plan_head_after` 0493d41).
