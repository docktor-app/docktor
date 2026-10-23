---
phase: 22-migration-hardening
plan: 08
subsystem: migration
tags: [journal, restart-recovery, rollback, boot, changelog, issue-100, issue-105, D-06, MIG-08, MIG-11]

requires:
  - phase: 22-migration-hardening
    provides: 22-07 (MigrationLedger, MigrationRollbackRunner, execute(plan, {ledger})), 22-03 (rolled_back status, rolling_back step, rollback report), 22-02 (maskSecrets through toOperationResult)
provides:
  - "shared migrationJournalSchema, MigrationJournalDocument and MIGRATION_JOURNAL_ID_PATTERN (versioned on-disk journal format)"
  - "MigrationJournalPort and the file adapter MigrationJournal (singleton migrationJournal) under <stacks>/.docktor/migration-journal"
  - "JournaledMigrationLedger: every ledger entry is on disk before record resolves"
  - "MigrationService.rollbackInterrupted: the failed-step rollback runner replayed on a journalled ledger"
  - "MigrationOperationService.recoverInterrupted(documents) -> {count, run}, MigrationRecovery type"
  - "MigrationRecoveryService.prepare() and singleton migrationRecoveryService; boot wiring in index.ts"
  - "CHANGELOG.md [Unreleased] for all of Phase 22"
affects: [phase-22-verification, phase-24]

actuals:
  tokens: 19000
  tasks: 2
  commits: 6
plan_head_before: c9482829dbba7d5c5e8615b54f051af461344b7e
plan_head_after: afc90476f80e2acb393b8ffe1e6ef7b7e84898b2

tech-stack:
  added: []
  patterns:
    - "Write-ahead journal: the entry is held in memory first and persisted before record resolves, so a failed write stops the next side effect while an entry recorded after its side effect is still rolled back in this process"
    - "Atomic journal file: temporary file in the same directory (wx, 0600, fsync), then rename; the directory is 0700 and evaluated per call"
    - "Two-phase boot recovery: prepare() (reads files, registers operations, locks keys) before listen, run() (Docker and filesystem work) after listen and never awaited"
    - "One in-flight key definition (inFlightKeys) shared by start and recovery"

key-files:
  created:
    - server/src/application/ports/migration-journal-port.ts
    - server/src/infrastructure/migration-journal.ts
    - server/src/application/journaled-migration-ledger.ts
    - server/src/application/migration-recovery-service.ts
    - server/test/unit/infrastructure/migration-journal.test.ts
    - server/test/unit/application/journaled-migration-ledger.test.ts
    - server/test/unit/application/migration-recovery-service.test.ts
  modified:
    - shared/src/validation/migration-operation.ts
    - shared/test/unit/validation/migration-operation.test.ts
    - server/src/application/migration-operation-service.ts
    - server/src/application/migration-service.ts
    - server/src/index.ts
    - server/test/unit/application/migration-operation-service.test.ts
    - server/test/unit/application/migration-service.test.ts
    - CHANGELOG.md

key-decisions:
  - "The journal document stores the started operation snapshot (not each step): recovery resets it to running at rolling_back, so the step history is not needed on disk and a write per progress event is avoided"
  - "The journal is removed before the finished operation is saved, so a crash in between can never replay a rollback that already ran; a rollback that throws also removes the journal (a second boot must not re-run a half-done rollback), and the failed operation carries the reason"
  - "A journal file is only valid when its name equals its operation id; anything else (unparsable, wrong version, mismatched name) is renamed to <name>.invalid and reported"
  - "Recovery says 'was rolled back' only when the rollback report verified it; otherwise the error text says it was rolled back as far as Docktor could verify and names the restart error (D-07)"
  - "A failed first journal write finishes the operation as failed with 'Migration not started: ...' before any step runs"

patterns-established:
  - "Recovery entry points never reject; failures are logged with a [migration-recovery] prefix"

requirements-completed: [MIG-08, MIG-11]

