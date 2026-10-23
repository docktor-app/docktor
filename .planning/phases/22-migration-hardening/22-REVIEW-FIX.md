---
phase: 22-migration-hardening
fixed_at: 2026-10-23T17:30:00Z
review_path: .planning/phases/22-migration-hardening/22-REVIEW.md
iteration: 1
findings_in_scope: 12
fixed: 12
skipped: 0
status: all_fixed
---

# Phase 22: Code Review Fix Report

**Fixed at:** 2026-10-23
**Source review:** `.planning/phases/22-migration-hardening/22-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 12 (3 critical, 9 warning; Info findings are out of scope for `critical_warning`)
- Fixed: 12 (9 are logic changes flagged "fixed: requires human verification"; WR-03 and WR-04 were fixed in part, see their notes)
- Skipped: 0

**Verification:** run in the isolated worktree (`/home/raphael/workspace/docktor/.claude/worktrees/bridge-cse_01GoBQizyDtQbVBYvsPj9rQt`, `workflow.use_worktrees` handling: the session already ran in a dedicated worktree, so no nested worktree was created). Targeted vitest runs for every touched test file (shared: mask-secrets and migration-operation; server: application, domain, infrastructure and lib unit projects; client: `secret-mask.test.ts`). A scoped `tsc --noEmit` over the touched server source files (plus their imports) reported no errors. No full `tsc --build`, integration tests or Playwright runs were done, per the host constraint; CI must run those.

## Fixed Issues

### CR-01: Replaying a journal after a crash during rollback deletes the restored original directory

**Status:** fixed: requires human verification
**Files modified:** `shared/src/validation/migration-operation.ts`, `server/src/application/ports/stack-filesystem-port.ts`, `server/src/infrastructure/stack-filesystem.ts`, `server/src/application/migration-rollback-runner.ts`, `server/src/application/migration-service.ts`, plus tests
**Commit:** 818ba40
**Applied fix:** The new stack directory gets an ownership marker file (`.docktor-migration-owner`, holding a per-run token) right after the exclusive mkdir. The `created_directory`, `created_record` and `deploy_started` ledger entries carry that `ownerId` (required in the schema). The rollback runner only removes the directory, deletes the record or runs `down` while the marker still holds that token, so a replay after the original was restored finds no marker and leaves it alone. The marker is released once `up` succeeds. `moved_aside` is now replay-tolerant: when the aside path is gone and the original is in place, nothing is moved and the report stays `untouched` instead of claiming `left-aside`. The record delete is skipped when the record does not exist.

### CR-02: A journal that fails to be removed is replayed on the next boot against a live stack

**Status:** fixed: requires human verification
**Files modified:** `shared/src/validation/migration-operation.ts`, `server/src/application/migration-operation-service.ts`, `server/src/application/journaled-migration-ledger.ts`, `server/src/infrastructure/migration-journal.ts`, plus tests
**Commit:** 52cef0a
**Applied fix:** Journal removal is retried 3 times with a backoff (injectable `sleep`). If it still fails, the journal is rewritten as completed (empty ledger plus `completedAt`), and `MigrationJournal.list()` ignores and removes such documents. The second protection from the review (refusing destructive compensation for something this operation did not create) is covered by the ownership marker from CR-01, which guards the record, the directory and the `down`.

### CR-03: The shared secret masker leaks secrets in common forms

**Status:** fixed: requires human verification
**Files modified:** `shared/src/secrets/mask-secrets.ts`, `server/src/application/migration-operation-service.ts`, plus tests
**Commit:** abeffe4
**Applied fix:** URL credentials now accept an empty user (`redis://:pw@host`) and mask up to the last `@` of the token, so passwords with `/` or `@` do not leak a tail. `maskSecrets` masks the continuation lines of a block scalar owned by a secret key, and flow-style maps (`environment: {DB_PASSWORD: x}`) are masked per pair. A new `maskErrorText` adds non-anchored passes for `KEY=value` and quoted JSON `"KEY": "value"` fragments; the operation service uses it for the error text and cleanup errors that are stored, listed and broadcast. Limitation: the client's per-line diff masking (`maskDiffHunks`) cannot see block-scalar continuation lines, because it works one line at a time.

### WR-01: Write-ahead journaling is not write-ahead for three of the five destructive steps

**Status:** fixed: requires human verification
**Files modified:** `server/src/application/migration-service.ts`, plus tests
**Commit:** 8fa9b78
**Applied fix:** `moved_aside`, `created_directory` and `created_record` are now recorded before the rename, the mkdir and `stackRepo.create`. Rollback tolerates an intent whose side effect never happened (aside path absent and original present leaves the original alone; unowned directory is not removed; missing record is not deleted). An `EEXIST` rejection can no longer lead to removing a foreign directory because that needs the ownership marker (CR-01).

### WR-02: Containers in `restarting` or `paused` state count as stopped

**Status:** fixed: requires human verification
**Files modified:** `server/src/domain/compose-project.ts`, `server/src/infrastructure/compose-project-resolver.ts`, plus tests
**Commit:** 9ec3631 (shared with WR-05, they touch the same functions)
**Applied fix:** `ProjectContainer` gets an optional `restartingOrPaused` flag set by the resolver. `stillRunning` and `runningServices` use the new `isActive` (running, restarting or paused), so the initial running check and `verifyStopped` no longer treat a crash-looping container as stopped. `allServicesRunning` (restore verification) stays strict on `running`.

### WR-03: Journal schema and `slugify` disagree

