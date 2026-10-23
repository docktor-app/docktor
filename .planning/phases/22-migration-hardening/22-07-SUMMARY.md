---
phase: 22-migration-hardening
plan: 07
subsystem: migration
tags: [rollback, ledger, compose, issue-100, issue-102, issue-108, D-07, MIG-08, MIG-12]

requires:
  - phase: 22-migration-hardening
    provides: 22-03 (rollback report schema, rolled_back status, step enum), 22-04 (verified stop, ComposeProjectTarget, runningServices, stillRunning), 22-06 (backup after the verified stop)
provides:
  - "shared migrationLedgerEntrySchema and MigrationLedgerEntry (five kinds), the journal plan 22-08 persists"
  - "domain/migration-rollback.ts: MigrationLedger, InMemoryMigrationLedger, compensationOrder, allServicesRunning, RESTART_VERIFY_TIMEOUT_MS (90000), RESTART_VERIFY_INTERVAL_MS (2000)"
  - "MigrationRollbackRunner: undoes the ledger in reverse, verifies the restart through listContainers, reports MigrationRollbackOutcome {report, restartError?}"
  - "DockerExecutorPort.downKeepVolumes and up(stackId, {removeOrphans?}); the migration deploy removes no orphans"
  - "ExternalStackControlPort.restoreServices (up -d --no-build for the listed services) for same-project restores"
  - "MigrationService.execute(plan, {onProgress, ledger}), MigrationResult.rollback, MigrationPlan.sharesProjectWithNewStack, injected logger/sleep/now"
  - "migration-progress.ts: MigrationProgressListener, MigrationLogger, reportMigrationProgress, errorMessage"
affects: [22-08]

actuals:
  tokens: 36500
  tasks: 3
  commits: 7
plan_head_before: cb8be64d81e5ede1535041203e5e1d7304babdbd
plan_head_after: 45b02aca49ed5fc61b8fb741aed01fb2aa2aa83a

tech-stack:
  added: []
  patterns:
    - "Rollback ledger: every side effect is journalled, compensation walks the entries in reverse, and the report states only what was verified"
    - "Verified restart: restored-running only after listContainers saw every previously running service running; fake now/sleep make the 90 s wait testable in milliseconds"
    - "Narrow Pick-typed runner dependencies: the volume-deleting down is not a dependency of the rollback, so it is unreachable from it by construction"

key-files:
  created:
    - server/src/domain/migration-rollback.ts
    - server/src/application/migration-rollback-runner.ts
    - server/src/application/migration-progress.ts
    - server/test/unit/domain/migration-rollback.test.ts
    - server/test/unit/application/migration-rollback-runner.test.ts
  modified:
    - shared/src/validation/migration-operation.ts
    - shared/test/unit/validation/migration-operation.test.ts
    - server/src/application/migration-service.ts
    - server/src/application/migration-operation-service.ts
    - server/src/application/ports/docker-executor-port.ts
    - server/src/infrastructure/docker-executor.ts
    - server/src/application/ports/external-stack-control-port.ts
    - server/src/infrastructure/external-stack-control.ts
    - server/test/unit/application/migration-service.test.ts
    - server/test/unit/application/migration-operation-service.test.ts
    - server/test/unit/infrastructure/docker-executor.test.ts
    - server/test/unit/infrastructure/external-stack-control.test.ts
    - server/test/unit/routes/brownfield-routes.test.ts

key-decisions:
  - "Ledger entries are recorded before the stop and the deploy (a partial stop or a half-deployed project must still be undone) and after the rename, directory and record (nothing foreign is ever undone); a failed exclusive mkdir records nothing, so a foreign directory is never removed"
  - "A stop with nothing running records no stopped_old_stack entry; the report then says not-stopped"
  - "The failure error is `Migration failed: <message>` plus `Restarting the old stack failed: <error>.` only when the start command itself failed; every outcome claim lives in the verified rollback report, never in the error text"
  - "restoreServices instead of start only when the project was shared and a deploy_started entry exists: the keep-volumes down then removed the old containers too, so start would find nothing to start"
  - "The runner takes only docker.downKeepVolumes, never the volume-deleting down (T-22-19)"
  - "Cleanup errors in the rollback report are masked like the error text before they are stored or broadcast"

patterns-established:
  - "Injected `Console`-shaped logger as the convention until structured logging (#70) lands (#108)"