coverage:
  - id: D1
    description: "Every migration writes a durable, atomically replaced journal (operation, original directory, ledger) before each destructive step and removes it when the migration ends; a step whose journal write fails never runs"
    requirement: MIG-08
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/migration-journal.test.ts; server/test/unit/application/journaled-migration-ledger.test.ts; server/test/unit/application/migration-operation-service.test.ts (the migration journal (D-06))"
        status: pass
    human_judgment: false
  - id: D2
    description: "On boot an unfinished journal is found, the operation shows as rolling back under the same id, the same runner as a failed step rolls it back (never down -v, never deleting volumes), and the operation ends rolled_back or failed with the verified report"
    requirement: MIG-08
    verification:
      - kind: unit
        ref: "server/test/unit/application/migration-operation-service.test.ts (recoverInterrupted); migration-service.test.ts (rollbackInterrupted); migration-recovery-service.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "A client following a migration before the restart finds the recovered operation under the same id, so its toast ends in a terminal state"
    requirement: MIG-11
    verification:
      - kind: unit
        ref: "server/test/unit/application/migration-operation-service.test.ts (registers each document as running at step rolling_back under the same id and publishes it)"
        status: pass
    human_judgment: false
  - id: D4
    description: "No new migration of the same stack or compose file starts while recovery runs; an unreadable journal is set aside and logged; recovery never delays or breaks the HTTP server start"
    requirement: MIG-08
    verification:
      - kind: unit
        ref: "migration-operation-service.test.ts (refuses a new start ... until the recovery ended); migration-recovery-service.test.ts (never rejects); server/test/unit/architecture/layering.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "CHANGELOG.md [Unreleased] lists the Phase 22 changes with issue links including the compose environment allowlist and the ${VAR} rule"
    requirement: MIG-08
    verification:
      - kind: other
        ref: "grep -cE 'issues/(100|101|102|103|104|105|107|108|109)\\)' CHANGELOG.md returns 13 (at least 9 required)"
        status: pass
    human_judgment: false
  - id: D6
    description: "A real Docktor restart in the middle of a real compose migration restores the original stack from the journal on a live Docker daemon"
    requirement: MIG-08
    verification: []
    human_judgment: true
    rationale: "Only GitHub Actions (collision-proof random project name) can run real Docker and kill the process mid-migration; the VPS rule forbids Docker-heavy local actions, so unit tests assert the journal, the runner call and the ordering through fakes and a real temporary directory"

duration: 11 min
completed: 2026-10-23
status: complete
---

# Phase 22 Plan 08: Migration journal and boot recovery Summary