**Status:** fixed (partial: see note)
**Files modified:** `server/src/lib/slugify.ts`, `server/src/infrastructure/migration-journal.ts`, plus tests
**Commit:** fb09fa6
**Applied fix:** `slugify` trims trailing hyphens again after the 63-character cut. `MigrationJournal.write` validates the document with `migrationJournalSchema` before writing, so an unreadable journal fails the run at the write-ahead point, before the next side effect.
**Note:** The third suggestion (surface `.invalid` journals as a visible failed operation, not only a console line) was not done. An unparsable file has no reliable operation data to build an operation from, so this needs a product decision on what to show.

### WR-04: A converted stack-root bind mount copies the old compose file into the new stack

**Status:** fixed (partial: see note), requires human verification
**Files modified:** `server/src/application/migration-service.ts`, plus tests
**Commit:** ab3f166
**Applied fix:** After the bind copies, the compose file names (`docker-compose.yml/.yaml`, `compose.yml/.yaml`) are removed from the NEW stack directory, before the rewritten `docker-compose.yml` is written. Only the copy is touched; the original or aside directory is never modified.
**Note:** The second half (adding the stack-root destination to the collision check, treating it as containing every other destination) was not done. That would refuse combinations that work today (a root mount together with a separate converted data mount). The remaining merge hazard is a root copy that brings an old `volumes/` or `pre-migration-backup/` into the new directory.

### WR-05: Rollback can report `not-stopped` for an old stack Docktor did stop

**Status:** fixed: requires human verification
**Files modified:** `server/src/domain/compose-project.ts`, `server/src/application/migration-service.ts`, plus tests
**Commit:** 9ec3631 (shared with WR-02)
**Applied fix:** The review offered "refuse up front" as one option, and that is what was done. If an active container has no compose service label, `stopOldStack` throws a `ConflictError` before anything is stopped or recorded ("Nothing was stopped"), so `runningBefore` can no longer silently drop a stopped container.

### WR-06: Rollback restart arguments come from container labels and journal data without validation

**Status:** fixed (partial: see note), requires human verification
**Files modified:** `shared/src/validation/brownfield.ts`, `shared/src/validation/migration-operation.ts`, `server/src/domain/compose-project.ts`, `server/src/application/migration-service.ts`, `server/src/infrastructure/external-stack-control.ts`, plus tests
**Commit:** 9878543
**Applied fix:** New `COMPOSE_SERVICE_NAME_PATTERN` / `composeServiceNameSchema` in shared. The journal schema validates `runningBefore` with it, the stop is refused before anything is stopped when a running service name is invalid, and `ExternalStackControl.start` / `restoreServices` re-check the names and put `--` before the service list.
**Note:** The env-allowlist and anonymous-volume limits of `restoreServices` are documented in a code comment only. Refusing the shared-project path when anonymous volumes exist was not implemented.

### WR-07: Deploy and copy steps have timeouts that are wrong for their workload

**Status:** fixed: requires human verification
**Files modified:** `server/src/infrastructure/docker-executor.ts`, `server/src/infrastructure/volume-migrator.ts`, plus tests
**Commit:** 1a0d832
**Applied fix:** `docker compose up -d` gets a 20 minute timeout (other compose commands keep 120 s). `runCommand` (`cp -a`) and the `docker run` volume copy are bounded at 4 hours; a child that outlives that is killed and rejects with a "was stopped after" error, so a hung copy ends in the rollback path. The bounds are constants, not configurable; adjust them if your largest volumes need more.

### WR-08: `void this.run(...)` has no rejection handler

**Status:** fixed
**Files modified:** `server/src/application/migration-operation-service.ts`, plus tests
**Commit:** 495d396
**Applied fix:** `run` now has a `catch` that logs the unexpected throw and ends a still-running operation as `failed` (masked error text, never throws itself), so an unexpected throw can no longer become an unhandled rejection that ends the process.

### WR-09: Recovery gives up and removes the journal even when the rollback was incomplete; shutdown does not wait for it

**Status:** fixed (partial: see note), requires human verification
**Files modified:** `shared/src/validation/migration-operation.ts`, `server/src/application/migration-operation-service.ts`, `server/src/index.ts`, plus tests
**Commit:** 3aa7774
**Applied fix:** A recovery whose report is not a verified `rolled_back` keeps its journal with `recoveryAttempts` incremented, so the next boot retries (3 attempts in all, then the journal is removed as before). The published error says the rollback will be tried again, only when the journal was actually kept. The replay is safe because of the CR-01 ownership marker. `runningOperationIds()` was added, and the graceful shutdown has a new first step that names the migrations still running.
**Note:** The shutdown does not wait for migrations or recovery. A migration can run for minutes, far past Docker's 10 s stop grace and the 9 s hard deadline, so waiting is not possible; the journal plus the ownership marker make the interruption safe instead. The shutdown budget in the comment went from 7.5 s to 8 s (new 0.5 s step).

## Skipped Issues

None.

## Side effects worth knowing

- The ledger schema changed: `created_directory`, `created_record` and `deploy_started` now require `ownerId`. A journal left on disk by a build from before this change fails validation at boot and is set aside as `.invalid`. Phase 22 is unreleased, so this should not matter in practice.
- `StackFilesystemPort` has three new methods (`claimDirectory`, `releaseDirectory`, `ownsDirectory`); any other fake that implements the whole port needs them.
- `slugify` no longer returns a slug with a trailing hyphen after the 63-character cut; a name of that exact shape now maps to a different stack id than before.
- `server/test/unit/application/migration-service.test.ts` was seen once with a single unhandled-rejection error (a 400 `BadRequestError` from a refusal test) in 1 of 4 runs; it did not reproduce in the next 3 runs and every test passed each time. It was not investigated further.

---

_Fixed: 2026-10-23_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