requirements-completed: [MIG-08, MIG-12]

coverage:
  - id: D1
    description: "A failed migration undoes exactly what the run did, in reverse order, from a ledger (record, new directory, in-place rename, stopped old stack)"
    requirement: MIG-08
    verification:
      - kind: unit
        ref: "server/test/unit/domain/migration-rollback.test.ts; server/test/unit/application/migration-rollback-runner.test.ts; server/test/unit/application/migration-service.test.ts (the rollback ledger, in-place rollback)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The rollback never deletes a volume: a failed deploy is followed by a keep-volumes down before the directory is removed, the deploy removes no orphans, and the volume-deleting down is never called"
    requirement: MIG-08
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/docker-executor.test.ts (downKeepVolumes exact argv, up without orphans); migration-rollback-runner.test.ts (a deploy that started); migration-service.test.ts (takes a failed deploy down keeping volumes)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Only previously running services are restarted and the result says restored-running only when listContainers saw them running; restart-unverified after the timeout, restart-failed when the command fails (D-07)"
    requirement: MIG-12
    verification:
      - kind: unit
        ref: "server/test/unit/application/migration-rollback-runner.test.ts (waits until the services are seen running, restart-unverified, restart-failed)"
        status: pass
    human_judgment: false
  - id: D4
    description: "In place or under a shared project name, the original stack is brought back from its restored files with restoreServices (up -d --no-build, no orphan/volume/image removal) instead of starting containers the deploy recreated"
    requirement: MIG-08
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/external-stack-control.test.ts (restoreServices); migration-rollback-runner.test.ts (a project the new stack shared); migration-service.test.ts (in-place deploy failure order, shared project name)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Cleanup failures go through the injected logger and are listed in the result; a restored-running report ends the operation rolled_back and any unverified one ends it failed"
    requirement: MIG-12
    verification:
      - kind: unit
        ref: "server/test/unit/application/migration-service.test.ts (lists a failing cleanup, never logs through the console); migration-operation-service.test.ts (the rollback report decides the final status)"
        status: pass
    human_judgment: false
  - id: D6
    description: "A real docker compose down / up -d --no-build rollback against a live daemon behaves as the argv-level unit fakes assume"
    requirement: MIG-08
    verification: []
    human_judgment: true
    rationale: "Only GitHub Actions (collision-proof random project name, STATE.md rule) can exercise real compose; the VPS rule forbids Docker-heavy local actions, so the unit tests assert exact argv and call order through fakes"

duration: 17 min
completed: 2026-10-22
status: complete
---

# Phase 22 Plan 07: Rollback ledger with verified restart Summary

