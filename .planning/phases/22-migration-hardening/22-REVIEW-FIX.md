---
phase: 22-migration-hardening
fixed_at: 2026-10-24T00:30:00Z
review_path: .planning/phases/22-migration-hardening/22-REVIEW.md
iteration: 2
findings_in_scope: 18
fixed: 17
skipped: 1
status: partial
---

# Phase 22: Code Review Fix Report

**Fixed at:** 2026-10-24
**Source review:** `.planning/phases/22-migration-hardening/22-REVIEW.md`
**Iteration:** 2 (iteration 1 fixed CR-01..03 and WR-01..09; iteration 2 added IN-01..06 with `fix_scope: all`)

**Summary:**
- Findings in scope: 18 (3 critical, 9 warning, 6 info)
- Fixed: 17 (12 from iteration 1, of which 9 are logic changes flagged "fixed: requires human verification" and WR-03, WR-04, WR-06, WR-09 were fixed in part; 5 from iteration 2: IN-01, IN-02, IN-03, IN-04, IN-06, with IN-06 fixed in part)
- Skipped: 1 (IN-05, already satisfied by the current workflow)

**Verification:** run in the isolated worktree (`/home/raphael/workspace/docktor/.claude/worktrees/bridge-cse_01GoBQizyDtQbVBYvsPj9rQt`, `workflow.use_worktrees` handling: the session already ran in a dedicated worktree, so no nested worktree was created). Targeted vitest runs for every touched test file (shared: mask-secrets and migration-operation; server: application, domain, infrastructure and lib unit projects; client: `secret-mask.test.ts`). A scoped `tsc --noEmit` over the touched server source files (plus their imports) reported no errors. No full `tsc --build`, integration tests or Playwright runs were done, per the host constraint; CI must run those.

**Iteration 2 verification:** also run in the same worktree (the session's dedicated worktree; no nested worktree). Targeted vitest runs of every touched test file (server: `migration-service`, `migration-rollback-runner`, `migration-operation-service`, `migration-recovery-service`, `migration-journal`; client: `diff-confirm-dialog`, `migration-progress`), each new test seen failing before its fix. `tsc --noEmit -p tsconfig.json` for the `server` and `client` workspaces reported no errors (a project-scoped no-emit check, not `tsc --build`).

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

### IN-01: `assertWithin` and destination checks are lexical, not realpath-based

**Status:** fixed: requires human verification
**Files modified:** `server/src/application/migration-service.ts`, `server/test/unit/application/migration-service.test.ts`
**Commit:** 87b466e
**Applied fix:** `copyBindMounts` now also resolves the deepest existing part of each destination with `fs.realpath` and confines it to the real new stack directory (`assertRealpathWithin`) before it copies. A symlink brought along by the stack-root copy that redirects a later destination outside the stack is refused, the migration rolls back and nothing is written outside. A dangling symlink on the path is refused as well, because the copy would write through it. The new test copies a symlink into the stack in the first copy and checks that the second copy is refused and the outside directory stays empty.
**Note:** Only the bind-copy destinations are covered. The named-volume destinations sit below `volumes/`, which Docktor creates itself right before, so no copied symlink can precede them.

### IN-02: Extracted secrets are written to `.env` with default (world-readable) mode

**Status:** fixed
**Files modified:** `server/src/application/migration-service.ts`, `server/test/unit/application/migration-service.test.ts`
**Commit:** 16c965f
**Applied fix:** The merged `.env` (old content plus the extracted block) is written with mode `0o600` and then `chmod`ed to `0o600`, because the mode only applies at creation and the stack-root copy may already have brought a `.env` along. The verbatim `copyFile` branch is unchanged: it keeps the old file's mode.

### IN-03: Unchecked cast without justification in `DiffConfirmDialog`

**Status:** fixed
**Files modified:** `client/src/components/domain/stack/diff-confirm-dialog.tsx`
**Commit:** 98ac228
**Applied fix:** `isAnchored` is now a type predicate (`finding is AnchoredFinding`, `ReviewFinding & {line: number}`), so the `line as number` cast is gone. A pure type-level change; the existing dialog tests cover the behaviour.

### IN-04: A succeeded operation without `stackId` is shown as a failure

**Status:** fixed
**Files modified:** `client/src/lib/migration-progress.ts`, `client/test/unit/lib/migration-progress.test.ts`
**Commit:** 1d04b86
**Applied fix:** A `succeeded` operation always renders the success toast. The "View stack" action is added only when `result.stackId` exists, instead of falling through to the "Migration of X failed" wording.

### IN-06: Minor robustness and quality notes

**Status:** fixed (partial: see note)
**Files modified:** `server/src/infrastructure/migration-journal.ts`, `server/src/application/migration-progress.ts`, `server/src/application/migration-rollback-runner.ts`, `server/src/application/migration-service.ts`, `server/src/application/migration-operation-service.ts`, plus tests
**Commit:** 64842c2
**Applied fix:**
- Journal durability: after the rename, `MigrationJournal.write` fsyncs the journal directory (best effort on platforms that cannot sync a directory), so the rename survives a power loss.
- Logged errors: new `loggableErrorMessage` (the error text through `maskErrorText`) is used for the migration log lines in the service, the rollback runner and the operation service, so compose stderr that echoes a secret no longer reaches the console. The stored and broadcast `cleanupErrors` and `restartError` were already masked in the operation service.
- Indentation: the space-indented `return` in `unmeasurableSizeMessage` (`migration-service.ts`) now uses a tab like the rest of the file.
**Note:** Two sub-items were not done. The floating `alpine` image in `volume-migrator.ts` and `disk-space-probe.ts` was neither pinned nor pre-pulled: a digest has to be chosen and maintained by the project, and a pre-pull in preflight changes the offline behaviour, so this needs a decision. The "mixed indentation in `migration-rollback-runner.ts`" remark did not apply: that file is consistently indented with four spaces (the file's own style), so nothing was changed there.

## Skipped Issues

### IN-05: CI additions

**File:** `.github/workflows/ci.yml:126-157`
**Reason:** The workflow already satisfies the finding. Every job pins its actions by SHA (including the older ones), there is a top-level `permissions: contents: read` block, and in `linux-root-migration` only the final `vitest` command runs under `sudo` (install, build and the other steps run as the normal runner user). The remaining point (`yarn` as the process under `sudo -E`) is needed to run the ownership test as root and affects a throwaway runner only, so no change was made.
**Original issue:** The new job pins actions by SHA while others float, runs `yarn` as root through `sudo -E`, and sets no `permissions:` block.

## Side effects worth knowing

- The ledger schema changed: `created_directory`, `created_record` and `deploy_started` now require `ownerId`. A journal left on disk by a build from before this change fails validation at boot and is set aside as `.invalid`. Phase 22 is unreleased, so this should not matter in practice.
- `StackFilesystemPort` has three new methods (`claimDirectory`, `releaseDirectory`, `ownsDirectory`); any other fake that implements the whole port needs them.
- `slugify` no longer returns a slug with a trailing hyphen after the 63-character cut; a name of that exact shape now maps to a different stack id than before.
- `server/test/unit/application/migration-service.test.ts` was seen once with a single unhandled-rejection error (a 400 `BadRequestError` from a refusal test) in 1 of 4 runs; it did not reproduce in the next 3 runs and every test passed each time. It was not investigated further.

---

_Fixed: 2026-10-24_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