**Every migration now keeps a write-ahead journal (operation, original directory, ledger) in `<stacks>/.docktor/migration-journal`, and on boot Docktor rolls an interrupted migration back with the same runner a failed step uses, restarts the original stack and finishes the operation as rolled back or failed under its original id, with the Phase 22 changelog written (#100, #105, D-06).**

## Performance

- **Duration:** 11 min
- **Started:** 2026-10-23T06:55:00Z (approximate; the start time was not captured at spawn)
- **Completed:** 2026-10-23T07:08:00Z
- **Tasks:** 2 (both TDD; Task 1 is the tracer)
- **Commits:** 6 (measured from the plan ledger: `plan_head_before..HEAD`)
- **Files:** 15 changed in the plan range (7 created, 8 modified)

## Accomplishments

- **Tracer (Task 1).** `migrationJournalSchema` (`version: 1`, operation with an id limited to `[A-Za-z0-9-]{1,64}`, `originalDir`, ledger). `MigrationJournal` writes `<id>.json` through a temporary file in the same directory (`wx`, mode 0600, fsync) and a rename, creates the directory with mode 0700, validates the id before any path join (T-22-22) and wraps filesystem failures in `AppError` with `cause`. `list()` returns valid documents, renames unparsable, schema-invalid or wrongly named files to `<name>.invalid` and reports them, ignores temporary files, and returns empty lists for a missing directory. `JournaledMigrationLedger` keeps the entry in memory, then writes the whole document before `record` resolves. `MigrationOperationService.run` writes the journal before `execute`, passes the ledger, removes the journal before the finished operation is saved, and finishes the operation failed ("Migration not started: the migration journal could not be written: ...") without executing when the first write fails.
- **Recovery (Task 2).** `MigrationService.rollbackInterrupted` delegates to the 22-07 runner. `recoverInterrupted(documents)` synchronously registers each operation as running at `rolling_back` under its own id (emitted through `save`), holds its `stack:` and `compose:` keys through the shared `inFlightKeys` helper (a concurrent `start` gets `ConflictError`), and its `run()` rolls the documents back one after another, removes each journal before publishing the finished operation, releases the keys and never rejects. `MigrationRecoveryService.prepare()` logs invalid journals with the `[migration-recovery]` prefix, returns a no-op when nothing is journalled or listing fails, and never rejects. `index.ts` prepares after `buildApp` and before `listen` (dynamic import, so the static graph keeps clear of `lib/auth.ts`), and starts `run()` after a successful listen without awaiting it.
- **Changelog.** `[Unreleased]` has Changed entries (compose environment allowlist and `${VAR}` rule #109, backup after the verified stop with selected bind sources and the free-space check #107, masked compose diffs #103) and Fixed entries for #102, #101, #104, #100 (verified rollback and restart recovery), #105, #103, #108 and #109 (ownership verified in a Linux root CI job), 13 issue-link lines in total.

## Task Commits

1. Task 1 schema: `492e156` versioned journal document schema
2. Task 1 RED: `5375625` failing tests for the journal and the journaled ledger
3. Task 1 GREEN: `1f6f0ef` journal every migration before each destructive step, remove it when it ends
4. Task 2 RED: `191006d` failing tests for the boot recovery
5. Task 2 GREEN: `f6d6257` roll back interrupted migrations and report them under the same operation
6. Task 2 changelog: `afc9047` Phase 22 changelog entries

**Plan metadata:** the docs commit of this SUMMARY with STATE.md, ROADMAP.md and REQUIREMENTS.md.

## RED evidence (semantic assessment)

- Task 1: the journal and ledger test files failed at module resolution (the RED commit holds only tests); the operation-service journal cases failed on the planned assertions (no journal write, execute still called after a failing write). The shared schema tests were written alongside the schema (a few lines), so they have no separate RED.
- Task 2: `recoverInterrupted is not a function`, `rollbackInterrupted is not a function`, and the recovery-service module missing. The formal `gsd_run check tdd-red-evidence` record was not produced (tasks are `tdd="true"` inside a non-`type: tdd` plan).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Recovery text claimed "rolled back" without verification**
- **Found during:** Task 2
- **Issue:** The plan fixes the error text "Docktor restarted during the migration, so the migration was rolled back." for every recovered operation, including ones whose report ends `failed` (restart unverified, restart failed, original left aside). That sentence would state an outcome the report does not verify, which D-07 forbids.
- **Fix:** The exact plan text is used when the report maps to `rolled_back`. Otherwise the error says "Docktor restarted during the migration. The migration was stopped and rolled back as far as Docktor could verify; see the rollback report." plus the old stack's restart error when there is one. Tests cover both.
- **Files modified:** server/src/application/migration-operation-service.ts
- **Committed in:** f6d6257

**2. [Rule 2 - Missing critical] The operation service logs through an injected logger**
- **Found during:** Task 1
- **Issue:** The service used `console.error` for an unexpected rejection; the 22-07 convention is an injected logger (#108), and the new journal failures need one.
- **Fix:** The sixth constructor parameter `logger` (default `console`) now carries every log line of the service, including the pre-existing rejection log.
- **Committed in:** 1f6f0ef

**Total deviations:** 2 auto-fixed (1 Rule 1, 1 Rule 2). **Impact:** none on scope; the first only makes the recovery wording honest.

### Residual risks (accepted by the plan's design, recorded here)

- A crash in the instant between a side effect that is recorded after it (the rename aside, the directory, the record) and the journal write that follows it leaves that single side effect unjournalled; recovery then cannot undo it. The stop and the deploy are recorded before their side effects, so the destructive ones are covered; the rename aside is the notable case (the original stays under its `-pre-migration` name, visible in the import scan).
- A rollback that throws during recovery removes its journal (per the plan), so it is not retried on the next boot; the operation ends failed with the reason.
- The operation snapshot in the journal is the one from the start, so a recovered operation's `startedAt`, name and flags are right but the step history before the restart is not kept.

## Issues Encountered

- Per the user's memory rule, no full `tsc --build`, integration, Playwright or full suites were run locally. Run instead: `corepack yarn workspace @docktor/shared build`, shared `migration-operation` tests (41), a combined server unit run of the journal, ledger, recovery, operation-service, migration-service, rollback-runner, brownfield-routes and layering tests (8 files, 550 tests, green), and `tsc --noEmit -p server` (zero errors, about 26 s, run before the recovery commit and again clean after it). `yarn typecheck` across all workspaces, the full server suite and any real-Docker restart test are left to GitHub Actions CI.
- The `PLAN_START_TIME` was not captured at spawn; the start time above is approximated from the first commit.

## Known Stubs

None.

## Threat Flags

None. The new surface (a file journal read at boot that drives a rollback) is exactly T-22-22 to T-22-24 of the plan: Zod-validated versioned documents, id pattern checked before any path join, slug-validated stack ids in ledger entries, directory 0700 and files 0600, invalid files set aside, `prepare()` never rejecting and `run()` started after listen without being awaited.

## Verification

- Task 1 verify (shared build, shared migration-operation, server journal, ledger, operation-service, layering): pass.
- Task 2 verify (recovery service, operation-service, migration-service, layering): pass.
- Acceptance greps: `implements MigrationJournalPort` 1, `new JournaledMigrationLedger(` 1, `migrationJournalSchema` in shared 2, `persisting them would only keep stale` 0, `migrationRecoveryService.prepare(` in index.ts 1, `rollbackInterrupted(` in the operation service 1, changelog issue-link lines 13 (at least 9 required).
- CI-only: `yarn typecheck`, the full server suite including integration tests, real-Docker restart behaviour with a collision-proof random project name.

## Self-Check: PASSED

## Next Phase Readiness

- This is the last plan of Phase 22: the orchestrator handles phase verification and completion. The phase PR closes #100, #101, #102, #103, #104, #105, #107, #108 and #109.
- Verifier note: first green CI run must show the `linux-root-migration` job executed (not skipped) and the full server and shared suites; D6 (real restart recovery on a live daemon) is a human/CI judgment item.

---
*Phase: 22-migration-hardening*
*Completed: 2026-10-23*