**A failed migration is now undone from a ledger in reverse order: a failed deploy is taken down keeping volumes before its directory goes, the original directory is renamed back only into a free path, and the old stack counts as restored only after its previously running services were seen running (restore from the restored files when the new stack shared its compose project), with cleanup errors logged and surfaced and the operation ending rolled_back or failed accordingly (#100, #102, #108, D-07).**

## Performance

- **Duration:** 17 min
- **Completed:** 2026-10-22T18:38:00Z
- **Tasks:** 3 (all TDD: RED commit then GREEN commit each; Task 1 is the tracer, its shared schema commit comes first)
- **Commits:** 7 (measured from the plan ledger: `plan_head_before..HEAD`)
- **Files:** 18 changed in the plan range (5 created, 13 modified)

## Accomplishments

- **Tracer (Task 1).** `execute` records `stopped_old_stack` (before the stop, with `runningBefore` and `sharesProjectWithNewStack`), `moved_aside`, `created_directory` and `created_record` (after they exist) in a `MigrationLedger` and its catch path hands the entries to `MigrationRollbackRunner.run`. The runner walks `compensationOrder`: record delete, directory removal, rename back (only into a free path, else `left-aside` with `keptOriginalAt` and the stopped stack left alone), then `start` of exactly the services that ran and a poll of `listContainers` every 2 s up to 90 s. Outcomes: `restored-running`, `restart-unverified`, `restart-failed` (with `restartError`), `left-stopped`, `not-stopped`. Cleanup failures are logged through the injected logger and listed as `"<what>: <message>"` while the remaining steps still run. `MigrationOperationService` maps `rollback` (masking the cleanup errors) so `migrationOperationStatusOf` yields `rolled_back` or `failed`. The four flags, `moveOriginalBack` and `restartOldStack` are gone, and `migration-service.ts` no longer touches `console`.
- **Keep-volumes down, no orphans (Task 2).** `DockerExecutorPort.downKeepVolumes` runs exactly `["compose","down"]`; `up(stackId, {removeOrphans: false})` runs `["compose","up","-d"]` and the migration deploy uses it (Pitfall 12). `deploy_started` is recorded before the deploy; reverse order puts its `downKeepVolumes` before the directory removal. The runner's `docker` dependency is `Pick<DockerExecutorPort, "downKeepVolumes">`, so the `down -v` is unreachable from a rollback.
- **Same-project restore (Task 3).** `ExternalStackControlPort.restoreServices` runs `["compose","-p",project,"-f",composePath,"up","-d","--no-build",...services]` (timeout scaled by service count, AppError-with-cause wrapping). The runner uses it instead of `start` when the entry shares the project and a `deploy_started` entry exists. In place, a deploy failure yields `downKeepVolumes`, `removeDirectory`, `moveDirectory` back, `restoreServices` and `{oldStack: "restored-running", original: "restored"}` (#100 AC2).

## Task Commits

1. Task 1 schema: `0bbc609` rollback ledger entry schema
2. Task 1 RED: `59c1333` failing tests for the ledger and the verified-restart runner
3. Task 1 GREEN: `704d657` roll back from a ledger and report only what was verified
4. Task 2 RED: `6fa22b2` failing tests for the keep-volumes down and the deploy without orphan removal
5. Task 2 GREEN: `0d4f290` keep-volumes down for a failed deploy, deploy without orphan removal
6. Task 3 RED: `82bb5ac` failing tests for the same-project restore
7. Task 3 GREEN: `45b02ac` restore the original stack from its restored files for a shared project

**Plan metadata:** the docs commit of this SUMMARY with STATE.md, ROADMAP.md and REQUIREMENTS.md.

## RED evidence (semantic assessment)

- Task 1: the domain and runner tests failed at module resolution (`migration-rollback.ts` and the runner did not exist; the RED commit holds only tests, so there is no stub to turn that into an assertion failure). The shared schema tests and the service/operation-service test edits were written alongside their implementation (the schema is a few lines), so they have no separate RED.
- Task 2 and 3: failed on the planned assertions (`downKeepVolumes is not a function`, `restoreServices is not a function`, argv without the new commands, call order of down versus removeDirectory, `start` called where `restoreServices` is expected).
- The formal `gsd_run check tdd-red-evidence` record was not produced (tasks are `tdd="true"` inside a non-`type: tdd` plan, gate enforcement is off).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] migration-progress.ts extracted**
- **Found during:** Task 1
- **Issue:** The runner needs the same progress-listener-safe reporting as `MigrationService.report` and the `MigrationProgressListener` type; importing it from `migration-service.ts` would make the service and the runner import each other.
- **Fix:** New `application/migration-progress.ts` holds `MigrationProgressListener`, `MigrationLogger`, `reportMigrationProgress` and `errorMessage`; `migration-service.ts` re-exports the listener type so every existing import keeps working.
- **Committed in:** 704d657

**2. [Rule 3 - Blocking] Runner dependency `pathTaken`, and `now` in milliseconds**
- **Issue:** The "rename back only into a free path" check was a module-private `fs.lstat` helper of the service; the runner needs it and the tests must control it. `now` is typed `() => number` (default `Date.now`) rather than a `Date`, which is all a deadline needs.
- **Fix:** The runner takes `pathTaken` as a dependency; the service passes its existing `pathIsTaken`.
- **Committed in:** 704d657

**3. [Rule 2 - Missing critical] Rollback cleanup errors are masked**
- **Issue:** The plan maps `rollback` through unchanged, but the cleanup errors are filesystem and database messages that can echo credentials, exactly like the masked `error`.
- **Fix:** `toOperationResult` masks every `cleanupErrors` entry with `maskSecrets` (test included).
- **Committed in:** 704d657

**4. [Rule 1 - Bug] preflight computed the shared project name only when the stop was off**
- **Issue:** `sharesProjectWithNewStack` needs `sharedProjectName` for every request, but it was computed only inside the `!stopOldStack` refusal.
- **Fix:** Computed once; the refusal is unchanged.
- **Committed in:** 704d657

**5. [Rule 3 - Blocking] Stale `MigrationPlan` literals fixed in the tests this plan touches**
- **Issue:** `migration-operation-service.test.ts` and `brownfield-routes.test.ts` built plans without `oldProject`, `bindCopies`, `homeSources` (the server tsconfig excludes tests, so nothing caught it) and now `sharesProjectWithNewStack`.
- **Fix:** Both literals are complete; the operation-service test's `execute` mock takes the new options object. Other test files that build plan literals through `preflight` needed no change.
- **Committed in:** 704d657

**6. [Rule 3 - Blocking] Existing rollback assertions replaced**
- **Issue:** The old tests asserted the narrated error text ("A restart of the old stack's services ... was requested", "Your original stack directory was not modified", "by hand"). That wording is deliberately gone (D-07); the same facts are asserted on `result.rollback`. The fake project in the service test now reports the services running again after `start`/`restoreServices`, and the test injects a fake clock so the verification wait never sleeps for real.

### Deliberate behaviour notes

- **Edge: a stopped container without a compose service label** is not in `runningBefore`; if it were the only one, the report says `not-stopped` although a stop ran. Compose labels every container it creates, so this is a theoretical gap (the entry is recorded whenever anything was running, the runner cannot restart an unlabeled container anyway).
- **Lint-level leftover not fixed (out of scope):** `migration-operation-service.test.ts` line 84 has a pre-existing mock typing error (`emit` fake versus the generic `EventBusPort.emit`), visible only when type-checking tests, which the server tsconfig excludes.
- The `down` that deletes volumes stays on `DockerExecutorPort` for `StackService.delete`; only the runner's dependency type excludes it.

**Total deviations:** 6 auto-fixed (1 Rule 1, 1 Rule 2, 4 Rule 3). **Impact:** none on scope or the plan's contracts; the new file and the injected `pathTaken` are internal seams.

## Issues Encountered

- Per the user's memory rule, no full `tsc --build`, integration, Playwright or full suites were run locally. Run instead: targeted vitest (shared migration-operation; server unit: domain, application migration/stack/backup, infrastructure docker-executor and external-stack-control, routes brownfield, architecture layering; 36 files, 1081 tests green in the last combined run), `corepack yarn workspace @docktor/shared build`, `tsc --noEmit -p server` (zero errors, about 23 s) and a scratchpad tsconfig type-checking the new and edited test files (only the pre-existing `emit` error above remains). `yarn typecheck` across all workspaces, the full server suite and any real-Docker rollback run are left to GitHub Actions CI.

## Known Stubs

None.

## Threat Flags

None. The new surface (`docker compose down`, `up -d --no-build <services>`) is exactly T-22-19 in the plan's register, with exact-argv tests asserting no `-v`, `--volumes`, `--rmi`, `--remove-orphans`, `--force-recreate` or `--build`.

## Verification

- Task 1 verify (shared build, shared migration-operation, server rollback domain/runner, migration-service, operation-service, migration-operation domain): pass (304 tests with the routes suite).
- Task 2 verify (docker-executor, runner, migration-service, stack-service): pass.
- Task 3 verify (external-stack-control, runner, migration-service): pass (229 tests).
- Acceptance greps: `rollback.run(` in the service 1, `private async (moveOriginalBack|restartOldStack)` 0, non-comment `console.` in the service 0, `migrationLedgerEntrySchema` in shared 2, `downKeepVolumes` in port/adapter/runner 1/1/2, `removeOrphans: false` in the service 1, `restoreServices` in port/adapter/runner 2/1/2, `"--no-build"` in the adapter 1.
- CI-only: `yarn typecheck`, the full server suite, real-Docker rollback behaviour with a collision-proof random project name.

## Self-Check: PASSED

## Next Phase Readiness

- Ready for 22-08 (restart recovery). `execute(plan, {ledger})` accepts a `MigrationLedger`, whose `record` is awaited before the next side effect, so a durable ledger that persists each entry plugs in without touching the service. `MigrationLedgerEntry` (shared) is the persisted shape; `MigrationRollbackRunner.run(entries, {onProgress})` can replay a persisted ledger after a restart (it takes `RollbackState.deployStarted` from the entries themselves). The deploy is recorded before it starts, so a crash mid-deploy leaves a `deploy_started` entry that the replay compensates with the keep-volumes down.

---
*Phase: 22-migration-hardening*
*Completed: 2026-10-22*
